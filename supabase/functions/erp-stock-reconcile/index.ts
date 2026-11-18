// Conferência automática de estoque ERP → Cartzy (a cada 15 minutos, pelo agendador).
// Para cada loja com Bling, Olist ou Bagy ativo: lê no ERP o saldo de uma parte dos produtos (continua de onde parou
// na rodada anterior), liga produtos que ainda não estão ligados (pelo SKU/código) e corrige as diferenças no Cartzy.
//
// Regras:
//  - O ERP é a fonte do saldo. Estoque no Cartzy = saldo do ERP − o que o Cartzy já reservou e o ERP ainda não sabe
//    (pedidos/carrinhos ainda não enviados ao ERP, reservas da loja da live). Ver public.erp_pending_qty.
//  - Produto pai de variações não recebe estoque (o saldo fica nos filhos).
//  - Nunca cria nem apaga produto. Liga só quando o código bate com UM produto do Cartzy.
//  - Segurança: na primeira volta completa de uma loja, se o ERP fosse zerar a maior parte dos produtos com estoque,
//    a conferência pausa e avisa na tela (a loja libera com um clique).
//  - Respeita o ritmo de cada ERP: poucas leituras por loja em cada rodada.
//
// Chamadas aceitas: agendador (x-olist-cron-secret) / service role → todas as lojas;
// usuário logado com { tenant_id, erp } → "Conferir agora" só daquela loja.
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeTenantCaller, guardResponse } from "../_shared/auth-guard.ts";
import { blingGet, depositBalances, effectiveDepositId, pendingQty, touchErpState, validToken } from "../_shared/bling-product-sync.ts";
import { olistRequest } from "../_shared/olist.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-olist-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const RUN_BUDGET_MS = 115_000;   // a função tem ~150 s; sobra margem
const TENANT_BUDGET_MS = 25_000; // tempo máximo por loja em cada rodada
const BLING_CALLS = 12;          // leituras de saldo por loja/rodada (100 produtos cada)
const BLING_LINK_CALLS = 2;      // buscas por código para ligar produtos
const OLIST_PAGES = 6;           // páginas de 100 (a Olist aceita 60 leituras/min)
const BAGY_PAGES = 6;

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (v: any) => String(v ?? "").trim();

type Entry = { pid: number; stock: number; saldo: number };
type Ctx = { supabase: any; tenantId: string; erp: "bling" | "olist" | "bagy"; state: any; deadline: number };

// ---------- comum: aplica os saldos lidos do ERP ----------
async function parentsAmong(supabase: any, tenantId: string, ids: number[]): Promise<Set<number>> {
  const out = new Set<number>();
  if (!ids.length) return out;
  const { data } = await supabase.from("products").select("parent_product_id").eq("tenant_id", tenantId).in("parent_product_id", ids);
  for (const r of data || []) out.add(Number(r.parent_product_id));
  return out;
}

class PausedError extends Error {}

async function applyEntries(ctx: Ctx, entries: Entry[]): Promise<number> {
  const { supabase, tenantId, erp, state } = ctx;
  if (!entries.length) return 0;
  const pais = await parentsAmong(supabase, tenantId, entries.map((e) => e.pid));
  const list = entries.filter((e) => !pais.has(e.pid));
  const pend = await pendingQty(supabase, tenantId, erp, list.map((e) => e.pid));
  const targets = list.map((e) => ({ ...e, alvo: Math.max(0, Math.floor(e.saldo) - (pend.get(e.pid) || 0)) }));

  // trava de segurança antes da primeira volta completa
  if (!state.last_full_cycle_at && !state.safety_ack) {
    const comEstoque = targets.filter((t) => t.stock > 0);
    const zerariam = comEstoque.filter((t) => t.alvo === 0);
    if (zerariam.length >= 10 && zerariam.length > comEstoque.length * 0.5) {
      throw new PausedError(`O ${erp} zeraria ${zerariam.length} de ${comEstoque.length} produtos com estoque no Cartzy. Confira o depósito escolhido e libere a conferência.`);
    }
  }

  let changed = 0;
  const now = new Date().toISOString();
  for (const t of targets) {
    if (t.alvo === t.stock) continue;
    const { error } = await supabase.from("products").update({ stock: t.alvo, updated_at: now }).eq("id", t.pid).eq("tenant_id", tenantId);
    if (!error) changed++;
  }
  return changed;
}

