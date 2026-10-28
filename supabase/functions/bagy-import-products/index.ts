// Edge Function: bagy-import-products
// Importa produtos da Bagy (API Dooca) para o Cartzy (nunca escreve na Bagy).
// Ações:
//   preview: lista uma página de produtos da Bagy (filtros: busca, só com estoque) e diz o que é novo, o que já existe e o que já está vinculado.
//   import:  cria no Cartzy os produtos escolhidos.
// Regras (iguais às do Bling): produto com mais de uma variação vira um produto pai + um filho por variação; o SKU da Bagy
// vai para sku_erp; o código do sistema (code) é a próxima sequência C001, C002...; produto que já existe é só vinculado,
// nunca sobrescrito. O estoque de cada variação é o disponível da Bagy (saldo menos reservado).
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeTenantCaller, guardResponse } from "../_shared/auth-guard.ts";
import { makeProductCodeAllocator } from "../_shared/next-product-code.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BAGY = "https://api.dooca.store";
const MAX_IMPORT = 8;
const MAX_PAGES_PER_PREVIEW = 4; // sem filtro de estoque na API: junta algumas páginas até achar produtos

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function bagyGet(token: string, path: string): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${BAGY}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const listOf = (d: any): any[] => {
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.products)) return d.products;
  if (d && typeof d === "object" && d.id && d.name) return [d];
  return [];
};

const errMsg = (r: { status: number; data: any }) =>
  r.status === 401 || r.status === 403
    ? "A Bagy recusou o token (401/403). Gere um novo token no painel da Bagy e salve de novo."
    : r.data?.message || r.data?.error || `Erro ${r.status} ao falar com a Bagy`;

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Estoque disponível da variação = saldo menos o que está reservado em pedidos abertos
const availableOf = (v: any) => Math.max(0, Math.floor(num(v?.balance) - num(v?.reserved_balance)));

const ownSku = (o: any): string => String(o?.sku || o?.reference || "").trim();
// SKU da variação; produto de uma variação só (ou sem variações) pode trazer o SKU no próprio produto
const skuOf = (v: any, p?: any, count = 2): string => ownSku(v) || (count <= 1 ? ownSku(p) : "");
// Mostra só campos de código (nunca dados do cliente) para diagnosticar quando a Bagy não devolve SKU
const peek = (o: any) => ({
  campos: o && typeof o === "object" ? Object.keys(o).slice(0, 40) : [],
  sku: o?.sku ?? null, reference: o?.reference ?? null, gtin: o?.gtin ?? null, mpn: o?.mpn ?? null, external_id: o?.external_id ?? null,
});

// A documentação não detalha o formato da imagem na resposta: aceita texto ou objeto com src/url/link
function imageOf(obj: any): string | null {
  const imgs = obj?.images;
  const first = Array.isArray(imgs) ? imgs[0] : null;
  if (!first) return null;
  if (typeof first === "string") return first;
  return first.src || first.url || first.link || first.original || first.large || first.medium || null;
}

