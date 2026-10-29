import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { RequestSchema, roleStatus, planPayload, linkPayload, requestPagarme } from './service.ts';

Deno.test('Only super_admin is authorized', () => {
  assertEquals(roleStatus('super_admin'), 200);
  for (const role of ['tenant_admin', 'staff', null, undefined]) assertEquals(roleStatus(role), 403);
});
Deno.test('Cycles default to 12 and must be positive integers', () => {
  const parsed = RequestSchema.parse({ action: 'create', name: 'Plano', price: 29.9 });
  if (parsed.action !== 'create') throw new Error('Expected create');
  assertEquals(parsed.cycles, 12);
  assertEquals(RequestSchema.safeParse({ action: 'create', name: 'Plano', price: 29.9, cycles: 1.5 }).success, false);
  assertEquals(RequestSchema.safeParse({ action: 'create', name: 'Plano', price: 29.9, cycles: 0 }).success, false);
});
Deno.test('Monthly prepaid credit card plan uses cents', () => {
  assertEquals(planPayload('Plano', 29.9, 12), {
    name: 'Plano', currency: 'BRL', interval: 'month', interval_count: 1, billing_type: 'prepaid',
    payment_methods: ['credit_card'], installments: [1], cycles: 12,
    items: [{ name: 'Plano', quantity: 1, pricing_scheme: { scheme_type: 'unit', price: 2990 } }],
  });
});
Deno.test('Subscription link has requested recurrence and capture settings', () => {
  assertEquals(linkPayload('Plano', 29.9, 'plan_test'), {
    type: 'subscription', name: 'Plano', is_building: false,
    payment_settings: { accepted_payment_methods: ['credit_card'], credit_card_settings: { operation_type: 'auth_and_capture', installments: [{ number: 1, total: 2990 }] } },
    cart_settings: { recurrences: [{ plan_id: 'plan_test', start_in: 1 }] },
  });
});
Deno.test('Preserve entire provider rejection; Basic empty password and User-Agent', async () => {
  const providerError = { message: 'Invalid request', errors: { 'cart_settings.recurrences': ['not accepted'] }, extra: { trace: 'test' } };
  const fetcher: typeof fetch = (_url, options) => {
    const headers = new Headers(options?.headers);
    assertEquals(headers.get('Authorization'), `Basic ${btoa('test-key:')}`);
    assertEquals(headers.get('User-Agent'), 'cartzy/1.0');
    return Promise.resolve(new Response(JSON.stringify(providerError), { status: 422 }));
  };
  const result = await requestPagarme('/plans', {}, 'test-key', fetcher);
  assertEquals(result.ok, false);
  assertEquals(result.status, 422);
  assertEquals(result.body, providerError);
});