// ---------- Bling ----------
async function reconcileBling(ctx: Ctx, integ: any): Promise<Record<string, any>> {
  const { supabase, tenantId } = ctx;
  const token = await validToken(supabase, integ);
  if (!token) return { last_error: "Token do Bling expirado. Reconecte a integração." };
  const dep = await effectiveDepositId(integ, token);
  if (!dep.id) return { last_error: "Nenhum depósito escolhido e o Bling não tem depósito padrão.", deposit_source: "nenhum" };

  // 1) liga produtos sem bling_product_id pelo código (sku_erp ou code)
  let linked = 0;
  let linkCursor = num(ctx.state.link_cursor);
  for (let call = 0; call < BLING_LINK_CALLS && Date.now() < ctx.deadline; call++) {
    const { data: rows } = await supabase.from("products")
      .select("id, code, sku_erp").eq("tenant_id", tenantId).is("bling_product_id", null).eq("is_active", true)
      .gt("id", linkCursor).order("id").limit(50);
    if (!rows?.length) { linkCursor = 0; break; }
    linkCursor = Number(rows[rows.length - 1].id);
    const byCode = new Map<string, number[]>();
    for (const r of rows) for (const c of new Set([norm(r.sku_erp), norm(r.code)].filter(Boolean))) byCode.set(c, [...(byCode.get(c) || []), Number(r.id)]);
    if (!byCode.size) continue;
    const qs = [...byCode.keys()].map((c) => `codigos[]=${encodeURIComponent(c)}`).join("&");
    const r = await blingGet(token, `/produtos?limite=100&pagina=1&${qs}`);
    if (!r.ok) break;
    const pais = await parentsAmong(supabase, tenantId, rows.map((x: any) => Number(x.id)));
    for (const bp of r.data?.data || []) {
      const ids = byCode.get(norm(bp.codigo)) || [];
      if (ids.length !== 1 || pais.has(ids[0])) continue; // código repetido ou pai de variações: não adivinha
      const { data: dup } = await supabase.from("products").select("id").eq("tenant_id", tenantId).eq("bling_product_id", Number(bp.id)).limit(1);
      if (dup?.length) continue; // esse produto do Bling já está ligado a outro produto do Cartzy
      const { error } = await supabase.from("products").update({ bling_product_id: Number(bp.id) }).eq("id", ids[0]).eq("tenant_id", tenantId).is("bling_product_id", null);
      if (!error) linked++;
    }
  }

  // 2) confere o saldo dos produtos ligados, em partes de 100
  let changed = 0;
  let cursor = num(ctx.state.cursor);
  let fullCycle = false;
  for (let call = 0; call < BLING_CALLS && Date.now() < ctx.deadline; call++) {
    const { data: rows } = await supabase.from("products")
      .select("id, stock, bling_product_id").eq("tenant_id", tenantId).not("bling_product_id", "is", null)
      .gt("id", cursor).order("id").limit(100);
    if (!rows?.length) { cursor = 0; fullCycle = true; break; }
    const ids = [...new Set<number>(rows.map((x: any) => Number(x.bling_product_id)))];
    const bal = await depositBalances(token, dep.id, ids);
    if (!bal.size && ids.length) return { cursor: String(cursor), linked_last_run: linked, changes_last_run: changed, last_error: "O Bling não devolveu os saldos (limite de chamadas ou permissão de estoque). Tenta de novo na próxima rodada.", deposit_source: dep.source, link_cursor: String(linkCursor) };
    const entries: Entry[] = rows
      .filter((x: any) => bal.has(Number(x.bling_product_id)))
      .map((x: any) => ({ pid: Number(x.id), stock: num(x.stock), saldo: num(bal.get(Number(x.bling_product_id))) }));
    changed += await applyEntries(ctx, entries);
    cursor = Number(rows[rows.length - 1].id);
    if (rows.length < 100) { cursor = 0; fullCycle = true; break; }
  }
  return { cursor: String(cursor), link_cursor: String(linkCursor), linked_last_run: linked, changes_last_run: changed, deposit_source: dep.source, last_error: null, fullCycle };
}

