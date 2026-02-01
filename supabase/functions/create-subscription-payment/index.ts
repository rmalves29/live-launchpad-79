import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateSubscriptionPaymentRequest {
  tenant_id: string;
  plan_id: string;
  plan_name: string;
  plan_days: number;
  plan_price: number;
  user_email?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: CreateSubscriptionPaymentRequest = await req.json();
    console.log("[create-subscription-payment] Request:", JSON.stringify(body));

    const { tenant_id, plan_id, plan_name, plan_days, plan_price, user_email } = body;

    if (!tenant_id || !plan_id || !plan_name || !plan_days || plan_price === undefined) {
      return new Response(
        JSON.stringify({ error: "Dados do plano incompletos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Configuração do servidor ausente" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // Buscar dados do tenant
    const { data: tenant, error: tenantError } = await sb
      .from("tenants")
      .select("id, name, admin_email")
      .eq("id", tenant_id)
      .single();

    if (tenantError || !tenant) {
      console.error("[create-subscription-payment] Tenant not found:", tenantError);
      return new Response(
        JSON.stringify({ error: "Empresa não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Usar integração de pagamento da OrderZap (fallback global)
    // Aqui usamos o MP_ACCESS_TOKEN global configurado para a OrderZap
    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");

    if (!mpAccessToken) {
      return new Response(
        JSON.stringify({ error: "Integração de pagamento não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Criar external_reference no formato: subscription:TENANT_ID;plan:PLAN_ID;days:DAYS
    const externalReference = `subscription:${tenant_id};plan:${plan_id};days:${plan_days}`;

    // Webhook URL para notificações de pagamento
    const webhookUrl = `${supabaseUrl}/functions/v1/subscription-webhook`;

    // URLs de retorno
    const publicAppUrl = Deno.env.get("PUBLIC_APP_URL") || "https://app.orderzaps.com";

    const preferenceBody = {
      items: [
        {
          title: `Assinatura ${plan_name} - ${tenant.name}`,
          description: `Plano ${plan_name} (${plan_days} dias) para ${tenant.name}`,
          quantity: 1,
          unit_price: Number(plan_price),
          currency_id: "BRL",
        },
      ],
      external_reference: externalReference,
      payer: {
        email: user_email || tenant.admin_email || "cliente@orderzap.com",
      },
      notification_url: webhookUrl,
      back_urls: {
        success: `${publicAppUrl}/mp/return?status=success&type=subscription`,
        failure: `${publicAppUrl}/mp/return?status=failure&type=subscription`,
        pending: `${publicAppUrl}/mp/return?status=pending&type=subscription`,
      },
      auto_return: "approved",
      statement_descriptor: "ORDERZAP",
    };

    console.log("[create-subscription-payment] Creating MP preference:", JSON.stringify(preferenceBody));

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferenceBody),
    });

    const mpJson = await mpRes.json();

    if (!mpRes.ok) {
      console.error("[create-subscription-payment] MP error:", mpJson);
      return new Response(
        JSON.stringify({ error: "Erro ao criar pagamento", details: mpJson }),
        { status: mpRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[create-subscription-payment] MP preference created:", mpJson.id);

    // Log do pagamento pendente
    await sb.from("webhook_logs").insert({
      webhook_type: "subscription_payment_created",
      status_code: 200,
      tenant_id: tenant_id,
      payload: {
        plan_id,
        plan_name,
        plan_days,
        plan_price,
        preference_id: mpJson.id,
        external_reference: externalReference,
      },
      response: "Payment link created",
    });

    return new Response(
      JSON.stringify({
        init_point: mpJson.init_point,
        sandbox_init_point: mpJson.sandbox_init_point,
        preference_id: mpJson.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[create-subscription-payment] Error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