function variationLabel(v: any): { label: string; color: string | null; size: string | null } {
  const color = v?.color?.name ? String(v.color.name) : null;
  const attrs = [v?.attribute, v?.attribute_secondary].filter((a) => a && a.name);
  const sizeAttr = attrs.find((a) => /tam|size|n[uú]mero/i.test(String(a.attribute_name || "")));
  const size = sizeAttr ? String(sizeAttr.name) : null;
  const parts = [color, ...attrs.map((a) => String(a.name))].filter(Boolean) as string[];
  return { label: parts.join(" / "), color, size };
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

    const { data: integ } = await supabase.from("integration_bagy").select("access_token, is_active").eq("tenant_id", tenantId).maybeSingle();
    if (!integ?.access_token || !integ.is_active) return json({ error: "Bagy não configurada ou inativa para esta empresa." }, 400);
    const token = integ.access_token as string;

    // ======================= PRÉVIA =======================
    if (action === "preview") {
      const startPage = Math.max(1, Math.floor(num(body.page)) || 1);
      const search = String(body.search || "").trim().slice(0, 80);
      const onlyStock = body.only_stock !== false;

      const collected: any[] = [];
      let page = startPage;
      let hasMore = false;
      let scanned = 0;
      for (let i = 0; i < MAX_PAGES_PER_PREVIEW; i++) {
        let path = `/products?page=${page}&active=1`;
        if (search) path += `&name=${encodeURIComponent(search)}`;
        const r = await bagyGet(token, path);
        if (!r.ok) return json({ error: errMsg(r) }, r.status === 401 || r.status === 403 ? 401 : 400);
        const items = listOf(r.data);
        scanned += items.length;
        for (const p of items) {
          const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
          const total = vars.reduce((s, v) => s + availableOf(v), 0);
          if (onlyStock && total <= 0) continue;
          collected.push({ p, vars, total });
        }
        const last = num(r.data?.meta?.last_page);
        const current = num(r.data?.meta?.current_page) || page;
        hasMore = last ? current < last : items.length >= 25;
        page = current + 1;
        if (!hasMore || collected.length >= 10) break;
      }

      // o que já existe no Cartzy
      const ids = collected.map((c) => Number(c.p.id));
      const codes = [...new Set(collected.flatMap((c) => [ownSku(c.p), ...c.vars.map((v: any) => skuOf(v, c.p, c.vars.length))]).filter(Boolean))];
      const byId = new Map<number, any>();
      const byCode = new Map<string, any>();
      if (ids.length) {
        const { data: linked } = await supabase.from("products").select("id, bagy_product_id").eq("tenant_id", tenantId).is("parent_product_id", null).in("bagy_product_id", ids);
        for (const p of linked || []) byId.set(Number(p.bagy_product_id), p);
      }
      if (codes.length) {
        const quoted = codes.map((c) => `"${c.replace(/"/g, "")}"`).join(",");
        const { data: sameCode } = await supabase.from("products").select("id, code, sku_erp").eq("tenant_id", tenantId).or(`code.in.(${quoted}),sku_erp.in.(${quoted})`);
        for (const p of sameCode || []) {
          if (p.code) byCode.set(String(p.code).toLowerCase(), p);
          if (p.sku_erp) byCode.set(String(p.sku_erp).toLowerCase(), p);
        }
      }

      const rows = collected.map(({ p, vars, total }) => {
        const id = Number(p.id);
        const linkedRow = byId.get(id);
        const sameRow = [ownSku(p), ...vars.map((v: any) => skuOf(v, p, vars.length))].filter(Boolean).map((c) => byCode.get(c.toLowerCase())).find(Boolean);
        return {
          bagy_id: id,
          codigo: ownSku(p) || skuOf(vars[0], p, vars.length) || "—",
          nome: String(p.name || "").trim(),
          preco: num(p.price),
          formato: vars.length > 1 ? "V" : "S",
          saldo: vars.length > 1 ? null : total,
          children_count: vars.length > 1 ? vars.length : null,
          imagem: imageOf(p) || imageOf(vars[0]),
          status: linkedRow ? "vinculado" : sameRow ? "existe" : "novo",
          cartzy_id: linkedRow?.id ?? sameRow?.id ?? null,
        };
      });
      const semSku = rows.filter((r) => r.codigo === "—").length;
      const debug = semSku && collected[0] ? { sem_sku: semSku, produto: peek(collected[0].p), variacao: peek(collected[0].vars[0]) } : null;
      return json({ ok: true, next_page: page, has_more: hasMore, scanned, rows, debug });
    }

    // ======================= IMPORTAÇÃO =======================
    if (action === "import") {
      const ids: number[] = (Array.isArray(body.bagy_ids) ? body.bagy_ids : []).map(Number).filter((n: number) => Number.isFinite(n) && n > 0).slice(0, MAX_IMPORT);
      if (!ids.length) return json({ error: "Nenhum produto selecionado." }, 400);
      const saleType = ["BAZAR", "LIVE", "AMBOS"].includes(String(body.sale_type)) ? String(body.sale_type) : "AMBOS";

      // SKU do sistema (code) = próxima sequência C001, C002...; o SKU da Bagy fica só em sku_erp
      const nextCode = await makeProductCodeAllocator(supabase, tenantId);
      // mesmo código/SKU de um produto do Cartzy que ainda não tem ID da Bagy: só vincula
      const findLinkable = async (codes: string[]) => {
        const list = codes.filter(Boolean).map((c) => `"${c.replace(/"/g, "")}"`).join(",");
        if (!list) return null;
        const { data } = await supabase.from("products").select("id").eq("tenant_id", tenantId).is("bagy_product_id", null).or(`code.in.(${list}),sku_erp.in.(${list})`).limit(1);
        return data?.[0] || null;
      };

      const results: any[] = [];
      for (const id of ids) {
        try {
          const { data: already } = await supabase.from("products").select("id").eq("tenant_id", tenantId).eq("bagy_product_id", id).is("parent_product_id", null).maybeSingle();
          if (already) { results.push({ bagy_id: id, status: "ja_vinculado", cartzy_id: already.id }); continue; }

          const det = await bagyGet(token, `/products?ids=${id}`);
          if (!det.ok) { results.push({ bagy_id: id, status: "erro", error: errMsg(det) }); continue; }
          const p = listOf(det.data).find((x) => Number(x.id) === id);
          if (!p) { results.push({ bagy_id: id, status: "erro", error: "Produto não encontrado na Bagy." }); continue; }
          const nome = String(p.name || "").trim();
          if (!nome) { results.push({ bagy_id: id, status: "erro", error: "Produto sem nome na Bagy." }); continue; }

          const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
          const isParent = vars.length > 1;
          const single = vars[0] || null;
          const image = imageOf(p) || imageOf(single);
          const active = p.active !== false;

          // vínculo com produto que já existe no Cartzy (pelo SKU)
          const link = await findLinkable([ownSku(p), ...vars.map((v: any) => skuOf(v, p, vars.length))]);
          if (link) {
            await supabase.from("products").update({
              bagy_product_id: id,
              bagy_variation_id: isParent ? null : single?.id ?? null,
              sku_erp: isParent ? undefined : skuOf(single, p, vars.length) || undefined,
              updated_at: new Date().toISOString(),
            }).eq("id", link.id);
            results.push({ bagy_id: id, status: "vinculado", cartzy_id: link.id, note: isParent ? "Variações não importadas: o produto já existia no Cartzy." : undefined });
            continue;
          }

          const prices = vars.map((v) => num(v.price)).filter((n) => n > 0);
          const parentPrice = isParent ? (prices.length ? Math.min(...prices) : num(p.price)) : num(single?.price) || num(p.price);

          const { data: parentRow, error: pErr } = await supabase.from("products").insert({
            tenant_id: tenantId,
            code: nextCode(),
            name: nome.slice(0, 200),
            price: parentPrice,
            stock: isParent ? 0 : availableOf(single), // pai de variações fica sem estoque: ele fica oculto para venda
            is_active: active,
            image_url: image,
            sale_type: saleType,
            bagy_product_id: id,
            bagy_variation_id: isParent ? null : single?.id ?? null,
            sku_erp: isParent ? ownSku(p) || null : skuOf(single, p, vars.length) || null,
          }).select("id").single();
          if (pErr || !parentRow) { results.push({ bagy_id: id, status: "erro", error: pErr?.message || "Falha ao criar o produto" }); continue; }

          let children = 0;
          if (isParent) {
            for (const v of vars) {
              const lab = variationLabel(v);
              const vsku = skuOf(v, p, vars.length);
              const { error: cErr } = await supabase.from("products").insert({
                tenant_id: tenantId,
                code: nextCode(),
                name: `${nome} - ${lab.label || vsku || v.id}`.slice(0, 200),
                price: num(v.price) || parentPrice,
                stock: availableOf(v),
                is_active: v.active !== false && active,
                image_url: imageOf(v) || image,
                sale_type: saleType,
                color: lab.color,
                size: lab.size,
                parent_product_id: parentRow.id,
                bagy_product_id: id,
                bagy_variation_id: v.id,
                sku_erp: vsku || null,
              });
              if (!cErr) children++;
            }
          }
          results.push({ bagy_id: id, status: "criado", cartzy_id: parentRow.id, children });
        } catch (e) {
          results.push({ bagy_id: id, status: "erro", error: String((e as any)?.message || e) });
        }
      }
      return json({ ok: true, results });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    console.error("[bagy-import-products]", e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
