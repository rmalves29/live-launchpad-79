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
//   sync_start / sync_status / sync_cancel  sincronização do catálogo em segundo plano (catálogos grandes; limite da Olist: 60 leituras/min).
//   auto_catalog_sync  (só service role / agendamento a cada minuto) avança as sincronizações em andamento.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeTenantCaller, guardResponse } from "../_shared/auth-guard.ts";
import { makeProductCodeAllocator, insertWithFreshCode } from "../_shared/next-product-code.ts";
import { olistRequest, olistErrorMessage } from "../_shared/olist.ts";
import { variationFromGrade } from "../_shared/variation.ts";
import { runCatalogSync, newSyncState } from "../_shared/olist-catalog-sync.ts";

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
// Preço promocional da Olist: só vale quando é maior que zero e menor que o preço normal.
const promoOf = (promo: unknown, preco: unknown) => { const pr = num(promo); return pr > 0 && pr < num(preco) ? pr : 0; };

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

    // ---------- sincronização do catálogo em segundo plano (só service role / agendamento) ----------
    if (action === "auto_catalog_sync") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      let authorized = Boolean(serviceKey && token && token === serviceKey);
      if (!authorized) {
        const cronSecret = req.headers.get("x-olist-cron-secret") || "";
        if (/^[a-f0-9]{64}$/.test(cronSecret)) {
          const { data, error } = await supabase.rpc("olist_cron_authorized", { p_secret: cronSecret });
          authorized = !error && data === true;
        }
      }
      if (!authorized) return json({ success: false, error: "Nao autorizado" }, 403);
      if (body.dry_run === true) return json({ success: true, dry_run: true, authorized: true });
      const started = Date.now();
      const { data: running } = await supabase.from("integration_olist").select("tenant_id")
        .eq("is_active", true).eq("catalog_sync_running", true)
        .order("catalog_sync_last_at", { ascending: true, nullsFirst: true }).limit(20);
      const out: any[] = [];
      for (const t of running || []) {
        if (Date.now() - started > 55_000) break; // cada empresa leva até ~45 s; o resto fica para a próxima rodada
        const lockLimit = new Date(Date.now() - 3 * 60_000).toISOString();
        const { data: claimed } = await supabase.from("integration_olist")
          .update({ catalog_sync_lock_at: new Date().toISOString() }).eq("tenant_id", t.tenant_id)
          .or(`catalog_sync_lock_at.is.null,catalog_sync_lock_at.lt.${lockLimit}`).select("tenant_id").maybeSingle();
        if (!claimed) continue; // outra rodada já está nela
        try {
          const st = await runCatalogSync(supabase, t.tenant_id, started + 100_000);
          if (st) out.push({ tenant_id: t.tenant_id, phase: st.phase, offset: st.offset, kept: st.kept, error: st.error });
        } finally {
          await supabase.from("integration_olist").update({ catalog_sync_lock_at: null }).eq("tenant_id", t.tenant_id);
        }
      }
      console.log("[olist-products] auto_catalog_sync", JSON.stringify(out));
      return json({ success: true, tenants: out });
    }

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

    // ---------------- sincronização em segundo plano (catálogos grandes) ----------------
    if (action === "sync_start") {
      if (!integ.deposit_id) return json({ success: false, error: "Escolha o depósito do estoque antes de sincronizar." });
      const { data: cur, error: curErr } = await supabase.from("integration_olist")
        .select("catalog_sync, catalog_sync_running, last_catalog_sync_at").eq("tenant_id", tenantId).maybeSingle();
      if (curErr) return json({ success: false, error: "O banco ainda não recebeu a atualização da sincronização em segundo plano. Publique o sistema e tente de novo." });
      if (cur?.catalog_sync_running) return json({ success: true, already_running: true, state: cur.catalog_sync });
      const state = newSyncState(Number(integ.deposit_id), cur?.catalog_sync || null, cur?.last_catalog_sync_at || null, body.full === true);
      await supabase.from("integration_olist")
        .update({ catalog_sync: state, catalog_sync_running: true, catalog_sync_lock_at: null, catalog_sync_last_at: null }).eq("tenant_id", tenantId);
      return json({ success: true, state });
    }

    if (action === "sync_status") {
      const { data: cur, error: curErr } = await supabase.from("integration_olist")
        .select("catalog_sync, catalog_sync_running, last_catalog_sync_at").eq("tenant_id", tenantId).maybeSingle();
      if (curErr) return json({ success: true, available: false });
      const { count } = await supabase.from("olist_catalog").select("olist_id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      return json({ success: true, available: true, running: !!cur?.catalog_sync_running, state: cur?.catalog_sync || null, synced_at: cur?.last_catalog_sync_at || null, catalog_rows: count ?? 0 });
    }

    if (action === "sync_cancel") {
      await supabase.from("integration_olist").update({ catalog_sync_running: false }).eq("tenant_id", tenantId);
      return json({ success: true });
    }

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
        preco_promocional: promoOf(p.precos?.precoPromocional, p.precos?.preco),
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
        .map((i: any) => ({
          olist_id: num(i?.olist_id), sku: norm(i?.sku), saldo: Math.max(0, Math.floor(num(i?.saldo))),
          // undefined = a tela não mandou o preço promocional: não mexe nele
          promo: i?.preco_promocional === undefined ? undefined : num(i?.preco_promocional),
        }))
        .filter((i: any) => i.olist_id > 0);
      if (!items.length) return json({ success: true, updated: 0, linked: 0, changed: [], promos: 0 });
      const ids = items.map((i: any) => i.olist_id);
      const skus = [...new Set(items.map((i: any) => i.sku).filter(Boolean))];
      const byId = new Map<number, any>(), bySku = new Map<string, any[]>();
      const { data: linked } = await supabase.from("products").select("id, stock, promotional_price, sku_erp, olist_product_id").eq("tenant_id", tenantId).in("olist_product_id", ids);
      for (const p of linked || []) byId.set(Number(p.olist_product_id), p);
      if (skus.length) {
        const { data: same } = await supabase.from("products").select("id, stock, promotional_price, sku_erp, olist_product_id").eq("tenant_id", tenantId).in("sku_erp", skus);
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
      let updated = 0, vinculados = 0, promos = 0;
      const changed: Array<{ cartzy_id: number; de: number; para: number }> = [];
      for (const i of items) {
        const porId = byId.get(i.olist_id);
        const cand = i.sku ? bySku.get(i.sku.toLowerCase()) || [] : [];
        const p = porId ?? (cand.length === 1 ? cand[0] : null); // SKU repetido em mais de um produto: não adivinha
        if (!p || pais.has(Number(p.id))) continue;
        const patch: Record<string, unknown> = {};
        if (Number(p.stock) !== i.saldo) patch.stock = i.saldo;
        // Preço promocional segue a Olist: tem promoção lá, tem aqui; tirou lá, tira aqui.
        if (i.promo !== undefined) {
          const novo = i.promo > 0 ? i.promo : null;
          const atual = Number(p.promotional_price) > 0 ? Number(p.promotional_price) : null;
          if (novo !== atual) patch.promotional_price = novo;
        }
        if (!porId && !p.olist_product_id) { patch.olist_product_id = i.olist_id; vinculados++; }
        if (!Object.keys(patch).length) continue;
        const { error } = await supabase.from("products").update(patch).eq("id", p.id).eq("tenant_id", tenantId);
        if (!error && "stock" in patch) { updated++; changed.push({ cartzy_id: Number(p.id), de: Number(p.stock) || 0, para: i.saldo }); }
        if (!error && "promotional_price" in patch) promos++;
      }
      await supabase.from("integration_olist").update({ last_stock_sync_at: new Date().toISOString() }).eq("tenant_id", tenantId);
      return json({ success: true, updated, linked: vinculados, promos, changed: changed.slice(0, 50) });
    }

    // ---------------- importação ----------------
    if (action === "import") {
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 100)
        .map((i: any) => ({ olist_id: num(i?.olist_id), sku: norm(i?.sku), nome: norm(i?.nome), preco: num(i?.preco), promo: promoOf(i?.preco_promocional, i?.preco), saldo: Math.max(0, Math.floor(num(i?.saldo))) }))
        .filter((i: any) => i.olist_id > 0 && i.nome);
      if (!items.length) return json({ success: false, error: "Nenhum produto selecionado." });
      const saleType = ["BAZAR", "LIVE", "AMBOS"].includes(norm(body.sale_type)) ? norm(body.sale_type) : "AMBOS";
      const nextCode = await makeProductCodeAllocator(supabase, tenantId);
      const results: any[] = [];
      const saldoPorId = new Map<number, number>(items.map((i: any) => [i.olist_id, i.saldo]));
      const paisFeitos = new Set<number>();

      // Produto com variações (pai "P" ou uma variação "V"): cria o pai e todas as variações com cor/tamanho, como no Bling.
      const importarGrade = async (pai: any) => {
        const paiId = num(pai?.id);
        const { data: jaPai } = await supabase.from("products").select("id").eq("tenant_id", tenantId).eq("olist_product_id", paiId).maybeSingle();
        let parentId: string | null = jaPai?.id || null;
        const anexo = (pai?.anexos || []).map((x: any) => norm(x?.url)).find((u: string) => /^https?:\/\//i.test(u)) || null;
        const precoPai = num(pai?.precos?.preco);
        // preço promocional da Olist (precos.precoPromocional): só vale se for maior que zero e menor que o preço normal
        const promoPai = promoOf(pai?.precos?.precoPromocional, precoPai);
        if (!parentId) {
          const { data: novoPai, error } = await insertWithFreshCode(supabase, nextCode, {
            tenant_id: tenantId, name: norm(pai?.descricao).slice(0, 200), price: precoPai, promotional_price: promoPai > 0 ? promoPai : null, stock: 0, is_active: true,
            sale_type: saleType, olist_product_id: paiId, sku_erp: norm(pai?.sku) || null, image_url: anexo,
          });
          if (error || !novoPai) return { ok: false, error: error?.message || "Falha ao criar o produto" };
          parentId = novoPai.id;
        }
        let filhos = 0;
        for (const v of Array.isArray(pai?.variacoes) ? pai.variacoes : []) {
          const vid = num(v?.id);
          if (!vid) continue;
          const { data: jaFilho } = await supabase.from("products").select("id").eq("tenant_id", tenantId).eq("olist_product_id", vid).maybeSingle();
          if (jaFilho) continue;
          const g = variationFromGrade(v?.grade, norm(v?.descricao));
          const precoFilho = num(v?.precos?.preco) || precoPai;
          // promocional da própria variação; se a Olist não mandou o campo, vale o do pai quando o preço é o mesmo
          const promoFilho = v?.precos?.precoPromocional != null ? promoOf(v.precos.precoPromocional, precoFilho) : (precoFilho === precoPai ? promoPai : 0);
          const { error } = await insertWithFreshCode(supabase, nextCode, {
            tenant_id: tenantId, name: `${norm(pai?.descricao)} - ${g.label || norm(v?.sku) || vid}`.slice(0, 200),
            price: precoFilho, promotional_price: promoFilho > 0 ? promoFilho : null, stock: saldoPorId.get(vid) ?? 0, is_active: true, sale_type: saleType,
            image_url: anexo, color: g.color, size: g.size, parent_product_id: parentId,
            olist_product_id: vid, sku_erp: norm(v?.sku) || null,
          });
          if (!error) filhos++;
        }
        paisFeitos.add(paiId);
        return { ok: true, parentId, filhos };
      };

      for (const i of items) {
        try {
          const { data: ja } = await supabase.from("products").select("id").eq("tenant_id", tenantId).eq("olist_product_id", i.olist_id).maybeSingle();
          if (ja) { results.push({ olist_id: i.olist_id, status: "ja_vinculado", cartzy_id: ja.id }); continue; }

          const det = await olistRequest(supabase, tenantId, "GET", `/produtos/${i.olist_id}`);
          const tv = det.ok ? norm(det.data?.tipoVariacao).toUpperCase() : "";
          if (tv === "P" || tv === "V") {
            let pai = det.data;
            if (tv === "V") {
              const idPai = num(det.data?.produtoPai?.id);
              if (idPai && paisFeitos.has(idPai)) { results.push({ olist_id: i.olist_id, status: "ja_vinculado" }); continue; }
              const pr = idPai ? await olistRequest(supabase, tenantId, "GET", `/produtos/${idPai}`) : null;
              pai = pr?.ok ? pr.data : null;
            } else if (paisFeitos.has(i.olist_id)) { results.push({ olist_id: i.olist_id, status: "ja_vinculado" }); continue; }
            if (pai && Array.isArray(pai.variacoes) && pai.variacoes.length) {
              const r = await importarGrade(pai);
              results.push(r.ok ? { olist_id: i.olist_id, status: "criado", cartzy_id: r.parentId, children: r.filhos } : { olist_id: i.olist_id, status: "erro", error: r.error });
              continue;
            }
          }
          if (i.sku) {
            const c = i.sku.replace(/"/g, "");
            const { data: igual } = await supabase.from("products").select("id").eq("tenant_id", tenantId).is("olist_product_id", null).or(`code.eq."${c}",sku_erp.eq."${c}"`).limit(1);
            if (igual?.[0]) {
              await supabase.from("products").update({ olist_product_id: i.olist_id, sku_erp: i.sku, promotional_price: i.promo > 0 ? i.promo : null }).eq("id", igual[0].id);
              results.push({ olist_id: i.olist_id, status: "vinculado", cartzy_id: igual[0].id });
              continue;
            }
          }
          const { data: novo, error } = await insertWithFreshCode(supabase, nextCode, {
            tenant_id: tenantId, name: i.nome.slice(0, 200), price: i.preco, promotional_price: i.promo > 0 ? i.promo : null, stock: i.saldo, is_active: true,
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
        let { data, error } = await supabase.from("olist_catalog")
          .select("olist_id, sku, nome, preco, preco_promocional, tipo, variacao, saldo")
          .eq("tenant_id", tenantId).order("nome").range(from, from + 999);
        if (error) { // banco ainda sem a coluna preco_promocional
          ({ data, error } = await supabase.from("olist_catalog")
            .select("olist_id, sku, nome, preco, tipo, variacao, saldo")
            .eq("tenant_id", tenantId).order("nome").range(from, from + 999));
        }
        if (error) return json({ success: false, error: "Não foi possível ler o catálogo guardado" });
        rows.push(...(data || []).map((r: any) => ({ ...r, olist_id: Number(r.olist_id), preco: Number(r.preco), preco_promocional: Number(r.preco_promocional) || 0 })));
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
          preco_promocional: promoOf(i?.preco_promocional, i?.preco),
          tipo: norm(i?.tipo), variacao: norm(i?.variacao), saldo: Math.max(0, Math.floor(num(i?.saldo))), synced_at: at,
        })).filter((i: any) => i.olist_id > 0);
      if (items.length) {
        let { error } = await supabase.from("olist_catalog").upsert(items, { onConflict: "tenant_id,olist_id" });
        if (error) { // banco ainda sem a coluna preco_promocional: guarda sem ela
          ({ error } = await supabase.from("olist_catalog").upsert(
            items.map(({ preco_promocional: _p, ...rest }: any) => rest), { onConflict: "tenant_id,olist_id" }));
        }
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
