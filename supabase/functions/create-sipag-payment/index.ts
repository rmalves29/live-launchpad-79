// Cria cobrança PIX no Sipag (Sicoob) para um pedido
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SIPAG_BASE_URL_PROD = 'https://api.sipag.com.br';
const SIPAG_BASE_URL_SANDBOX = 'https://hml-api.sipag.com.br';

interface CreatePaymentRequest {
  order_id: number;
  tenant_id: string;
  method: 'pix' | 'credit_card' | 'boleto';
  customer?: {
    name?: string;
    document?: string;
    email?: string;
  };
}

async function getSipagToken(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(`${baseUrl}/auth/oauth/v2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao autenticar no Sipag (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as CreatePaymentRequest;
    if (!body.order_id || !body.tenant_id || !body.method) {
      return new Response(
        JSON.stringify({ success: false, error: 'order_id, tenant_id e method são obrigatórios' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Buscar integração
    const { data: integration, error: intErr } = await supabase
      .from('integration_sipag')
      .select('*')
      .eq('tenant_id', body.tenant_id)
      .eq('is_active', true)
      .maybeSingle();

    if (intErr || !integration) {
      return new Response(
        JSON.stringify({ success: false, error: 'Integração Sipag não configurada ou inativa para este tenant' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (body.method === 'pix' && !integration.enable_pix) {
      return new Response(JSON.stringify({ success: false, error: 'PIX não habilitado' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (body.method === 'credit_card' && !integration.enable_credit_card) {
      return new Response(JSON.stringify({ success: false, error: 'Cartão de crédito não habilitado' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (body.method === 'boleto' && !integration.enable_boleto) {
      return new Response(JSON.stringify({ success: false, error: 'Boleto não habilitado' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar pedido
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', body.order_id)
      .eq('tenant_id', body.tenant_id)
      .maybeSingle();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ success: false, error: 'Pedido não encontrado' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (order.is_paid) {
      return new Response(JSON.stringify({ success: false, error: 'Pedido já foi pago' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const baseUrl = integration.environment === 'sandbox' ? SIPAG_BASE_URL_SANDBOX : SIPAG_BASE_URL_PROD;
    const token = await getSipagToken(baseUrl, integration.client_id, integration.client_secret);

    // Por enquanto: implementação PIX (mais simples)
    if (body.method === 'pix') {
      const amount = Number(order.total_amount);
      const txid = `ORD${order.id}${Date.now().toString().slice(-8)}`;

      const cobPayload: Record<string, unknown> = {
        calendario: { expiracao: 3600 },
        valor: { original: amount.toFixed(2) },
        chave: integration.pix_key,
        solicitacaoPagador: `Pedido #${order.id}`,
      };

      if (body.customer?.document) {
        const doc = body.customer.document.replace(/\D/g, '');
        if (doc.length === 11) {
          cobPayload.devedor = { cpf: doc, nome: body.customer.name || 'Cliente' };
        } else if (doc.length === 14) {
          cobPayload.devedor = { cnpj: doc, nome: body.customer.name || 'Cliente' };
        }
      }

      const cobRes = await fetch(`${baseUrl}/pix/api/v2/cob/${txid}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cobPayload),
      });

      if (!cobRes.ok) {
        const text = await cobRes.text();
        throw new Error(`Falha ao criar cobrança PIX (${cobRes.status}): ${text}`);
      }

      const cob = await cobRes.json();

      // Buscar QR Code
      let qrCode = '';
      let qrCodeImage = '';
      if (cob.loc?.id) {
        const qrRes = await fetch(`${baseUrl}/pix/api/v2/loc/${cob.loc.id}/qrcode`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (qrRes.ok) {
          const qr = await qrRes.json();
          qrCode = qr.qrcode || '';
          qrCodeImage = qr.imagemQrcode || '';
        }
      }

      // Salvar referência no pedido
      await supabase
        .from('orders')
        .update({
          payment_method: 'pix',
          payment_link: qrCode || `pix:${txid}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      return new Response(
        JSON.stringify({
          success: true,
          method: 'pix',
          txid,
          qr_code: qrCode,
          qr_code_image: qrCodeImage,
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Método ainda não implementado. Apenas PIX disponível por enquanto.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[create-sipag-payment]', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
