// Garante que a tenant (fluxo_envio) tenha uma instância uazapi provisionada.
// Chamado no primeiro login como retry caso o signup não tenha conseguido criar.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createInstance, setWebhook } from '../_shared/uazapi-api.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Autentica pelo JWT do chamador
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ success: false, error: 'missing auth' }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ success: false, error: 'invalid auth' }, 401);
    const userId = userData.user.id;

    const { data: profile } = await admin
      .from('profiles')
      .select('tenant_id, access_scope')
      .eq('id', userId)
      .maybeSingle();

    if (!profile?.tenant_id || profile.access_scope !== 'fluxo_envio') {
      return json({ success: false, error: 'not eligible' });
    }

    const { data: tenant } = await admin
      .from('tenants')
      .select('id, name')
      .eq('id', profile.tenant_id)
      .maybeSingle();
    if (!tenant) return json({ success: false, error: 'tenant not found' });

    const { data: existing } = await admin
      .from('integration_whatsapp')
      .select('id, uazapi_url, uazapi_admin_token, uazapi_token, instance_name')
      .eq('tenant_id', tenant.id)
      .eq('provider', 'uazapi')
      .maybeSingle();

    // Já provisionado
    if (existing?.uazapi_token) {
      return json({ success: true, provisioned: true, alreadyProvisioned: true });
    }

    // Base de credenciais admin (URL + token compartilhado)
    let url = existing?.uazapi_url;
    let adminToken = existing?.uazapi_admin_token;
    if (!url || !adminToken) {
      const { data: sample } = await admin
        .from('integration_whatsapp')
        .select('uazapi_url, uazapi_admin_token')
        .eq('provider', 'uazapi')
        .not('uazapi_admin_token', 'is', null)
        .not('uazapi_url', 'is', null)
        .limit(1)
        .maybeSingle();
      url = sample?.uazapi_url ?? null;
      adminToken = sample?.uazapi_admin_token ?? null;
    }
    if (!url || !adminToken) return json({ success: false, error: 'uazapi base not configured' });

    const instName = existing?.instance_name || `${tenant.name} - FL`;
    const webhookSecret = crypto.randomUUID();

    if (!existing) {
      await admin.from('integration_whatsapp').insert({
        tenant_id: tenant.id,
        provider: 'uazapi',
        uazapi_url: url,
        uazapi_admin_token: adminToken,
        instance_name: instName,
        webhook_secret: webhookSecret,
        is_active: true,
      });
    }

    const created = await createInstance(
      { url, adminToken },
      instName,
      tenant.name,
    );
    if (!created.success || !created.token) {
      return json({ success: false, error: created.error || 'createInstance failed' });
    }

    await admin
      .from('integration_whatsapp')
      .update({ uazapi_token: created.token, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant.id);

    await setWebhook(
      { url, token: created.token },
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/uazapi-webhook`,
    ).catch(() => {});

    return json({ success: true, provisioned: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message });
  }
});
