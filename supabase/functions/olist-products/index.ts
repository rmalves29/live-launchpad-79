// Olist ERP (API v3): depósito, produtos e estoque. Nesta função a Olist é só LIDA: nada é escrito no ERP.
// Ações (todas exigem usuário da empresa ou super admin):
//   deposits       lista os depósitos da Olist e devolve o escolhido.
//   set_deposit    grava o depósito de onde vem o saldo.
//   stock_page     uma página do estoque (100 produtos) já com o saldo do depósito escolhido.
//   products_page  uma página de produtos da Olist (100) com preço e tipo.
//   statuses       diz o que é novo, o que já existe (mesmo código ERP) e o que já está vinculado no Cartzy.
//   apply_stock    grava no Cartzy o saldo da Olist (chave: vínculo olist_product_id ou sku_erp = SKU da Olist).
//   catalog_load   devolve o catálogo já guardado (sem falar com a Olist).
//   catalog_save   guarda uma leva de produtos buscados; catalog_finish apaga o que sumiu da Olist.
//   images_pending lista os produtos vinculados à Olist que ainda estão sem foto no Cartzy.
//   sync_images    busca na Olist (anexos do produto) a foto de até 25 produtos e grava no Cartzy.
//   import         cria no Cartzy os produtos escolhidos (ou só vincula quando o código já existe).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeTenantCaller, guardResponse } from "../_shared/auth-guard.ts";
import { makeProductCodeAllocator, insertWithFreshCode } from "../_shared/next-product-code.ts";
import { olistRequest, olistErrorMessage } from "../_shared/olist.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const PAGE = 100;
const MAX_ITEMS = 300;

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (v: unknown) => String(v ?? "").trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// primeira foto do produto na Olist (GET /produtos/{id} traz os anexos); só aceita endereço http(s)
async function olistImage(supabase: any, tenantId: string, olistId: number): Promise<string | null> {
  const r = await olistRequest(supabase, tenantId, "GET", `/produtos/${olistId}`);
  if (!r.ok) return null;
  const anexos: any[] = r.data?.anexos || [];
  const a = anexos.map((x) => norm(x?.url)).find((u) => /^https?:\/\//i.test(u));
  return a || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = norm(body.action);
    const tenantId = norm(body.tenant_id);
    if (!tenantId) return json({ success: false, error: "tenant_id é obrigatório" }, 400);

    const guard = await authorizeTenantCaller(req, supabase, tenantId);
    if (!guard.ok) return guardResponse(guard, corsHeaders);

    const { data: integ } = await supabase
      .from("integration_olist")
      .select("is_active, status, deposit_id, deposit_name")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!integ?.is_active) return json({ success: false, error: "A Olist não está conectada para esta empresa. Autorize em Integrações > Olist ERP." });

    // ---------------- depósitos ----------------
    if (action === "deposits") {
      const r = await olistRequest(supabase, tenantId, "GET", "/depositos");
      if (!r.ok) return json({ success: false, status: r.status, error: olistErrorMessage(r.status, r.data, "os depósitos") });
      const lista: any[] = Array.isArray(r.data) ? r.data : r.data?.itens || r.data?.data || [];
      return json({
        success: true,
        deposits: lista.map((d) => ({ id: num(d.id), nome: norm(d.descricao), padrao: !!d.padrao, desconsidera_saldo: !!d.desconsideraSaldo })),
        selected: integ.deposit_id ? { id: Number(integ.deposit_id), nome: integ.deposit_name } : null,
      });
    }

    if (action === "set_deposit") {
      const id = num(body.deposit_id);
      if (!id) return json({ success: false, error: "Escolha um depósito." });
      const r = await olistRequest(supabase, tenantId, "GET", "/depositos");
      if (!r.ok) return json({ success: false, status: r.status, error: olistErrorMessage(r.status, r.data, "os depósitos") });
      const lista: any[] = Array.isArray(r.data) ? r.data : r.data?.itens || r.data?.data || [];
      const dep = lista.find((d) => num(d.id) === id);
      if (!dep) return json({ success: false, error: "Esse depósito não existe na Olist." });
      await supabase.from("integration_olist").update({ deposit_id: id, deposit_name: norm(dep.descricao) }).eq("tenant_id", tenantId);
      return json({ success: true, selected: { id, nome: norm(dep.descricao) } });
    }

    // ---------------- estoque (uma página) ----------------
    if (action === "stock_page") {
      if (!integ.deposit_id) return json({ success: false, error: "Escolha o depósito do estoque antes de buscar." });
      const offset = Math.max(0, Math.floor(num(body.offset)));
      const r = await olistRequest(supabase, tenantId, "GET", `/estoque?limit=${PAGE}&offset=${offset}`);
      if (!r.ok) return json({ success: false, status: r.status, error: olistErrorMessage(r.status, r.data, "o estoque") });
      const itens: any[] = r.data?.itens || [];
      const dep = Number(integ.deposit_id);
      const rows = itens.map((i) => {
        const d = (i.depositos || []).find((x: any) => num(x.id) === dep);
        // "disponivel" já desconta o reservado; se faltar, usa o saldo
        const saldo = d ? (d.disponivel ?? d.saldo) : 0;
        return { olist_id: num(i.idProduto), sku: norm(i.sku), nome: norm(i.nome), saldo: Math.max(0, Math.floor(num(saldo))) };
      });
      const total = num(r.data?.paginacao?.total);
      return json({ success: true, rows, offset, has_more: itens.length >= PAGE && (total ? offset + PAGE < total : true), total });
    }

    // ---------------- produtos (uma página) ----------------
    if (action === "products_page") {
      const offset = Math.max(0, Math.floor(num(body.offset)));
      const r = await olistRequest(supabase, tenantId, "GET", `/produtos?limit=${PAGE}&offset=${offset}&situacao=A`);
      if (!r.ok) return json({ success: false, status: r.status, error: olistErrorMessage(r.status, r.data, "os produtos") });
      const itens: any[] = r.data?.itens || [];
      const rows = itens.map((p) => ({
        olist_id: num(p.id),
        sku: norm(p.sku),
        nome: norm(p.descricao),
        preco: num(p.precos?.preco),
        tipo: norm(p.tipo),               // K kit, S simples, V com variações, F fabricado, M matéria-prima
        variacao: norm(p.tipoVariacao),   // N normal, P pai (sem estoque próprio), V variação
      }));
      const total = num(r.data?.paginacao?.total);
      return json({ success: true, rows, offset, has_more: itens.length >= PAGE && (total ? offset + PAGE < total : true), total });
    }

    // ---------------- o que já existe no Cartzy ----------------
    if (action === "statuses") {
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 500)
        .map((i: any) => ({ olist_id: num(i?.olist_id), sku: norm(i?.sku) })).filter((i: any) => i.olist_id > 0);
      if (!items.length) return json({ success: true, statuses: [] });
      const ids = items.map((i: any) => i.olist_id);
      const skus = [...new Set(items.map((i: any) => i.sku).filter(Boolean))];
      const byId = new Map<number, any>(), bySku = new Map<string, any>();
      const { data: linked } = await supabase.from("products").select("id, code, sku_erp, olist_product_id").eq("tenant_id", tenantId).in("olist_product_id", ids);
      for (const p of linked || []) byId.set(Number(p.olist_product_id), p);
      if (skus.length) {
        const quoted = skus.map((c) => `"${c.replace(/"/g, "")}"`).join(",");
        const { data: same } = await supabase.from("products").select("id, code, sku_erp, olist_product_id").eq("tenant_id", tenantId).or(`code.in.(${quoted}),sku_erp.in.(${quoted})`);
        for (const p of same || []) { if (p.code) bySku.set(String(p.code).toLowerCase(), p); if (p.sku_erp) bySku.set(String(p.sku_erp).toLowerCase(), p); }
      }
      return json({
        success: true,
        statuses: items.map((i: any) => {
          const l = byId.get(i.olist_id);
          const s = i.sku ? bySku.get(i.sku.toLowerCase()) : undefined;
          return { olist_id: i.olist_id, status: l ? "vinculado" : s ? "existe" : "novo", cartzy_id: l?.id ?? s?.id ?? null };
        }),
      });
    }

    // ---------------- grava o saldo da Olist no Cartzy ----------------
    if (action === "apply_stock") {
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, MAX_ITEMS)
        .map((i: any) => ({ olist_id: num(i?.olist_id), sku: norm(i?.sku), saldo: Math.max(0, Math.floor(num(i?.saldo))) }))
        .filter((i: any) => i.olist_id > 0);
      if (!items.length) return json({ success: true, updated: 0, linked: 0, changed: [] });
      const ids = items.map((i: any) => i.olist_id);
      const skus = [...new Set(items.map((i: any) => i.sku).filter(Boolean))];
      const byId = new Map<number, any>(), bySku = new Map<string, any[]>();
      const { data: linked } = await supabase.from("products").select("id, stock, sku_erp, olist_product_id").eq("tenant_id", tenantId).in("olist_product_id", ids);
      for (const p of linked || []) byId.set(Number(p.olist_product_id), p);
      if (skus.length) {
        const { data: same } = await supabase.from("products").select("id, stock, sku_erp, olist_product_id").eq("tenant_id", tenantId).in("sku_erp", skus);
        for (const p of same || []) { const k = String(p.sku_erp).toLowerCase(); bySku.set(k, [...(bySku.get(k) || []), p]); }
      }
      // produto pai de variações do Cartzy não recebe estoque (ele fica sem saldo próprio)
      const candidatos = new Set<number>();
      for (const i of items) {
        const p = byId.get(i.olist_id) ?? (i.sku && (bySku.get(i.sku.toLowerCase()) || []).length === 1 ? bySku.get(i.sku.toLowerCase())![0] : null);
        if (p) candidatos.add(Number(p.id));
      }
      const pais = new Set<number>();
      if (candidatos.size) {
        const { data: filhos } = await supabase.from("products").select("parent_product_id").eq("tenant_id", tenantId).in("parent_product_id", [...candidatos]);
        for (const f of filhos || []) pais.add(Number(f.parent_product_id));
      }
      let updated = 0, vinculados = 0;
      const changed: Array<{ cartzy_id: number; de: number; para: number }> = [];
      for (const i of items) {
        const porId = byId.get(i.olist_id);
        const cand = i.sku ? bySku.get(i.sku.toLowerCase()) || [] : [];
        const p = porId ?? (cand.length === 1 ? cand[0] : null); // SKU repetido em mais de um produto: não adivinha
        if (!p || pais.has(Number(p.id))) continue;
        const patch: Record<string, unknown> = {};
        if (Number(p.stock) !== i.saldo) patch.stock = i.saldo;
        if (!porId && !p.olist_product_id) { patch.olist_product_id = i.olist_id; vinculados++; }
        if (!Object.keys(patch).length) continue;
        const { error } = await supabase.from("products").update(patch).eq("id", p.id).eq("tenant_id", tenantId);
        if (!error && "stock" in patch) { updated++; changed.push({ cartzy_id: Number(p.id), de: Number(p.stock) || 0, para: i.saldo }); }
      }
      await supabase.from("integration_olist").update({ last_stock_sync_at: new Date().toISOString() }).eq("tenant_id", tenantId);
      return json({ success: true, updated, linked: vinculados, changed: changed.slice(0, 50) });
    }

    // ---------------- importação ----------------
    if (action === "import") {
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 100)
        .map((i: any) => ({ olist_id: num(i?.olist_id), sku: norm(i?.sku), nome: norm(i?.nome), preco: num(i?.preco), saldo: Math.max(0, Math.floor(num(i?.saldo))) }))
        .filter((i: any) => i.olist_id > 0 && i.nome);
      if (!items.length) return json({ success: false, error: "Nenhum produto selecionado." });
      const saleType = ["BAZAR", "LIVE", "AMBOS"].includes(norm(body.sale_type)) ? norm(body.sale_type) : "AMBOS";
      const nextCode = await makeProductCodeAllocator(supabase, tenantId);
      const results: any[] = [];
      for (const i of items) {
        try {
          const { data: ja } = await supabase.from("products").select("id").eq("tenant_id", tenantId).eq("olist_product_id", i.olist_id).maybeSingle();
          if (ja) { results.push({ olist_id: i.olist_id, status: "ja_vinculado", cartzy_id: ja.id }); continue; }
          if (i.sku) {
            const c = i.sku.replace(/"/g, "");
            const { data: igual } = await supabase.from("products").select("id").eq("tenant_id", tenantId).is("olist_product_id", null).or(`code.eq."${c}",sku_erp.eq."${c}"`).limit(1);
            if (igual?.[0]) {
              await supabase.from("products").update({ olist_product_id: i.olist_id, sku_erp: i.sku }).eq("id", igual[0].id);
              results.push({ olist_id: i.olist_id, status: "vinculado", cartzy_id: igual[0].id });
              continue;
            }
          }
          const { data: novo, error } = await insertWithFreshCode(supabase, nextCode, {
            tenant_id: tenantId, name: i.nome.slice(0, 200), price: i.preco, stock: i.saldo, is_active: true,
            sale_type: saleType, olist_product_id: i.olist_id, sku_erp: i.sku || null,
          });
          if (error || !novo) results.push({ olist_id: i.olist_id, status: "erro", error: error?.message || "Falha ao criar o produto" });
          else {
            const img = await olistImage(supabase, tenantId, i.olist_id).catch(() => null);
            if (img) await supabase.from("products").update({ image_url: img }).eq("id", novo.id);
            results.push({ olist_id: i.olist_id, status: "criado", cartzy_id: novo.id, image: !!img });
          }
        } catch (e) {
          results.push({ olist_id: i.olist_id, status: "erro", error: (e as Error).message });
        }
      }
      return json({ success: true, results });
    }

    // ---------------- fotos ----------------
    if (action === "images_pending") {
      const ids: number[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        const { data } = await supabase.from("products").select("olist_product_id")
          .eq("tenant_id", tenantId).not("olist_product_id", "is", null).or("image_url.is.null,image_url.eq.").range(from, from + 999);
        ids.push(...(data || []).map((p: any) => Number(p.olist_product_id)));
        if (!data || data.length < 1000) break;
      }
      return json({ success: true, ids });
    }

    if (action === "sync_images") {
      const ids = (Array.isArray(body.ids) ? body.ids : []).slice(0, 25).map(num).filter((n: number) => n > 0);
      let updated = 0, semFoto = 0;
      for (const id of ids) {
        const img = await olistImage(supabase, tenantId, id).catch(() => null);
        if (!img) { semFoto++; await sleep(150); continue; }
        const { error } = await supabase.from("products").update({ image_url: img })
          .eq("tenant_id", tenantId).eq("olist_product_id", id).or("image_url.is.null,image_url.eq.");
        if (!error) updated++;
        await sleep(150);
      }
      return json({ success: true, updated, sem_foto: semFoto });
    }

    // ---------------- catálogo guardado ----------------
    if (action === "catalog_load") {
      const rows: any[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        const { data, error } = await supabase.from("olist_catalog")
          .select("olist_id, sku, nome, preco, tipo, variacao, saldo")
          .eq("tenant_id", tenantId).order("nome").range(from, from + 999);
        if (error) return json({ success: false, error: "Não foi possível ler o catálogo guardado" });
        rows.push(...(data || []).map((r: any) => ({ ...r, olist_id: Number(r.olist_id), preco: Number(r.preco) })));
        if (!data || data.length < 1000) break;
      }
      const { data: meta } = await supabase.from("integration_olist").select("last_catalog_sync_at").eq("tenant_id", tenantId).maybeSingle();
      return json({ success: true, rows, synced_at: meta?.last_catalog_sync_at || null });
    }

    if (action === "catalog_save") {
      const at = new Date(norm(body.started_at) || Date.now()).toISOString();
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 500)
        .map((i: any) => ({
          tenant_id: tenantId, olist_id: num(i?.olist_id), sku: norm(i?.sku), nome: norm(i?.nome), preco: num(i?.preco),
          tipo: norm(i?.tipo), variacao: norm(i?.variacao), saldo: Math.max(0, Math.floor(num(i?.saldo))), synced_at: at,
        })).filter((i: any) => i.olist_id > 0);
      if (items.length) {
        const { error } = await supabase.from("olist_catalog").upsert(items, { onConflict: "tenant_id,olist_id" });
        if (error) return json({ success: false, error: "Não foi possível guardar o catálogo" });
      }
      return json({ success: true, saved: items.length });
    }

    if (action === "catalog_finish") {
      const at = new Date(norm(body.started_at) || Date.now()).toISOString();
      await supabase.from("olist_catalog").delete().eq("tenant_id", tenantId).lt("synced_at", at);
      await supabase.from("integration_olist").update({ last_catalog_sync_at: new Date().toISOString() }).eq("tenant_id", tenantId);
      return json({ success: true });
    }

    return json({ success: false, error: "Ação inválida" }, 400);
  } catch (e) {
    console.error("[olist-products]", (e as Error).message);
    return json({ success: false, error: "Erro interno" }, 500);
  }
});
