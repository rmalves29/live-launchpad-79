// Insere uma cliente na fila de espera de um produto esgotado.
// Pode ser chamado pelo storefront (anon), webhook do WhatsApp, ou admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(p: string): string {
  let clean = (p || '').replace(/\D/g, '');
  if (clean.startsWith('55') && clean.length > 11) clean = clean.slice(2);
  return clean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const tenant_slug: string | undefined = body.tenant_slug;
    const tenant_id_input: string | undefined = body.tenant_id;
    const product_id = Number(body.product_id);
    const qty = Math.max(1, Math.floor(Number(body.qty) || 1));
    const phone = normalizePhone(body.customer_phone || '');
    const customer_name = body.customer_name ?? null;
    const customer_instagram = body.customer_instagram ?? null;
    const source = ['storefront', 'whatsapp', 'manual'].includes(body.source) ? body.source : 'storefront';

    if (!product_id || !phone || (!tenant_slug && !tenant_id_input)) {
      return jsonResp({ error: 'Campos obrigatórios ausentes' }, 400);
    }
    if (phone.length < 10 || phone.length > 13) {
      return jsonResp({ error: 'Telefone inválido' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resolve tenant
    let tenant_id = tenant_id_input;
    let waitlist_enabled = true;
    if (!tenant_id) {
      const { data: t } = await supabase
        .from('tenants').select('id, is_active, waitlist_enabled')
        .eq('slug', tenant_slug!).maybeSingle();
      if (!t || !t.is_active) return jsonResp({ error: 'Loja não encontrada' }, 404);
      tenant_id = t.id;
      waitlist_enabled = t.waitlist_enabled !== false;
    } else {
      const { data: t } = await supabase
        .from('tenants').select('waitlist_enabled').eq('id', tenant_id).maybeSingle();
      waitlist_enabled = t?.waitlist_enabled !== false;
    }
    if (!waitlist_enabled) {
      return jsonResp({ error: 'Fila de espera desativada para esta loja', code: 'WAITLIST_DISABLED' }, 403);
    }

    // Verifica produto
    const { data: product } = await supabase
      .from('products').select('id, name, code')
      .eq('id', product_id).eq('tenant_id', tenant_id).maybeSingle();
    if (!product) return jsonResp({ error: 'Produto não encontrado' }, 404);

    // Tenta resolver customer_id
    let customer_id: number | null = null;
    const { data: existingCustomer } = await supabase
      .from('customers').select('id, name')
      .eq('tenant_id', tenant_id).eq('phone', phone).maybeSingle();
    if (existingCustomer) customer_id = existingCustomer.id;

    // Já está na fila ativa?
    const { data: existingWl } = await supabase
      .from('product_waitlist')
      .select('id, status, created_at')
      .eq('tenant_id', tenant_id)
      .eq('product_id', product_id)
      .eq('customer_phone', phone)
      .in('status', ['waiting', 'notified'])
      .maybeSingle();

    if (existingWl) {
      const position = await computePosition(supabase, tenant_id, product_id, existingWl.created_at);
      return jsonResp({ success: true, waitlist_id: existingWl.id, status: existingWl.status, position, already_in_queue: true });
    }

    // Insere
    const { data: inserted, error: insErr } = await supabase
      .from('product_waitlist')
      .insert({
        tenant_id, product_id, customer_id, customer_phone: phone,
        customer_name: customer_name || existingCustomer?.name || null,
        customer_instagram, qty, source, status: 'waiting',
      })
      .select('id, created_at').single();
    if (insErr) {
      console.error('[waitlist-enqueue] insert:', insErr);
      return jsonResp({ error: 'Não foi possível entrar na fila' }, 500);
    }

    const position = await computePosition(supabase, tenant_id, product_id, inserted.created_at);
    return jsonResp({ success: true, waitlist_id: inserted.id, status: 'waiting', position, already_in_queue: false });
  } catch (e) {
    console.error('[waitlist-enqueue] FATAL', e);
    return jsonResp({ error: 'Erro interno' }, 500);
  }
});

async function computePosition(supabase: any, tenant_id: string, product_id: number, created_at: string): Promise<number> {
  const { count } = await supabase
    .from('product_waitlist')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant_id)
    .eq('product_id', product_id)
    .eq('status', 'waiting')
    .lte('created_at', created_at);
  return count || 1;
}
