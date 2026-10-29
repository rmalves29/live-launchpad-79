import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { RequestSchema, roleStatus, planPayload, linkPayload, requestPagarme } from './service.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ success: false, error: 'Unauthorized' }, 401);
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ success: false, error: 'Unauthorized' }, 401);
    const { data: profile } = await admin.from('profiles').select('role').eq('id', userData.user.id).single();
    if (roleStatus(profile?.role) !== 200) return json({ success: false, error: 'Forbidden: super_admin role required' }, 403);
    if (req.method !== 'POST') return json({ success: false, error: 'Use POST' }, 405);

    let input;
    try { input = await req.json(); } catch { return json({ success: false, error: 'JSON inválido' }, 400); }
    const parsed = RequestSchema.safeParse(input);
    if (!parsed.success) return json({ success: false, error: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') }, 400);
    if (parsed.data.action === 'list') {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin.from('pagarme_recurring_links').select('*').order('created_at', { ascending: false }).order('id').range(from, from + 999);
        if (error) return json({ success: false, error: error.message });
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return json({ success: true, links: rows });
    }

    const apiKey = Deno.env.get('PAGARME_ORDERZAP_API_KEY');
    if (!apiKey) return json({ success: false, error: 'PAGARME_ORDERZAP_API_KEY não configurada' });
    const { name, price, cycles } = parsed.data;
    const plan = await requestPagarme('/plans', planPayload(name, price, cycles), apiKey);
    if (!plan.ok) return json({ success: false, error: 'Pagar.me recusou a criação do plano', pagarme_error: plan.body, pagarme_status: plan.status });
    if (!plan.body?.id) return json({ success: false, error: 'Pagar.me não retornou o ID do plano', pagarme_error: plan.body });
    const planId = plan.body.id;
    const link = await requestPagarme('/paymentlinks', linkPayload(name, price, planId), apiKey);
    if (!link.ok) return json({ success: false, error: 'Pagar.me recusou a criação do link; o plano já foi criado', plan_id: planId, pagarme_error: link.body, pagarme_status: link.status });
    if (!link.body?.id || typeof link.body?.url !== 'string') return json({ success: false, error: 'Pagar.me não retornou ID/URL do link', plan_id: planId, pagarme_error: link.body });
    const { error: saveError } = await admin.from('pagarme_recurring_links').insert({
      name, price, cycles, pagarme_plan_id: planId, pagarme_link_id: link.body.id,
      url: link.body.url, status: link.body.status ?? 'active', created_by: userData.user.id,
    });
    if (saveError) return json({ success: false, error: `Link criado na Pagar.me, mas não foi salvo: ${saveError.message}`, plan_id: planId, link_id: link.body.id, url: link.body.url });
    return json({ success: true, plan_id: planId, link_id: link.body.id, url: link.body.url });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});