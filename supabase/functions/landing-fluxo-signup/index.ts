// Provisiona um usuário "fluxo_envio" a partir da landing /fluxo-envio:
// cria auth user, tenant trial, profile com access_scope='fluxo_envio'
// e já configura a integração WhatsApp/uazapi (mesma base dos tenants Cartzy).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createInstance, setWebhook } from '../_shared/uazapi-api.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function slugify(input: string) {
  return (input || 'fluxo')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'fluxo';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim() || email.split('@')[0];
    const company = String(body.company || '').trim() || name;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return new Response(JSON.stringify({ success: false, error: 'E-mail inválido.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ success: false, error: 'Senha precisa de pelo menos 6 caracteres.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 1) Criar usuário
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, source: 'landing_fluxo_envio' },
    });
    if (createErr || !created?.user) {
      return new Response(JSON.stringify({ success: false, error: createErr?.message || 'Falha ao criar usuário.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = created.user.id;

    // 2) Criar tenant (slug único)
    const baseSlug = slugify(company);
    let slug = `${baseSlug}-${userId.slice(0, 6)}`;
    const trialEnds = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data: tenant, error: tenantErr } = await admin
      .from('tenants')
      .insert({
        name: company,
        slug,
        admin_email: email,
        admin_user_id: userId,
        plan_type: 'trial',
        trial_ends_at: trialEnds,
        subscription_ends_at: trialEnds,
        is_active: true,
        enable_live: false,
        enable_sendflow: true,
      })
      .select('id')
      .single();

    if (tenantErr || !tenant) {
      // rollback do usuário
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return new Response(JSON.stringify({ success: false, error: tenantErr?.message || 'Falha ao criar empresa.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 3) Upsert profile com access_scope=fluxo_envio
    const { error: profileErr } = await admin
      .from('profiles')
      .upsert({
        id: userId,
        email,
        role: 'tenant_admin',
        tenant_id: tenant.id,
        access_scope: 'fluxo_envio',
      }, { onConflict: 'id' });

    if (profileErr) {
      await admin.from('tenants').delete().eq('id', tenant.id).catch(() => {});
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return new Response(JSON.stringify({ success: false, error: profileErr.message }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 4) Provisionar integração WhatsApp/uazapi (mesma base dos tenants Cartzy)
    //    Reaproveita a URL e o admin token compartilhado por qualquer tenant já
    //    configurado. Cria uma nova instância uazapi automaticamente.
    let whatsappProvisioned = false;
    try {
      const { data: sample } = await admin
        .from('integration_whatsapp')
        .select('uazapi_url, uazapi_admin_token')
        .eq('provider', 'uazapi')
        .not('uazapi_admin_token', 'is', null)
        .not('uazapi_url', 'is', null)
        .limit(1)
        .maybeSingle();

      if (sample?.uazapi_url && sample?.uazapi_admin_token) {
        const instName = `fluxo-${tenant.id.slice(0, 8)}`;
        const webhookSecret = crypto.randomUUID();

        // Cria a linha primeiro para não perder o vínculo caso o create falhe
        await admin.from('integration_whatsapp').insert({
          tenant_id: tenant.id,
          provider: 'uazapi',
          uazapi_url: sample.uazapi_url,
          uazapi_admin_token: sample.uazapi_admin_token,
          instance_name: instName,
          webhook_secret: webhookSecret,
          is_active: true,
        });

        const created = await createInstance(
          { url: sample.uazapi_url, adminToken: sample.uazapi_admin_token },
          instName,
          company,
        );
        if (created.success && created.token) {
          await admin
            .from('integration_whatsapp')
            .update({ uazapi_token: created.token, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenant.id);
          await setWebhook(
            { url: sample.uazapi_url, token: created.token },
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/uazapi-webhook`,
          ).catch(() => {});
          whatsappProvisioned = true;
        }
      }
    } catch (e) {
      console.error('[landing-fluxo-signup] whatsapp provisioning failed:', (e as Error).message);
    }

    return new Response(JSON.stringify({ success: true, tenantId: tenant.id, whatsappProvisioned }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
