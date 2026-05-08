// Edge Function: backfill-merged-orders-discounts
// Corrige pedidos mesclados antigos onde frete e desconto PIX foram duplicados.
//
// Regras (mesma lógica do create-payment atualizado):
// - Frete inteiro vai apenas no pedido mais antigo (created_at ASC, depois id ASC).
// - Desconto PIX é recalculado por pedido como (subtotal_próprio × pix_percent),
//   onde pix_percent é detectado a partir do valor original (pix_total / subtotal_combinado)
//   ou, se não detectável, lido de integration_* do tenant.
// - Cupom é rateado proporcionalmente (mantém a soma original).
//
// Uso:
//   POST /functions/v1/backfill-merged-orders-discounts
//   { "dry_run": true }                  → apenas preview
//   { "dry_run": false }                 → aplica as mudanças
//   { "tenant_id": "uuid", "dry_run": true }  → restringe a 1 tenant
//   { "payment_link": "https://..." }     → corrige só 1 grupo específico

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function extractAmount(line: string | null): number {
  if (!line) return 0;
  const m = line.match(/R\$\s*([\d]+[.,][\d]{2})/);
  return m ? Number(m[1].replace(",", ".")) : 0;
}

function extractTagLine(observation: string | null, tag: string): string | null {
  if (!observation) return null;
  // Para ANTES do próximo [ (tags coladas sem \n) ou antes do \n
  const re = new RegExp(`\\[${tag}\\][^\\n\\[]*`);
  const m = observation.match(re);
  return m ? m[0].trimEnd() : null;
}

