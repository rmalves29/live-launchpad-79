// Renova os tokens de longa duração do Instagram (validade ~60 dias) antes de vencerem.
// Executado diariamente via pg_cron. Pode ser chamado manualmente: { "tenant_id": "...", "force": true }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REFRESH_WINDOW_DAYS = 20; // renova quando faltarem menos de 20 dias (ou validade desconhecida)

function redact(text: string) {
  return text.replace(/access_token=[^&\s"]+/g, 'access_token=[REDACTED]');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const timestamp = new Date().toISOString();
  const body = await req.json().catch(() => ({} as any));
  const onlyTenantId: string | undefined = body?.tenant_id;
  const force: boolean = body?.force === true;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let query = supabase
    .from('integration_instagram')
    .select('id, tenant_id, instagram_username, access_token, token_expires_at')
    .eq('is_active', true)
    .not('access_token', 'is', null);
  if (onlyTenantId) query = query.eq('tenant_id', onlyTenantId);

  const { data: rows, error } = await query;
  if (error) {
    console.error(`[${timestamp}] [instagram-refresh-tokens] query error:`, error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: Array<{ tenant_id: string; username: string | null; status: string; detail?: string }> = [];
  const limitMs = REFRESH_WINDOW_DAYS * 24 * 3600 * 1000;

  for (const row of rows || []) {
    const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : null;
    if (!force && expiresAt && expiresAt - Date.now() > limitMs) {
      results.push({ tenant_id: row.tenant_id, username: row.instagram_username, status: 'skipped' });
      continue;
    }

    try {
      const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(row.access_token!)}`;
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));

      if (res.ok && json?.access_token) {
        const seconds = Number(json.expires_in) || 60 * 24 * 3600;
        await supabase
          .from('integration_instagram')
          .update({
            access_token: json.access_token,
            token_expires_at: new Date(Date.now() + seconds * 1000).toISOString(),
            token_refreshed_at: new Date().toISOString(),
            token_last_error: null,
          })
          .eq('id', row.id);
        results.push({ tenant_id: row.tenant_id, username: row.instagram_username, status: 'refreshed' });
        console.log(`[${timestamp}] [instagram-refresh-tokens] refreshed @${row.instagram_username} (${row.tenant_id})`);
      } else {
        const message = String(json?.error?.message || `HTTP ${res.status}`).slice(0, 300);
        await supabase.from('integration_instagram').update({ token_last_error: message }).eq('id', row.id);
        results.push({ tenant_id: row.tenant_id, username: row.instagram_username, status: 'failed', detail: message });
        console.error(`[${timestamp}] [instagram-refresh-tokens] failed @${row.instagram_username}:`, redact(JSON.stringify(json)));
      }
    } catch (e: any) {
      results.push({ tenant_id: row.tenant_id, username: row.instagram_username, status: 'failed', detail: String(e?.message || e) });
    }
  }

  const summary = {
    refreshed: results.filter((r) => r.status === 'refreshed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
  };
  console.log(`[${timestamp}] [instagram-refresh-tokens] summary:`, JSON.stringify(summary));

  return new Response(JSON.stringify({ success: true, summary, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
