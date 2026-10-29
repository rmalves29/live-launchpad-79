import { z } from 'npm:zod@3.23.8';

export const RequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({
    action: z.literal('create'),
    name: z.string().trim().min(1).max(255),
    price: z.number().finite().positive().max(9999999999.99)
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001, 'Use no máximo duas casas decimais'),
    cycles: z.number().int().positive().max(2147483647).default(12),
  }),
]);

export function roleStatus(role: unknown) {
  return role === 'super_admin' ? 200 : 403;
}

export function planPayload(name: string, price: number, cycles: number) {
  return {
    name, currency: 'BRL', interval: 'month', interval_count: 1,
    billing_type: 'prepaid', payment_methods: ['credit_card'], installments: [1], cycles,
    items: [{ name, quantity: 1, pricing_scheme: { scheme_type: 'unit', price: Math.round(price * 100) } }],
  };
}

export function linkPayload(name: string, price: number, planId: string) {
  return {
    type: 'subscription', name, is_building: false,
    payment_settings: {
      accepted_payment_methods: ['credit_card'],
      credit_card_settings: { operation_type: 'auth_and_capture', installments: [{ number: 1, total: Math.round(price * 100) }] },
    },
    cart_settings: { recurrences: [{ plan_id: planId, start_in: 1 }] },
  };
}

export async function requestPagarme(path: string, payload: unknown, apiKey: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`https://api.pagar.me/core/v5${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${apiKey}:`)}`, 'Content-Type': 'application/json', 'User-Agent': 'cartzy/1.0' },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = raw; }
  return { ok: response.ok, status: response.status, body };
}