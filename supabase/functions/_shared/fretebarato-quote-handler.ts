import { enforceRateLimit } from './rate-limit.ts';
import { buildQuotePayload, buildNuvemshopQuotePayload, normalizeQuoteConfiguration, normalizeQuotes, quoteEndpoint } from './fretebarato.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Public checkout only receives prices. Credentials and provider responses stay on the server.
export async function handleFreteBaratoQuote(req: Request, db: any, fetcher: typeof fetch = fetch) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ success: false, error: 'Método não permitido.' }, 405);
  try {
    const body = await req.json();
    if (!/^[0-9a-f-]{36}$/i.test(String(body?.tenant_id ?? ''))) return json({ success: false, error: 'Loja inválida.' }, 400);
    const payload = buildQuotePayload(body.to_postal_code, body.products);
    const blocked = await enforceRateLimit(req, db, `fretebarato:${body.tenant_id}`, 60, 60);
    if (blocked) return blocked;
    const { data: tenant, error: tenantError } = await db.from('tenants').select('is_active').eq('id', body.tenant_id).maybeSingle();
    if (tenantError || !tenant?.is_active) return json({ success: false, error: 'Loja indisponível.' });
    const { data: integration, error } = await db.from('shipping_integrations')
      .select('access_token, client_id, scope').eq('tenant_id', body.tenant_id).eq('provider', 'fretebarato').eq('is_active', true).maybeSingle();
    if (error || !integration?.access_token) return json({ success: false, error: 'Frete Barato não está configurado ou ativo nesta loja.' });
    const config = normalizeQuoteConfiguration(integration.scope ?? '', integration.client_id ?? '');
    const endpoint = quoteEndpoint(config.platform, config.customerId);
    const providerPayload = config.platform.toLowerCase() === 'nuvemshop' ? buildNuvemshopQuotePayload(payload) : payload;
    const response = await fetcher(endpoint, {
      method: 'POST', signal: AbortSignal.timeout(10000), redirect: 'error',
      headers: { Authorization: `Bearer ${integration.access_token}`, 'Content-Type': 'application/json', 'User-Agent': 'Cartzy (suporte@orderzaps.com)' },
      body: JSON.stringify(providerPayload),
    });
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403 ? 'Verifique a autorização da conta no Frete Barato.'
        : response.status === 400 ? 'O Frete Barato não aceitou os dados da cotação. Confira peso, dimensões e CEP.'
        : response.status === 404 ? 'O Frete Barato não retornou cobertura para esta cotação.' : 'O Frete Barato está indisponível. Tente novamente.';
      return json({ success: false, error: message });
    }
    return json({ success: true, provider: 'fretebarato', shipping_options: normalizeQuotes(await response.json()) });
  } catch (error) {
    // Never expose upstream bodies or token-bearing request details to the public checkout.
    const message = error instanceof Error && (error.message.startsWith('Informe ') || error.message.startsWith('Confira '))
      ? error.message : 'Não foi possível consultar o Frete Barato. Tente novamente.';
    return json({ success: false, error: message });
  }
}
