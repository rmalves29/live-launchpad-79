import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL = Deno.env.get('PUBLIC_APP_URL') || 'https://app.orderzaps.com';
const REDIRECT_URI = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-official-auth-callback';

function redirect(qs: string) {
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: `${APP_URL}/whatsapp/oficial?${qs}` },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const tenantId = url.searchParams.get('state');
    const errParam = url.searchParams.get('error');

    if (errParam) return redirect(`whatsapp_error=${encodeURIComponent(errParam)}`);
    if (!code) return redirect('whatsapp_error=codigo_nao_fornecido');
    if (!tenantId) return redirect('whatsapp_error=tenant_nao_identificado');

    const APP_ID = Deno.env.get('FACEBOOK_APP_ID');
    const APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET');
    if (!APP_ID || !APP_SECRET) return redirect('whatsapp_error=credenciais_nao_configuradas');

    // 1. Trocar código por access token (short-lived)
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`
    );
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error('[whatsapp-callback] token error', tokenJson);
      return redirect('whatsapp_error=falha_token');
    }
    const shortToken = tokenJson.access_token;

    // 2. Trocar por long-lived token
    let accessToken = shortToken;
    try {
      const llRes = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortToken}`
      );
      const llJson = await llRes.json();
      if (llRes.ok && llJson.access_token) accessToken = llJson.access_token;
    } catch (e) { console.warn('[whatsapp-callback] long-lived falhou', e); }

    // 3. Listar WABAs disponíveis (via debug_token → granular scopes → businesses)
    const debugRes = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${accessToken}&access_token=${APP_ID}|${APP_SECRET}`
    );
    const debugJson = await debugRes.json();
    const wabaIds: string[] = debugJson?.data?.granular_scopes?.find(
      (g: any) => g.scope === 'whatsapp_business_management'
    )?.target_ids || [];

    let wabaId = wabaIds[0];

    // Fallback: buscar via /me/businesses se debug_token não trouxer
    if (!wabaId) {
      const bizRes = await fetch(`https://graph.facebook.com/v21.0/me/businesses?access_token=${accessToken}`);
      const bizJson = await bizRes.json();
      const businessId = bizJson?.data?.[0]?.id;
      if (businessId) {
        const wabaRes = await fetch(
          `https://graph.facebook.com/v21.0/${businessId}/owned_whatsapp_business_accounts?access_token=${accessToken}`
        );
        const wabaJson = await wabaRes.json();
        wabaId = wabaJson?.data?.[0]?.id;
      }
    }

    if (!wabaId) return redirect('whatsapp_error=nenhuma_waba_encontrada');

    // 4. Listar números desta WABA
    const phonesRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${accessToken}`
    );
    const phonesJson = await phonesRes.json();
    const firstPhone = phonesJson?.data?.[0];
    if (!firstPhone?.id) return redirect('whatsapp_error=nenhum_numero_encontrado');

    // 5. Registrar número na Cloud API (necessário antes de enviar)
    try {
      await fetch(`https://graph.facebook.com/v21.0/${firstPhone.id}/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', pin: '000000' }),
      });
    } catch (e) { console.warn('[whatsapp-callback] register falhou (pode já estar registrado)', e); }

    // 6. Subscrever app à WABA
    try {
      await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (e) { console.warn('[whatsapp-callback] subscribe falhou', e); }

    // 7. Persistir no Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const verifyToken = Deno.env.get('WHATSAPP_CLOUD_VERIFY_TOKEN') || crypto.randomUUID();

    const { error: upErr } = await supabase
      .from('integration_whatsapp_official')
      .upsert({
        tenant_id: tenantId,
        phone_number_id: firstPhone.id,
        waba_id: wabaId,
        access_token: accessToken,
        app_id: APP_ID,
        display_phone_number: firstPhone.display_phone_number || null,
        verified_name: firstPhone.verified_name || null,
        business_account_status: 'connected',
        webhook_verify_token: verifyToken,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' });

    if (upErr) {
      console.error('[whatsapp-callback] upsert error', upErr);
      return redirect(`whatsapp_error=${encodeURIComponent('erro_salvar')}`);
    }

    return redirect('whatsapp_success=true');
  } catch (error: any) {
    console.error('[whatsapp-official-auth-callback] erro', error);
    return redirect(`whatsapp_error=${encodeURIComponent(error?.message || 'erro_inesperado')}`);
  }
});
