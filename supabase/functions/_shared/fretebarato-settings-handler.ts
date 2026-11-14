import { authorizeTenantCaller, guardResponse } from './auth-guard.ts';
import { quoteEndpoint } from './fretebarato.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export async function handleFreteBaratoSettings(req: Request, db: any, authorize = authorizeTenantCaller) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ success: false, error: 'Método não permitido.' }, 405);
  try {
    const body = await req.json();
    const tenantId = String(body?.tenant_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return json({ success: false, error: 'Loja inválida.' }, 400);
    const auth = await authorize(req, db, tenantId);
    if (!auth.ok) return guardResponse(auth, cors);
    const { data: current, error: readError } = await db.from('shipping_integrations').select('id, access_token, client_id, scope, is_active')
      .eq('tenant_id', tenantId).eq('provider', 'fretebarato').maybeSingle();
    if (readError) return json({ success: false, error: 'Não foi possível carregar a integração.' }, 500);
    if (body.action === 'get') return json({ success: true, configured: Boolean(current), hasToken: Boolean(current?.access_token),
      customerId: current?.client_id ?? '', platform: current?.scope ?? '', isActive: current?.is_active ?? false });
    if (body.action === 'toggle') {
      if (!current || typeof body.isActive !== 'boolean') return json({ success: false, error: 'Salve a configuração antes de ativar.' }, 400);
      if (body.isActive) quoteEndpoint(current.scope ?? '', current.client_id ?? '');
      if (body.isActive && !current.access_token) return json({ success: false, error: 'Cadastre o token antes de ativar.' }, 400);
      const { error } = await db.from('shipping_integrations').update({ is_active: body.isActive, updated_at: new Date().toISOString() }).eq('id', current.id).eq('tenant_id', tenantId);
      if (error) return json({ success: false, error: error.code === '23514' ? 'Limite de duas integrações de frete ativas. Desative uma antes de ativar o Frete Barato.' : 'Não foi possível alterar a integração.' }, 400);
      return json({ success: true });
    }
    if (body.action !== 'save') return json({ success: false, error: 'Ação inválida.' }, 400);
    const platform = String(body.platform ?? '').trim(), customerId = String(body.customerId ?? '').trim();
    quoteEndpoint(platform, customerId);
    const token = String(body.token ?? '').trim();
    if ((token && (token.length > 4000 || /\s/.test(token))) || (!token && !current?.access_token)) return json({ success: false, error: 'Informe um token válido do Frete Barato.' }, 400);
    const values = { tenant_id: tenantId, provider: 'fretebarato', access_token: token || current!.access_token,
      client_id: customerId, scope: platform, sandbox: false, is_active: current?.is_active ?? false, updated_at: new Date().toISOString() };
    const result = current ? await db.from('shipping_integrations').update(values).eq('id', current.id).eq('tenant_id', tenantId)
      : await db.from('shipping_integrations').insert(values);
    if (result.error) return json({ success: false, error: 'Não foi possível salvar a integração.' }, 400);
    return json({ success: true });
  } catch {
    return json({ success: false, error: 'Confira a plataforma, o Customer ID e os dados informados.' }, 400);
  }
}