// ---------- Olist ----------
async function reconcileOlist(ctx: Ctx, integ: any): Promise<Record<string, any>> {
  const { supabase, tenantId } = ctx;
  let depId = num(integ.deposit_id);
  let depSource = "escolhido";
  if (!depId) {
    const r = await olistRequest(supabase, tenantId, "GET", "/depositos");
    const lista: any[] = Array.isArray(r.data) ? r.data : r.data?.itens || r.data?.data || [];
    const padrao = lista.find((d) => d?.padrao) || (lista.length === 1 ? lista[0] : null);
    depId = num(padrao?.id);
    depSource = depId ? "padrao_erp" : "nenhum";
    if (!depId) return { last_error: "Nenhum depósito escolhido e a Olist não tem depósito padrão.", deposit_source: "nenhum" };
  }
  let offset = num(ctx.state.cursor);
  let changed = 0, linked = 0, fullCycle = false;
  for (let page = 0; page < OLIST_PAGES && Date.now() < ctx.deadline; page++) {
    const r = await olistRequest(supabase, tenantId, "GET", `/estoque?limit=100&offset=${offset}`);
    if (!r.ok) return { cursor: String(offset), changes_last_run: changed, linked_last_run: linked, deposit_source: depSource, last_error: `A Olist respondeu ${r.status} ao ler o estoque.` };
    const itens: any[] = r.data?.itens || [];
    const rows = itens.map((i) => {
      const d = (i.depositos || []).find((x: any) => num(x.id) === depId);
      return { olist_id: num(i.idProduto), sku: norm(i.sku), saldo: d ? Math.max(0, Math.floor(num(d.disponivel ?? d.saldo))) : null };
    }).filter((x) => x.olist_id > 0 && x.saldo !== null);
    const res = await matchAndApply(ctx, rows.map((x) => ({ ext: x.olist_id, sku: x.sku, saldo: x.saldo as number })), "olist_product_id");
    changed += res.changed; linked += res.linked;
    offset += itens.length;
    if (itens.length < 100) { offset = 0; fullCycle = true; break; }
  }
  return { cursor: String(offset), changes_last_run: changed, linked_last_run: linked, deposit_source: depSource, last_error: null, fullCycle };
}

