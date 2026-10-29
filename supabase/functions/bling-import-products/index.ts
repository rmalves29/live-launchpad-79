// Edge Function: bling-import-products
// Importa produtos do Bling para o Cartzy (nunca escreve no Bling).
// Ações:
//   preview: lista uma página de produtos do Bling (filtros: busca, loja) e diz o que é novo, o que já existe e o que já está vinculado.
//   import:  cria no Cartzy os produtos escolhidos (até 8 por chamada, por causa do limite de 3 req/s da API do Bling).
// Regras: produto com variação (formato V) vira um produto pai + um produto filho por variação; o saldo vem do depósito
// escolhido na integração; o código do Bling vai para sku_erp; produto que já existe é só vinculado, nunca sobrescrito.
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeTenantCaller, guardResponse } from "../_shared/auth-guard.ts";
import { makeProductCodeAllocator } from "../_shared/next-product-code.ts";
import { resolveBlingImage } from "../_shared/bling-image.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BLING = "https://api.bling.com.br/Api/v3";
const PAGE_SIZE = 50;
const MAX_IMPORT = 8;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- token ----------
async function refreshToken(supabase: any, integ: any): Promise<string | null> {
  if (!integ.refresh_token || !integ.client_id || !integ.client_secret) return null;
  try {
    const res = await fetch(`${BLING}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", 'enable-jwt': '1', Authorization: `Basic ${btoa(`${integ.client_id}:${integ.client_secret}`)}` },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: integ.refresh_token }),
    });
    if (!res.ok) return null;
    const t = await res.json();
    await supabase.from("integration_bling").update({
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("tenant_id", integ.tenant_id);
    return t.access_token;
  } catch {
    return null;
  }
}

async function validToken(supabase: any, integ: any): Promise<string | null> {
  if (integ.token_expires_at && new Date(integ.token_expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
    return (await refreshToken(supabase, integ)) || integ.access_token;
  }
  return integ.access_token;
}

// ---------- chamadas ao Bling (3 req/s: espaçamento + nova tentativa no 429) ----------
async function blingGet(token: string, path: string): Promise<{ ok: boolean; status: number; data: any }> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await sleep(380);
    const res = await fetch(`${BLING}${path}`, { headers: { 'enable-jwt': '1', Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (res.status === 429 && attempt < 4) { await sleep(1200 * attempt); continue; }
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }
  return { ok: false, status: 429, data: {} };
}

// Saldo disponível (virtual) de cada produto no depósito escolhido
async function depositBalances(token: string, depositId: number, ids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!ids.length) return out;
  const qs = ids.map((i) => `idsProdutos[]=${i}`).join("&");
  const r = await blingGet(token, `/estoques/saldos?${qs}`);
  if (!r.ok) return out;
  for (const s of r.data?.data || []) {
    const dep = (s.depositos || []).find((d: any) => String(d.id) === String(depositId));
    out.set(Number(s.produto?.id), Number(dep ? dep.saldoVirtual : 0) || 0);
  }
  return out;
}

// "Cor:Dourado;Tamanho:P" -> { color, size, label }
function parseVariation(raw: string) {
  const attrs: Record<string, string> = {};
  for (const part of String(raw || "").split(";")) {
    const i = part.indexOf(":");
    if (i > 0) attrs[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  const color = attrs["cor"] || attrs["color"] || null;
  const size = attrs["tamanho"] || attrs["size"] || attrs["numero"] || attrs["número"] || null;
  const values = Object.values(attrs).filter(Boolean);
  return { color, size, label: values.length ? values.join(" / ") : String(raw || "").trim() };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const tenantId = String(body.tenant_id || "");
    const action = String(body.action || "preview");
    if (!tenantId) return json({ error: "tenant_id obrigatório" }, 400);

    const guard = await authorizeTenantCaller(req, supabase, tenantId);
    if (!guard.ok) return guardResponse(guard, corsHeaders);

    const { data: integ } = await supabase.from("integration_bling").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (!integ?.access_token || !integ.is_active) return json({ error: "Bling não autorizado ou inativo para esta empresa." }, 400);
    const depositId = Number(integ.bling_deposit_id) || 0;
    if (!depositId) return json({ error: "Escolha o depósito do estoque na integração do Bling antes de importar." }, 400);
    const token = await validToken(supabase, integ);
    if (!token) return json({ error: "Token do Bling expirado. Autorize o Bling novamente." }, 401);

    // ======================= PRÉVIA =======================
    if (action === "preview") {
      const page = Math.max(1, Math.floor(Number(body.page) || 1));
      const search = String(body.search || "").trim().slice(0, 80);
      const storeId = Number(body.store_id) || 0;
      // só_estoque (padrão): lista apenas o que tem saldo no depósito escolhido. Desligado: todos os produtos ativos do Bling.
      const onlyStock = body.only_stock !== false;
      let path = `/produtos?pagina=${page}&limite=${PAGE_SIZE}&criterio=2`;
      if (onlyStock) path += `&filtroSaldoEstoque=1&filtroSaldoEstoqueDeposito=${depositId}`;
      if (storeId) path += `&idLoja=${storeId}`;
      const list = await blingGet(token, search ? `${path}&nome=${encodeURIComponent(search)}` : path);
      if (!list.ok) {
        const msg = list.status === 401 ? "Token do Bling expirado. Autorize o Bling novamente." : list.data?.error?.description || `Erro ${list.status} ao listar produtos do Bling`;
        return json({ error: msg }, list.status === 401 ? 401 : 400);
      }
      const raw: any[] = [...(list.data?.data || [])];
      // A busca também aceita o SKU (código do produto no Bling): junta o que casar pelo código exato.
      if (search && page === 1) {
        const bySku = await blingGet(token, `${path}&codigos[]=${encodeURIComponent(search)}`);
        if (bySku.ok) {
          const seen = new Set(raw.map((p) => Number(p.id)));
          for (const p of bySku.data?.data || []) if (!seen.has(Number(p.id))) raw.push(p);
        }
      }
      const named = (p: any) => String(p.nome || "").trim() && String(p.codigo || "").trim();
      let rows: any[] = raw.filter((p) => !p.idProdutoPai && named(p)).map((p) => ({ ...p, children_count: null as number | null }));

      // Com filtro de saldo (ou busca pelo SKU de uma variação), o Bling devolve as variações (filhos) e não o pai: montamos a linha do pai a partir dos filhos.
      {
        const kids = raw.filter((p) => p.idProdutoPai);
        const perParent = new Map<number, number>();
        for (const k of kids) perParent.set(Number(k.idProdutoPai), (perParent.get(Number(k.idProdutoPai)) || 0) + 1);
        const parentIds = [...perParent.keys()].filter((pid) => !rows.some((r) => Number(r.id) === pid));
        if (parentIds.length) {
          const pr = await blingGet(token, `/produtos?limite=${PAGE_SIZE}&criterio=5&${parentIds.map((i) => `idsProdutos[]=${i}`).join("&")}`);
          for (const p of pr.data?.data || []) {
            if (named(p)) rows.push({ ...p, children_count: perParent.get(Number(p.id)) || 0 });
          }
        }
      }
      const ignored = raw.length - rows.length;

      // o que já existe no Cartzy
      const ids = rows.map((p) => Number(p.id));
      const codes = rows.map((p) => String(p.codigo).trim());
      const byId = new Map<number, any>(), byCode = new Map<string, any>();
      if (rows.length) {
        const quoted = codes.map((c) => `"${c.replace(/"/g, "")}"`).join(",");
        const { data: linked } = await supabase.from("products").select("id, code, sku_erp, bling_product_id").eq("tenant_id", tenantId).in("bling_product_id", ids);
        for (const p of linked || []) byId.set(Number(p.bling_product_id), p);
        const { data: sameCode } = await supabase.from("products").select("id, code, sku_erp, bling_product_id").eq("tenant_id", tenantId).or(`code.in.(${quoted}),sku_erp.in.(${quoted})`);
        for (const p of sameCode || []) { if (p.code) byCode.set(String(p.code).toLowerCase(), p); if (p.sku_erp) byCode.set(String(p.sku_erp).toLowerCase(), p); }
      }

      const simpleIds = rows.filter((p) => p.formato !== "V").map((p) => Number(p.id));
      const balances = await depositBalances(token, depositId, simpleIds);

      const out = rows.map((p) => {
        const id = Number(p.id);
        const linkedRow = byId.get(id);
        const sameRow = byCode.get(String(p.codigo).trim().toLowerCase());
        return {
          bling_id: id,
          codigo: String(p.codigo).trim(),
          nome: String(p.nome).trim(),
          preco: Number(p.preco) || 0,
          formato: p.formato || "S",
          saldo: p.formato === "V" ? null : balances.get(id) ?? 0,
          children_count: p.children_count,
          imagem: p.imagemURL || null,
          status: linkedRow ? "vinculado" : sameRow ? "existe" : "novo",
          cartzy_id: linkedRow?.id ?? sameRow?.id ?? null,
        };
      });
      return json({ ok: true, page, has_more: raw.length >= PAGE_SIZE, ignored, deposit_id: depositId, only_stock: onlyStock, rows: out });
    }

    // ======================= IMPORTAÇÃO =======================
    if (action === "import") {
      const ids: number[] = (Array.isArray(body.bling_ids) ? body.bling_ids : []).map(Number).filter((n: number) => Number.isFinite(n) && n > 0).slice(0, MAX_IMPORT);
      if (!ids.length) return json({ error: "Nenhum produto selecionado." }, 400);
      const saleType = ["BAZAR", "LIVE", "AMBOS"].includes(String(body.sale_type)) ? String(body.sale_type) : "AMBOS";

      // SKU do sistema (code) = próxima sequência C001, C002...; o código do Bling fica só em sku_erp
      const nextCode = await makeProductCodeAllocator(supabase, tenantId);
      // mesmo código/SKU de um produto do Cartzy que ainda não tem ID do Bling: só vincula
      const findLinkable = async (codigo: string) => {
        const c = codigo.replace(/"/g, "");
        const { data } = await supabase.from("products").select("id, bling_product_id").eq("tenant_id", tenantId).is("bling_product_id", null).or(`code.eq."${c}",sku_erp.eq."${c}"`).limit(1);
        return data?.[0] || null;
      };

      const results: any[] = [];
      for (const id of ids) {
        try {
          const { data: already } = await supabase.from("products").select("id").eq("tenant_id", tenantId).eq("bling_product_id", id).maybeSingle();
          if (already) { results.push({ bling_id: id, status: "ja_vinculado", cartzy_id: already.id }); continue; }

          const det = await blingGet(token, `/produtos/${id}`);
          if (!det.ok) { results.push({ bling_id: id, status: "erro", error: det.data?.error?.description || `Erro ${det.status} ao ler o produto no Bling` }); continue; }
          const d = det.data?.data || {};
          const codigo = String(d.codigo || "").trim();
          const nome = String(d.nome || "").trim();
          if (!codigo || !nome) { results.push({ bling_id: id, status: "erro", error: "Produto sem nome ou código no Bling." }); continue; }

          const isParent = d.formato === "V" && Array.isArray(d.variacoes) && d.variacoes.length > 0;
          const nodes: any[] = isParent ? d.variacoes : [d];
          const balances = await depositBalances(token, depositId, nodes.map((n) => Number(n.id)));
          const image = await resolveBlingImage(supabase, tenantId, id, d);
          const active = d.situacao !== "I";

          // vínculo com produto que já existe no Cartzy
          const link = await findLinkable(codigo);
          if (link) {
            await supabase.from("products").update({ bling_product_id: id, sku_erp: codigo, updated_at: new Date().toISOString() }).eq("id", link.id);
            results.push({ bling_id: id, status: "vinculado", cartzy_id: link.id, note: isParent ? "Variações não importadas: o produto já existia no Cartzy." : undefined });
            continue;
          }

          const prices = nodes.map((n) => Number(n.preco) || 0).filter((n) => n > 0);
          const parentPrice = isParent ? (prices.length ? Math.min(...prices) : 0) : Number(d.preco) || 0;
          const stockOf = (nid: number) => Math.max(0, Math.floor(balances.get(nid) ?? 0));

          const { data: parentRow, error: pErr } = await supabase.from("products").insert({
            tenant_id: tenantId,
            code: nextCode(),
            name: nome.slice(0, 200),
            price: parentPrice,
            stock: isParent ? 0 : stockOf(id), // pai de variações fica sem estoque: ele fica oculto para venda
            is_active: active,
            image_url: image,
            sale_type: saleType,
            bling_product_id: id,
            sku_erp: codigo,
          }).select("id").single();
          if (pErr || !parentRow) { results.push({ bling_id: id, status: "erro", error: pErr?.message || "Falha ao criar o produto" }); continue; }

          let children = 0;
          if (isParent) {
            for (const n of nodes) {
              const nid = Number(n.id);
              const ncode = String(n.codigo || "").trim() || `${codigo}-${nid}`;
              const v = parseVariation(n.variacao?.nome || "");
              const childImg = (n.midia ? await resolveBlingImage(supabase, tenantId, nid, n) : null) || image;
              const { error: cErr } = await supabase.from("products").insert({
                tenant_id: tenantId,
                code: nextCode(),
                name: `${nome} - ${v.label || ncode}`.slice(0, 200),
                price: Number(n.preco) || parentPrice,
                stock: stockOf(nid),
                is_active: n.situacao !== "I" && active,
                image_url: childImg,
                sale_type: saleType,
                color: v.color,
                size: v.size,
                parent_product_id: parentRow.id,
                bling_product_id: nid,
                sku_erp: ncode,
              });
              if (!cErr) children++;
            }
          }
          results.push({ bling_id: id, status: "criado", cartzy_id: parentRow.id, children });
        } catch (e) {
          results.push({ bling_id: id, status: "erro", error: String((e as any)?.message || e) });
        }
      }
      return json({ ok: true, results });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    console.error("[bling-import-products]", e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