function rewriteObservation(
  observation: string | null,
  freightLine: string,
  pixLine: string,
  couponLine: string,
): string {
  const cleaned = (observation ?? "")
    .replace(/\n?\[FRETE\][^\n\[]*/g, "")
    .replace(/\n?\[PIX_DISCOUNT\][^\n\[]*/g, "")
    .replace(/\n?\[COUPON_DISCOUNT\][^\n\[]*/g, "")
    .replace(/\n+/g, "\n")
    .trim();
  return [cleaned, freightLine, pixLine, couponLine].filter(Boolean).join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dry_run !== false; // padrão = dry-run
    const tenantFilter: string | null = body.tenant_id || null;
    const paymentLinkFilter: string | null = body.payment_link || null;
    const limit: number = Number(body.limit) || 1000;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Buscar grupos de pedidos mesclados (mesmo payment_link, COUNT > 1)
    let groupsQuery = `
      SELECT payment_link, array_agg(id ORDER BY created_at, id) AS ids, MAX(tenant_id::text) AS tenant_id
      FROM orders
      WHERE payment_link IS NOT NULL AND payment_link != ''
    `;
    if (tenantFilter) groupsQuery += ` AND tenant_id = '${tenantFilter}'`;
    if (paymentLinkFilter) groupsQuery += ` AND payment_link = '${paymentLinkFilter.replace(/'/g, "''")}'`;
    groupsQuery += `
      GROUP BY payment_link
      HAVING COUNT(*) > 1
      ORDER BY MIN(created_at) DESC
      LIMIT ${limit}
    `;

    // PostgREST não roda SQL bruto — usar select agrupado em duas etapas
    let qBase = sb.from("orders").select("id, tenant_id, payment_link, created_at").not("payment_link", "is", null).neq("payment_link", "");
    if (tenantFilter) qBase = qBase.eq("tenant_id", tenantFilter);
    if (paymentLinkFilter) qBase = qBase.eq("payment_link", paymentLinkFilter);
    const { data: allRows, error: errAll } = await qBase.limit(20000);
    if (errAll) throw errAll;

    const groupsMap = new Map<string, { tenant_id: string; ids: number[]; created_ats: string[] }>();
    for (const r of allRows || []) {
      const key = String(r.payment_link);
      const g = groupsMap.get(key) ?? { tenant_id: r.tenant_id, ids: [], created_ats: [] };
      g.ids.push(r.id);
      g.created_ats.push(r.created_at);
      groupsMap.set(key, g);
    }
    const groups = Array.from(groupsMap.entries())
      .filter(([, g]) => g.ids.length > 1)
      .slice(0, limit);

    const results: any[] = [];
    let updated = 0;
    let skipped = 0;
    let groupErrors = 0;

    // Cache de pix_percent por tenant
    const pctCache = new Map<string, number>();
    async function getTenantPixPercent(tenantId: string): Promise<number> {
      if (pctCache.has(tenantId)) return pctCache.get(tenantId)!;
      const [a, p, m, i] = await Promise.all([
        sb.from("integration_appmax").select("pix_discount_percent, is_active").eq("tenant_id", tenantId).maybeSingle(),
        sb.from("integration_pagarme").select("pix_discount_percent, is_active").eq("tenant_id", tenantId).maybeSingle(),
        sb.from("integration_mp").select("pix_discount_percent, is_active").eq("tenant_id", tenantId).maybeSingle(),
        sb.from("integration_infinitepay").select("pix_discount_percent, is_active").eq("tenant_id", tenantId).maybeSingle(),
      ]);
      const pick = (d: any) => (d?.is_active && Number(d?.pix_discount_percent) > 0 ? Number(d.pix_discount_percent) : 0);
      const pct = pick(a.data) || pick(p.data) || pick(m.data) || pick(i.data) || 0;
      pctCache.set(tenantId, pct);
      return pct;
    }

    for (const [paymentLink, g] of groups) {
      try {
        // Sortear ids por created_at já feito; reordenar para garantir
        const orderRows: { id: number; created_at: string }[] = g.ids.map((id, idx) => ({ id, created_at: g.created_ats[idx] }));
        orderRows.sort((a, b) => {
          const ta = Date.parse(a.created_at) || 0;
          const tb = Date.parse(b.created_at) || 0;
          if (ta !== tb) return ta - tb;
          return a.id - b.id;
        });
        const orderedIds = orderRows.map((r) => r.id);

        // Carregar dados completos
        const { data: orders, error: ordersErr } = await sb
          .from("orders")
          .select("id, observation, total_amount, cart_id, tenant_id, is_paid")
          .in("id", orderedIds);
        if (ordersErr) throw ordersErr;
        if (!orders || orders.length === 0) { skipped++; continue; }
        const ordersById = new Map(orders.map((o) => [o.id, o]));

        // Cart subtotal por pedido
        const cartIds = orders.filter((o) => o.cart_id).map((o) => o.cart_id);
        const subtotalByCart = new Map<number, number>();
        if (cartIds.length) {
          const { data: items } = await sb.from("cart_items").select("cart_id, qty, unit_price").in("cart_id", cartIds);
          for (const it of items || []) {
            subtotalByCart.set(it.cart_id, (subtotalByCart.get(it.cart_id) ?? 0) + Number(it.qty) * Number(it.unit_price));
          }
        }

        // Frete original (qualquer pedido — todos têm o mesmo valor duplicado)
        let freightTotal = 0;
        let freightLineTemplate = "";
        for (const o of orders) {
          const line = extractTagLine(o.observation, "FRETE");
          if (line) {
            freightTotal = extractAmount(line);
            freightLineTemplate = line;
            if (freightTotal > 0) break;
          }
        }
        if (!freightLineTemplate) freightLineTemplate = "[FRETE] Retirada";

        // Desconto PIX original cheio (qualquer pedido)
        let pixOriginal = 0;
        for (const o of orders) {
          const line = extractTagLine(o.observation, "PIX_DISCOUNT");
          const v = extractAmount(line);
          if (v > 0) { pixOriginal = v; break; }
        }
        // Cupom original cheio
        let couponOriginal = 0;
        let couponSuffix = "";
        for (const o of orders) {
          const line = extractTagLine(o.observation, "COUPON_DISCOUNT");
          const v = extractAmount(line);
          if (v > 0) {
            couponOriginal = v;
            const codeMatch = line!.match(/\(([^)]+)\)\s*$/);
            couponSuffix = codeMatch ? ` (${codeMatch[1]})` : "";
            break;
          }
        }

        const subtotals = orderedIds.map((id) => subtotalByCart.get(ordersById.get(id)!.cart_id ?? -1) ?? 0);
        const combinedSubtotal = subtotals.reduce((s, v) => s + v, 0);

        // Detectar pix_percent: PRIMEIRO tenta config do tenant (fonte de verdade);
        // SÓ usa derivado (pix_original/subtotal) como fallback.
        // Carrinhos podem ter mudado pós-pagamento, fazendo o derivado mentir.
        let pixPercent = 0;
        let pixPercentSource: string = "none";
        if (pixOriginal > 0) {
          const tenantPct = await getTenantPixPercent(g.tenant_id);
          if (tenantPct > 0) {
            pixPercent = tenantPct;
            pixPercentSource = "tenant_config";
          } else if (combinedSubtotal > 0) {
            const ratio = (pixOriginal / combinedSubtotal) * 100;
            const rounded = Math.round(ratio);
            pixPercent = (Math.abs(ratio - rounded) < 0.6) ? rounded : round2(ratio);
            pixPercentSource = "derived_from_observation";
          }
        }

        // Calcular novos valores
        const groupResult: any = {
          payment_link: paymentLink,
          tenant_id: g.tenant_id,
          orders: [] as any[],
          freight_total: freightTotal,
          pix_original: pixOriginal,
          pix_percent_detected: pixPercent,
          combined_subtotal: combinedSubtotal,
        };

        let couponRemainingCents = Math.round(couponOriginal * 100);
        for (let i = 0; i < orderedIds.length; i++) {
          const orderId = orderedIds[i];
          const o = ordersById.get(orderId)!;
          const subtotalProprio = subtotals[i];
          const isFirst = i === 0;
          const isLast = i === orderedIds.length - 1;

          const novoPix = pixPercent > 0 && subtotalProprio > 0
            ? round2((subtotalProprio * pixPercent) / 100)
            : 0;

          let novoCupom = 0;
          if (orderedIds.length === 1) {
            novoCupom = couponRemainingCents / 100; couponRemainingCents = 0;
          } else if (isLast) {
            novoCupom = couponRemainingCents / 100; couponRemainingCents = 0;
          } else if (combinedSubtotal > 0) {
            const ratio = subtotalProprio / combinedSubtotal;
            const cents = Math.round(couponOriginal * 100 * ratio);
            novoCupom = cents / 100;
            couponRemainingCents -= cents;
          }

          const novoFrete = isFirst ? freightTotal : 0;
          const freightLineForThis = isFirst ? freightLineTemplate : "";
          const pixLine = novoPix > 0 ? `[PIX_DISCOUNT] R$ ${novoPix.toFixed(2)}` : "";
          const couponLine = novoCupom > 0 ? `[COUPON_DISCOUNT] R$ ${novoCupom.toFixed(2)}${couponSuffix}` : "";

          const newObs = rewriteObservation(o.observation, freightLineForThis, pixLine, couponLine);
          const newTotal = round2(Math.max(0, subtotalProprio - novoPix - novoCupom) + novoFrete);

          const orderResult: any = {
            id: orderId,
            is_first: isFirst,
            subtotal_proprio: subtotalProprio,
            old_total: Number(o.total_amount),
            new_total: newTotal,
            delta: round2(newTotal - Number(o.total_amount)),
            old_pix: extractAmount(extractTagLine(o.observation, "PIX_DISCOUNT")),
            new_pix: novoPix,
            old_freight: extractAmount(extractTagLine(o.observation, "FRETE")),
            new_freight: novoFrete,
            new_observation: newObs,
            changed: false,
          };

          const obsChanged = (o.observation ?? "").trim() !== newObs.trim();
          const totalChanged = Math.abs(Number(o.total_amount) - newTotal) > 0.01;
          orderResult.changed = obsChanged || totalChanged;

          if (orderResult.changed && !dryRun) {
            const { error: updErr } = await sb
              .from("orders")
              .update({ observation: newObs, total_amount: newTotal })
              .eq("id", orderId);
            if (updErr) {
              orderResult.error = updErr.message;
              groupErrors++;
            } else {
              updated++;
            }
          } else if (orderResult.changed) {
            updated++;
          } else {
            skipped++;
          }

          groupResult.orders.push(orderResult);
        }

        results.push(groupResult);
      } catch (err) {
        groupErrors++;
        results.push({ payment_link: paymentLink, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        groups_total: groups.length,
        orders_to_change: updated,
        orders_unchanged: skipped,
        errors: groupErrors,
        groups: results,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