// ---------- Bagy ----------
async function reconcileBagy(ctx: Ctx, integ: any): Promise<Record<string, any>> {
  const token = integ.access_token as string;
  let page = Math.max(1, num(ctx.state.cursor) || 1);
  let changed = 0, linked = 0, fullCycle = false;
  for (let i = 0; i < BAGY_PAGES && Date.now() < ctx.deadline; i++) {
    const res = await fetch(`https://api.dooca.store/products?page=${page}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (!res.ok) return { cursor: String(page), changes_last_run: changed, linked_last_run: linked, last_error: res.status === 401 || res.status === 403 ? "A Bagy recusou o token. Gere um novo token e salve na integração." : `A Bagy respondeu ${res.status} ao ler os produtos.` };
    const data = await res.json().catch(() => ({}));
    const prods: any[] = Array.isArray(data) ? data : data?.data || data?.products || [];
    const rows: Array<{ ext: number; sku: string; saldo: number }> = [];
    for (const p of prods) {
      const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
      for (const v of vars) {
        const sku = norm(v?.sku || v?.reference) || (vars.length <= 1 ? norm(p?.sku || p?.reference) : "");
        rows.push({ ext: num(v.id), sku, saldo: Math.max(0, Math.floor(num(v.balance) - num(v.reserved_balance))) });
      }
    }
    const r = await matchAndApply(ctx, rows.filter((x) => x.ext > 0), "bagy_variation_id");
    changed += r.changed; linked += r.linked;
    const last = num(data?.meta?.last_page);
    if (!prods.length || (last && page >= last)) { page = 1; fullCycle = true; break; }
    page++;
  }
  return { cursor: String(page), changes_last_run: changed, linked_last_run: linked, last_error: null, fullCycle };
}

// Olist/Bagy: acha o produto do Cartzy pelo id do ERP ou, se não ligado, pelo SKU (único); liga e aplica o saldo.
async function matchAndApply(ctx: Ctx, rows: Array<{ ext: number; sku: string; saldo: number }>, col: "olist_product_id" | "bagy_variation_id") {
  const { supabase, tenantId } = ctx;
  if (!rows.length) return { changed: 0, linked: 0 };
  const byExt = new Map<number, any>();
  const { data: ligados } = await supabase.from("products").select(`id, stock, sku_erp, ${col}`).eq("tenant_id", tenantId).in(col, rows.map((r) => r.ext));
  for (const p of ligados || []) byExt.set(num(p[col]), p);
  const skus = [...new Set(rows.filter((r) => !byExt.has(r.ext) && r.sku).map((r) => r.sku))];
  const bySku = new Map<string, any[]>();
  if (skus.length) {
    const { data: same } = await supabase.from("products").select(`id, stock, sku_erp, ${col}`).eq("tenant_id", tenantId).in("sku_erp", skus);
    for (const p of same || []) { const k = norm(p.sku_erp).toLowerCase(); bySku.set(k, [...(bySku.get(k) || []), p]); }
  }
  let linked = 0;
  const entries: Entry[] = [];
  for (const r of rows) {
    let p = byExt.get(r.ext);
    if (!p && r.sku) {
      const c = bySku.get(r.sku.toLowerCase()) || [];
      if (c.length === 1 && !c[0][col]) {
        const { error } = await supabase.from("products").update({ [col]: r.ext }).eq("id", c[0].id).eq("tenant_id", tenantId).is(col, null);
        if (!error) { linked++; p = c[0]; }
      }
    }
    if (p) entries.push({ pid: Number(p.id), stock: num(p.stock), saldo: r.saldo });
  }
  const changed = await applyEntries(ctx, entries);
  return { changed, linked };
}

// ---------- uma loja / um ERP ----------
async function runOne(supabase: any, tenantId: string, erp: "bling" | "olist" | "bagy", integ: any, runDeadline: number) {
  const { data: state } = await supabase.from("erp_stock_sync_state").select("*").eq("tenant_id", tenantId).eq("erp", erp).maybeSingle();
  const st = state || {};
  if (st.paused_reason && !st.safety_ack) return { tenantId, erp, skipped: "pausada" };
  const ctx: Ctx = { supabase, tenantId, erp, state: st, deadline: Math.min(runDeadline, Date.now() + TENANT_BUDGET_MS) };
  const now = new Date().toISOString();
  let res: Record<string, any>;
  try {
    res = erp === "bling" ? await reconcileBling(ctx, integ) : erp === "olist" ? await reconcileOlist(ctx, integ) : await reconcileBagy(ctx, integ);
  } catch (e) {
    if (e instanceof PausedError) {
      await touchErpState(supabase, tenantId, erp, { paused_reason: e.message, last_run_at: now });
      return { tenantId, erp, paused: e.message };
    }
    await touchErpState(supabase, tenantId, erp, { last_error: String((e as any)?.message || e).slice(0, 300), last_run_at: now });
    return { tenantId, erp, error: String((e as any)?.message || e) };
  }
  const { fullCycle, ...patch } = res;
  const { data: unl } = await supabase.rpc("erp_unlinked_count", { p_tenant: tenantId, p_erp: erp });
  await touchErpState(supabase, tenantId, erp, {
    ...patch,
    last_run_at: now,
    unlinked_count: typeof unl === "number" ? unl : null,
    ...(fullCycle ? { last_full_cycle_at: now } : {}),
    ...(num(patch.changes_last_run) > 0 ? { last_change_at: now } : {}),
    paused_reason: null,
  });
  return { tenantId, erp, ...patch, fullCycle };
}

async function loadIntegrations(supabase: any, only?: { tenant_id: string; erp?: string }) {
  const jobs: Array<{ tenantId: string; erp: "bling" | "olist" | "bagy"; integ: any }> = [];
  const want = (e: string) => !only?.erp || only.erp === e;
  if (want("bling")) {
    let q = supabase.from("integration_bling").select("*").eq("is_active", true).not("access_token", "is", null);
    if (only) q = q.eq("tenant_id", only.tenant_id);
    for (const i of (await q).data || []) jobs.push({ tenantId: i.tenant_id, erp: "bling", integ: i });
  }
  if (want("olist")) {
    let q = supabase.from("integration_olist").select("tenant_id, deposit_id, is_active").eq("is_active", true);
    if (only) q = q.eq("tenant_id", only.tenant_id);
    for (const i of (await q).data || []) jobs.push({ tenantId: i.tenant_id, erp: "olist", integ: i });
  }
  if (want("bagy")) {
    let q = supabase.from("integration_bagy").select("tenant_id, access_token, is_active").eq("is_active", true).not("access_token", "is", null);
    if (only) q = q.eq("tenant_id", only.tenant_id);
    for (const i of (await q).data || []) jobs.push({ tenantId: i.tenant_id, erp: "bagy", integ: i });
  }
  // quem rodou há mais tempo vai primeiro (se o tempo acabar, a próxima rodada continua dos outros)
  const { data: states } = await supabase.from("erp_stock_sync_state").select("tenant_id, erp, last_run_at");
  const last = new Map<string, number>((states || []).map((s: any) => [`${s.tenant_id}:${s.erp}`, s.last_run_at ? new Date(s.last_run_at).getTime() : 0]));
  jobs.sort((a, b) => (last.get(`${a.tenantId}:${a.erp}`) || 0) - (last.get(`${b.tenantId}:${b.erp}`) || 0));
  return jobs;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const started = Date.now();

  // agendador / service role
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let system = Boolean(serviceKey && bearer && bearer === serviceKey);
  if (!system) {
    const cronSecret = req.headers.get("x-olist-cron-secret") || "";
    if (/^[a-f0-9]{64}$/.test(cronSecret)) {
      const { data, error } = await supabase.rpc("olist_cron_authorized", { p_secret: cronSecret });
      system = !error && data === true;
    }
  }

  let only: { tenant_id: string; erp?: string } | undefined;
  if (!system) {
    const tenantId = norm(body.tenant_id);
    if (!tenantId) return json({ error: "Nao autorizado" }, 403);
    const guard = await authorizeTenantCaller(req, supabase, tenantId);
    if (!guard.ok) return guardResponse(guard, corsHeaders);
    only = { tenant_id: tenantId, erp: ["bling", "olist", "bagy"].includes(body.erp) ? body.erp : undefined };
  } else if (body.tenant_id) {
    only = { tenant_id: norm(body.tenant_id), erp: ["bling", "olist", "bagy"].includes(body.erp) ? body.erp : undefined };
  }

  const deadline = started + RUN_BUDGET_MS;
  const jobs = await loadIntegrations(supabase, only);
  const out: any[] = [];
  for (const j of jobs) {
    if (Date.now() > deadline - 5_000) { out.push({ tenantId: j.tenantId, erp: j.erp, skipped: "proxima_rodada" }); continue; }
    out.push(await runOne(supabase, j.tenantId, j.erp, j.integ, deadline));
  }
  console.log("[erp-stock-reconcile]", JSON.stringify(out).slice(0, 3000));
  return json({ ok: true, ms: Date.now() - started, result: out });
});
