// Dias adicionais no prazo das transportadoras de integração (configurado por empresa em Fretes).
// O número é somado ao prazo que a transportadora devolveu, em todos os checkouts (live, público e antigo).
import { supabase } from '@/integrations/supabase/client';

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { ts: number; p: Promise<number> }>();

/** Dias adicionais da empresa (0 se não configurou ou se a tabela ainda não existe). Guarda por 5 min. */
export function loadExtraDeliveryDays(tenantId: string): Promise<number> {
  if (!tenantId) return Promise.resolve(0);
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.p;
  const p = Promise.resolve(
    supabase.from('tenant_shipping_prazo' as any).select('extra_delivery_days').eq('tenant_id', tenantId).maybeSingle(),
  )
    .then((r: any) => Math.max(0, Math.floor(Number(r?.data?.extra_delivery_days) || 0)))
    .catch(() => 0);
  cache.set(tenantId, { ts: Date.now(), p });
  return p;
}

/** Esquece o valor guardado (depois de salvar um novo número). */
export function clearExtraDeliveryDays(tenantId: string) {
  cache.delete(tenantId);
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Soma `days` ao prazo em texto que a transportadora devolveu:
 *  "5 dias úteis" -> "7 dias úteis";  "5-10 dias úteis" -> "7-12 dias úteis";
 *  "Entrega prevista até 20/11/2026" (Frete Barato) -> data + days dias corridos;
 *  textos sem prazo ("Consulte", "?", "Imediato") ficam como estão.
 */
export function addDeliveryDays(text: string, days: number): string {
  const n = Math.floor(Number(days) || 0);
  const t = String(text ?? '');
  if (n <= 0) return t;
  const date = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (date) {
    const d = new Date(Date.UTC(Number(date[3]), Number(date[2]) - 1, Number(date[1])));
    d.setUTCDate(d.getUTCDate() + n);
    return t.replace(date[0], `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`);
  }
  if (!/dia/i.test(t) && !/^\s*\d+(?:\s*-\s*\d+)?\s*$/.test(t)) return t; // só número de dias ("5", "5-10") também vale
  return t.replace(/(\d+)(?:\s*(?:-|a|à|até)\s*(\d+))?/i, (_m, a, b) => (b ? `${Number(a) + n}-${Number(b) + n}` : `${Number(a) + n}`));
}
