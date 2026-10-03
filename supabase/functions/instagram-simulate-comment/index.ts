// Modo ensaio: simula um comentário de live no fluxo real (cria carrinho/pedido e baixa estoque),
// sem enviar DM nem resposta pública. Útil para testar e gravar demonstrações.
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
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Token inválido ou expirado' }, 401);

    const body = await req.json().catch(() => ({} as any));
    const tenantId: string | undefined = body?.tenant_id;
    const code = String(body?.code || '').trim();
    const qty = Math.min(Math.max(Number(body?.qty) || 1, 1), 99);
    const username = String(body?.username || 'teste_ensaio').replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30) || 'teste_ensaio';
    if (!tenantId || !code) return json({ error: 'tenant_id e code são obrigatórios' }, 400);

    const supabase = createClient(url, serviceKey);
    const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).maybeSingle();
    if (!profile || (profile.role !== 'super_admin' && profile.tenant_id !== tenantId)) {
      return json({ error: 'Sem permissão para esta empresa' }, 403);
    }

    const { data: integration } = await supabase
      .from('integration_instagram')
      .select('page_id, instagram_account_id, is_active')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();
    if (!integration) return json({ error: 'Instagram não está conectado' }, 400);

    const { data: live } = await supabase
      .from('instagram_lives')
      .select('media_id')
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const commentId = `sim_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const text = qty > 1 ? `${code} ${qty}x` : code;
    const payload = {
      object: 'instagram',
      entry: [{
        id: integration.page_id || integration.instagram_account_id,
        time: Math.floor(Date.now() / 1000),
        changes: [{
          field: 'live_comments',
          value: {
            from: { id: `sim_user_${username}`, username },
            media: { id: live?.media_id || 'sim_media', media_product_type: 'LIVE' },
            id: commentId,
            text,
            timestamp: new Date().toISOString(),
          },
        }],
      }],
    };

    const res = await fetch(`${url}/functions/v1/instagram-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceKey },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return json({ error: `Webhook retornou ${res.status}` }, 502);

    const { data: row } = await supabase
      .from('instagram_live_comments')
      .select('comment_status, product_found, order_id')
      .eq('tenant_id', tenantId)
      .eq('comment_id', commentId)
      .maybeSingle();

    return json({ success: true, comment_id: commentId, username, status: row?.comment_status ?? null, order_id: row?.order_id ?? null });
  } catch (e: any) {
    console.error('[instagram-simulate-comment] erro:', e?.message || e);
    return json({ error: 'Erro inesperado' }, 500);
  }
});
