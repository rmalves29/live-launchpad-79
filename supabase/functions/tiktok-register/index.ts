// Cadastro público do @ do TikTok (página /t/:slug/cadastro-tiktok, link da bio).
// Liga o @ ao telefone, passa os pedidos guardados no @ para o telefone dela e manda o resumo
// pelo WhatsApp da empresa conectado no Cartzy. Limite de 20 cadastros por hora por IP.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const money = (v: number) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Método não permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, serviceKey);

  try {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const { data: allowed } = await supabase.rpc('rate_limit_hit', { p_key: `reg_tt:${ip}`, p_max: 20, p_window_seconds: 3600 } as any);
    if (allowed === false) return json({ success: false, error: 'Muitas tentativas. Tente novamente mais tarde.' });

    const body = await req.json().catch(() => ({} as any));
    const slug = String(body?.tenant_slug || '').trim().toLowerCase().slice(0, 100);
    const tiktok = String(body?.tiktok || '').slice(0, 80);
    const phone = String(body?.phone || '').slice(0, 30);
    if (!slug || !tiktok || !phone) return json({ success: false, error: 'Preencha o @ e o telefone' });

    const { data: result, error } = await supabase.rpc('tiktok_register_customer', {
      p_tenant_slug: slug, p_tiktok: tiktok, p_phone: phone,
    });
    if (error) {
      console.error('[tiktok-register] rpc:', error.message);
      return json({ success: false, error: 'Erro ao cadastrar. Tente novamente.' });
    }
    const r = result as any;
    if (!r?.success) return json({ success: false, error: r?.error || 'Erro ao cadastrar' });

    const orderIds: number[] = Array.isArray(r.orders) ? r.orders : [];
    let summarySent = false;

    // Resumo no WhatsApp só quando pedidos guardados no @ passaram agora para o telefone dela.
    if (orderIds.length > 0) {
      const { data: orders } = await supabase.from('orders')
        .select('id, total_amount, cart_id').in('id', orderIds).eq('tenant_id', r.tenant_id);
      const cartIds = (orders || []).map((o: any) => o.cart_id).filter(Boolean);
      const { data: items } = cartIds.length
        ? await supabase.from('cart_items').select('cart_id, product_name, qty, unit_price').in('cart_id', cartIds)
        : { data: [] as any[] };

      const lines = (items || []).map((i: any) => `• ${i.qty}x ${i.product_name} — ${money(Number(i.unit_price) * Number(i.qty))}`);
      const total = (orders || []).reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
      const checkoutUrl = `https://app.cartzy.com.br/t/${slug}/checkout`;
      const message =
        `Oi! 💖 Recebemos seu cadastro e seu pedido da live do TikTok está garantido:\n\n` +
        `${lines.join('\n')}\n\n` +
        `🛒 Total: ${money(total)}\n\n` +
        `Para finalizar e pagar, é só acessar:\n${checkoutUrl}\n\n` +
        `Nas próximas lives, é só comentar o código que o pedido já vem direto para cá. ✨`;

      try {
        const res = await fetch(`${url}/functions/v1/zapi-send-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ tenant_id: r.tenant_id, phone: r.phone, message }),
        });
        summarySent = res.ok;
        if (!res.ok) console.warn('[tiktok-register] WhatsApp status', res.status, await res.text().catch(() => ''));
      } catch (e: any) {
        console.warn('[tiktok-register] WhatsApp erro:', e?.message);
      }
    }

    // Nunca devolve telefone nem dados da cliente para quem preencheu a página.
    return json({ success: true, orders_linked: orderIds.length, summary_sent: summarySent, already: !!r.already });
  } catch (e: any) {
    console.error('[tiktok-register] erro:', e?.message || e);
    return json({ success: false, error: 'Erro inesperado' }, 500);
  }
});
