// Reenvia uma DM do Instagram que falhou (instagram_dm_log.status = 'failed').
// Usa a private reply do comentário original (janela de 7 dias da Meta).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Token inválido ou expirado' }, 401);

    const body = await req.json().catch(() => ({} as any));
    const logId: string | undefined = body?.dm_log_id;
    if (!logId) return json({ error: 'dm_log_id é obrigatório' }, 400);

    const supabase = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: log } = await supabase.from('instagram_dm_log').select('*').eq('id', logId).maybeSingle();
    if (!log) return json({ error: 'Registro de DM não encontrado' }, 404);

    const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).maybeSingle();
    if (!profile || (profile.role !== 'super_admin' && profile.tenant_id !== log.tenant_id)) {
      return json({ error: 'Sem permissão para esta empresa' }, 403);
    }
    if (log.status === 'sent') return json({ error: 'Esta DM já foi enviada' }, 400);
    if (!log.comment_id || String(log.comment_id).startsWith('sim_')) {
      return json({ error: 'Esta DM não tem um comentário real para responder' }, 400);
    }

    const { data: integration } = await supabase
      .from('integration_instagram')
      .select('access_token, page_access_token')
      .eq('tenant_id', log.tenant_id)
      .eq('is_active', true)
      .maybeSingle();
    const token = integration?.page_access_token || integration?.access_token;
    if (!token) return json({ error: 'Instagram desconectado ou sem token. Reconecte e tente de novo.' }, 400);

    const base = integration?.page_access_token ? 'https://graph.facebook.com/v19.0' : 'https://graph.instagram.com/v21.0';
    const res = await fetch(`${base}/me/messages?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { comment_id: log.comment_id }, message: { text: log.message } }),
    });

    if (res.ok) {
      await supabase
        .from('instagram_dm_log')
        .update({ status: 'sent', error: null, channel: 'private_reply', resent_at: new Date().toISOString() })
        .eq('id', logId);
      return json({ success: true });
    }

    const err = await res.json().catch(() => ({}));
    const message = String(err?.error?.message || `HTTP ${res.status}`).slice(0, 500);
    await supabase.from('instagram_dm_log').update({ error: `reenvio: ${message}`, resent_at: new Date().toISOString() }).eq('id', logId);
    return json({ success: false, error: message }, 200);
  } catch (e: any) {
    console.error('[instagram-resend-dm] erro:', e?.message || e);
    return json({ error: 'Erro inesperado' }, 500);
  }
});
