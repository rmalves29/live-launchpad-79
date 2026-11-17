// Olist ERP: sincronização do catálogo em segundo plano.
// A Olist limita a 60 leituras por minuto por conta, então o servidor lê aos poucos (REQ_BUDGET por rodada do agendamento),
// grava o ponto onde parou em integration_olist.catalog_sync e continua na rodada seguinte.
// Fases: stock (saldo do depósito; só entra quem tem saldo ou já está no Cartzy) -> products (preço, tipo, promoção)
// -> details (itens novos que a lista não trouxe, um a um) -> done.
// Modo "full" lê tudo e apaga do catálogo o que sumiu; "incremental" lê só o que mudou desde a última sincronização completa.
// A Olist só é LIDA aqui.
// deno-lint-ignore-file no-explicit-any
import { olistRequest, olistErrorMessage } from "./olist.ts";

export const PAGE = 100;
export const REQ_BUDGET = 45; // abaixo dos 60/min da Olist, deixando folga para a tela e para os pedidos
const MAX_ERRORS = 5;
const DETAILS_BATCH = 20;

export type SyncState = {
  mode: "full" | "incremental";
  phase: "stock" | "products" | "details" | "done";
  offset: number;
  started_at: string;
  since: string | null;
  deposit_id: number;
  stock_total: number;
  products_total: number;
  kept: number;
  errors: number;
  error: string | null;
  cancelled?: boolean;
  finished_at?: string | null;
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (v: unknown) => String(v ?? "").trim();
const promoOf = (promo: unknown, preco: unknown) => { const pr = num(promo); return pr > 0 && pr < num(preco) ? pr : 0; };
// dataAlteracao da Olist é no horário de Brasília (UTC-3); recua 1 h extra de folga
const brt = (iso: string) => new Date(new Date(iso).getTime() - 4 * 3600_000).toISOString().slice(0, 19).replace("T", " ");

export function newSyncState(depositId: number, previous: SyncState | null, lastSyncAt: string | null, forceFull: boolean): SyncState {
  const canIncrement = !forceFull && !!lastSyncAt && previous?.phase === "done" && !previous?.cancelled && Number(previous?.deposit_id) === depositId;
  return {
    mode: canIncrement ? "incremental" : "full",
    phase: "stock", offset: 0, started_at: new Date().toISOString(),
    since: canIncrement ? lastSyncAt : null, deposit_id: depositId,
    stock_total: 0, products_total: 0, kept: 0, errors: 0, error: null, finished_at: null,
  };
}

/** Roda uma rodada para UMA empresa. Devolve o estado depois da rodada (ou null se não há nada rodando). */
export async function runCatalogSync(supabase: any, tenantId: string, deadlineMs: number): Promise<SyncState | null> {
  const { data: row } = await supabase.from("integration_olist")
    .select("catalog_sync, catalog_sync_running").eq("tenant_id", tenantId).maybeSingle();
  if (!row?.catalog_sync_running || !row.catalog_sync) return null;
  let st: SyncState = row.catalog_sync;
  let req = 0;

  const save = async (patch: Partial<SyncState>) => {
    st = { ...st, ...patch };
    // só DESLIGA o indicador (fim ou erro); quem religa é a tela. Assim um "parar" no meio da rodada não é desfeito.
    const payload: Record<string, unknown> = { catalog_sync: st };
    if (st.phase === "done" || st.error) payload.catalog_sync_running = false;
    await supabase.from("integration_olist").update(payload).eq("tenant_id", tenantId);
  };
  // devolve true quando a rodada deve parar
  const onFail = async (status: number, data: any, what: string): Promise<boolean> => {
    if (status === 429) return true; // limite por minuto: a próxima rodada continua do mesmo ponto
    if (status === 401 || status === 403) { await save({ error: olistErrorMessage(status, data, what) }); return true; }
    const errors = st.errors + 1;
    await save(errors >= MAX_ERRORS ? { errors, error: olistErrorMessage(status, data, what) } : { errors });
    return true;
  };
  const budgetLeft = () => req < REQ_BUDGET && Date.now() < deadlineMs;
  const since = st.since ? `&dataAlteracao=${encodeURIComponent(brt(st.since))}` : "";

  while (budgetLeft() && st.phase !== "done" && !st.error) {
    // quem apertou "parar" na tela: relê o estado de vez em quando
    if (req > 0 && req % 15 === 0) {
      const { data: again } = await supabase.from("integration_olist").select("catalog_sync_running").eq("tenant_id", tenantId).maybeSingle();
      if (!again?.catalog_sync_running) break;
    }

    if (st.phase === "stock") {
      const r = await olistRequest(supabase, tenantId, "GET", `/estoque?limit=${PAGE}&offset=${st.offset}${since}`, undefined, 2); req++;
      if (!r.ok) { await onFail(r.status, r.data, "o estoque"); break; }
      const itens: any[] = r.data?.itens || [];
      const total = num(r.data?.paginacao?.total);
      const stock = itens.map((i) => {
        const d = (i.depositos || []).find((x: any) => num(x.id) === Number(st.deposit_id));
        const saldo = d ? (d.disponivel ?? d.saldo) : 0;
        return { olist_id: num(i.idProduto), sku: norm(i.sku), nome: norm(i.nome), saldo: Math.max(0, Math.floor(num(saldo))) };
      }).filter((x) => x.olist_id > 0);
      const ids = stock.map((x) => x.olist_id);
      let keep: typeof stock = [];
      if (ids.length) {
        const [linked, have] = await Promise.all([
          supabase.from("products").select("olist_product_id").eq("tenant_id", tenantId).in("olist_product_id", ids),
          supabase.from("olist_catalog").select("olist_id").eq("tenant_id", tenantId).in("olist_id", ids),
        ]);
        const linkedSet = new Set((linked.data || []).map((p: any) => Number(p.olist_product_id)));
        const haveSet = new Set((have.data || []).map((c: any) => Number(c.olist_id)));
        // fica quem tem saldo ou já está no Cartzy (para o saldo poder zerar); no incremental também quem já estava no catálogo
        keep = stock.filter((x) => x.saldo > 0 || linkedSet.has(x.olist_id) || (st.mode === "incremental" && haveSet.has(x.olist_id)));
        if (keep.length) {
          const { error } = await supabase.from("olist_catalog").upsert(
            keep.map((x) => ({ tenant_id: tenantId, olist_id: x.olist_id, sku: x.sku, nome: x.nome, saldo: x.saldo, synced_at: st.started_at })),
            { onConflict: "tenant_id,olist_id" });
          if (error) { await onFail(500, { error: error.message }, "o catálogo"); break; }
        }
      }
      const next = st.offset + PAGE;
      const last = itens.length < PAGE || (total > 0 && next >= total);
      await save({ offset: last ? 0 : next, phase: last ? "products" : "stock", stock_total: total || st.stock_total, kept: st.kept + keep.length, errors: 0 });
      continue;
    }

    if (st.phase === "products") {
      const r = await olistRequest(supabase, tenantId, "GET", `/produtos?limit=${PAGE}&offset=${st.offset}&situacao=A${since}`, undefined, 2); req++;
      if (!r.ok) { await onFail(r.status, r.data, "os produtos"); break; }
      const itens: any[] = r.data?.itens || [];
      const total = num(r.data?.paginacao?.total);
      const ids = itens.map((p) => num(p.id)).filter((n) => n > 0);
      if (ids.length) {
        const { data: have } = await supabase.from("olist_catalog").select("olist_id").eq("tenant_id", tenantId).in("olist_id", ids);
        const haveSet = new Set((have || []).map((c: any) => Number(c.olist_id)));
        const parents = itens.filter((p) => norm(p.tipoVariacao) === "P" && haveSet.has(num(p.id))).map((p) => num(p.id));
        if (parents.length) await supabase.from("olist_catalog").delete().eq("tenant_id", tenantId).in("olist_id", parents); // pai não tem estoque próprio
        const rows = itens.filter((p) => norm(p.tipoVariacao) !== "P" && haveSet.has(num(p.id))).map((p) => ({
          tenant_id: tenantId, olist_id: num(p.id), sku: norm(p.sku), nome: norm(p.descricao), preco: num(p.precos?.preco),
          preco_promocional: promoOf(p.precos?.precoPromocional, p.precos?.preco),
          tipo: norm(p.tipo) || "S", variacao: norm(p.tipoVariacao) || "N",
        }));
        if (rows.length) {
          let { error } = await supabase.from("olist_catalog").upsert(rows, { onConflict: "tenant_id,olist_id" });
          if (error) ({ error } = await supabase.from("olist_catalog").upsert(rows.map(({ preco_promocional: _p, ...rest }: any) => rest), { onConflict: "tenant_id,olist_id" }));
          if (error) { await onFail(500, { error: error.message }, "o catálogo"); break; }
        }
      }
      const next = st.offset + PAGE;
      const last = itens.length < PAGE || (total > 0 && next >= total);
      await save({ offset: last ? 0 : next, phase: last ? "details" : "products", products_total: total || st.products_total, errors: 0 });
      continue;
    }

    if (st.phase === "details") {
      // itens que entraram pelo estoque mas a lista de produtos não trouxe (tipo vazio): busca um a um
      const { data: pend } = await supabase.from("olist_catalog").select("olist_id").eq("tenant_id", tenantId).eq("tipo", "").limit(DETAILS_BATCH);
      if (!pend?.length) {
        if (st.mode === "full") await supabase.from("olist_catalog").delete().eq("tenant_id", tenantId).lt("synced_at", st.started_at);
        const now = new Date().toISOString();
        await supabase.from("integration_olist").update({ last_catalog_sync_at: now }).eq("tenant_id", tenantId);
        await save({ phase: "done", finished_at: now, errors: 0 });
        break;
      }
      let stop = false;
      for (const p of pend) {
        if (!budgetLeft()) break;
        const id = Number(p.olist_id);
        const r = await olistRequest(supabase, tenantId, "GET", `/produtos/${id}`, undefined, 2); req++;
        if (r.ok) {
          const d = r.data || {};
          const patch: any = {
            sku: norm(d.sku), nome: norm(d.descricao), preco: num(d.precos?.preco),
            preco_promocional: promoOf(d.precos?.precoPromocional, d.precos?.preco),
            tipo: norm(d.tipo) || "S", variacao: norm(d.tipoVariacao) || "N",
          };
          let { error } = await supabase.from("olist_catalog").update(patch).eq("tenant_id", tenantId).eq("olist_id", id);
          if (error) { delete patch.preco_promocional; await supabase.from("olist_catalog").update(patch).eq("tenant_id", tenantId).eq("olist_id", id); }
          if (patch.variacao === "P") await supabase.from("olist_catalog").delete().eq("tenant_id", tenantId).eq("olist_id", id);
        } else if (r.status === 404) {
          await supabase.from("olist_catalog").delete().eq("tenant_id", tenantId).eq("olist_id", id); // produto apagado na Olist
        } else { stop = await onFail(r.status, r.data, "o produto"); break; }
      }
      if (stop) break;
      continue;
    }
  }

  await supabase.from("integration_olist").update({ catalog_sync_last_at: new Date().toISOString() }).eq("tenant_id", tenantId);
  return st;
}
