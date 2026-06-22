import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAGARME_API = "https://api.pagar.me/core/v5";

interface Body {
  tenant_id: string;
  plan_id: "pro" | "enterprise";
  plan_price: number; // BRL
  card_token?: string;
  card?: {
    number: string;
    holder_name: string;
    exp_month: number;
    exp_year: number;
    cvv: string;
  };
  holder_name: string;
  holder_document: string; // CPF, only digits
  holder_email: string;
  holder_phone?: string; // digits only e.g. 11999999999
  billing_address: {
    line_1: string;
    line_2?: string;
    zip_code: string;
    city: string;
    state: string;
    country?: string;
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pagarmeAuthHeader(secret: string) {
  return "Basic " + btoa(`${secret}:`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Não autenticado" }, 200);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return json({ success: false, error: "Usuário inválido" }, 200);

    const body = (await req.json()) as Body;
    if (!body.tenant_id || !body.plan_id || !body.holder_document || (!body.card_token && !body.card)) {
      return json({ success: false, error: "Dados incompletos" }, 200);
    }

    // valida que o usuário pertence ao tenant
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .maybeSingle();

    const isSuper = profile?.role === "super_admin";
    if (!isSuper && profile?.tenant_id !== body.tenant_id) {
      return json({ success: false, error: "Sem permissão para este tenant" }, 200);
    }

    const interval_months = body.plan_id === "enterprise" ? 12 : 6;
    const priceCents = Math.round(Number(body.plan_price) * 100);
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      return json({ success: false, error: "Preço inválido" }, 200);
    }

    const apiKey = Deno.env.get("PAGARME_ORDERZAP_API_KEY");
    if (!apiKey) return json({ success: false, error: "PAGARME_ORDERZAP_API_KEY não configurada" }, 200);

    const auth = pagarmeAuthHeader(apiKey);

    // Idempotência: se já existe assinatura ativa, retorna
    const { data: existing } = await supabase
      .from("subscription_recurrences")
      .select("*")
      .eq("tenant_id", body.tenant_id)
      .eq("plan_id", body.plan_id)
      .in("status", ["active", "pending"])
      .maybeSingle();

    if (existing && existing.pagarme_subscription_id) {
      return json({ success: false, error: "Já existe assinatura ativa para este plano" }, 200);
    }

    const document = body.holder_document.replace(/\D/g, "");
    const phoneDigits = (body.holder_phone || "").replace(/\D/g, "");
    const code = `orderzap-sub-${body.tenant_id}-${body.plan_id}`;

    // Tokeniza cartão server-side se necessário usando a public key
    let cardToken = body.card_token;
    if (!cardToken && body.card) {
      const publicKey = Deno.env.get("PAGARME_ORDERZAP_PUBLIC_KEY");
      if (!publicKey) return json({ success: false, error: "PAGARME_ORDERZAP_PUBLIC_KEY não configurada" }, 200);
      const tokResp = await fetch(`${PAGARME_API}/tokens?appId=${encodeURIComponent(publicKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "card",
          card: {
            number: body.card.number.replace(/\D/g, ""),
            holder_name: body.card.holder_name,
            exp_month: Number(body.card.exp_month),
            exp_year: Number(body.card.exp_year) < 100 ? 2000 + Number(body.card.exp_year) : Number(body.card.exp_year),
            cvv: String(body.card.cvv).replace(/\D/g, ""),
          },
        }),
      });
      const tokOut = await tokResp.json().catch(() => ({}));
      if (!tokResp.ok || !tokOut?.id) {
        console.error("[pagarme-create-subscription] tokenização falhou:", tokOut);
        return json({ success: false, error: tokOut?.message || tokOut?.errors?.[0]?.message || "Cartão inválido" }, 200);
      }
      cardToken = tokOut.id;
    }



    const subscriptionPayload: Record<string, unknown> = {
      code,
      payment_method: "credit_card",
      interval: "month",
      interval_count: interval_months,
      billing_type: "prepaid",
      currency: "BRL",
      installments: 1,
      pricing_scheme: { scheme_type: "unit", price: priceCents },
      items: [
        {
          description: `OrderZap ${body.plan_id === "enterprise" ? "Enterprise (anual)" : "Pro (semestral)"}`,
          quantity: 1,
          pricing_scheme: { scheme_type: "unit", price: priceCents },
        },
      ],
      customer: {
        name: body.holder_name,
        email: body.holder_email,
        type: "individual",
        document,
        document_type: "CPF",
        ...(phoneDigits.length >= 10
          ? {
              phones: {
                mobile_phone: {
                  country_code: "55",
                  area_code: phoneDigits.slice(0, 2),
                  number: phoneDigits.slice(2),
                },
              },
            }
          : {}),
      },
      card: {
        token: body.card_token,
        billing_address: {
          line_1: body.billing_address.line_1,
          line_2: body.billing_address.line_2 || "",
          zip_code: body.billing_address.zip_code.replace(/\D/g, ""),
          city: body.billing_address.city,
          state: body.billing_address.state,
          country: body.billing_address.country || "BR",
        },
      },
      metadata: {
        tenant_id: body.tenant_id,
        plan_id: body.plan_id,
        interval_months: String(interval_months),
      },
    };

    console.log("[pagarme-create-subscription] criando assinatura", { code, tenant_id: body.tenant_id });

    const resp = await fetch(`${PAGARME_API}/subscriptions`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(subscriptionPayload),
    });

    const result = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      console.error("[pagarme-create-subscription] erro Pagar.me:", resp.status, result);
      return json(
        {
          success: false,
          error: result?.message || result?.errors?.[0]?.message || "Erro ao criar assinatura na Pagar.me",
          details: result,
        },
        200,
      );
    }

    const subscriptionId = result.id;
    const customerId = result?.customer?.id;
    const cardObj = result?.card || result?.cards?.[0];
    const cardId = cardObj?.id;
    const cardBrand = cardObj?.brand;
    const cardLast4 = cardObj?.last_four_digits;
    const nextBilling = result?.next_billing_at || result?.current_cycle?.end_at || null;
    const status = result?.status || "active";

    // Grava localmente
    const { error: insertErr } = await supabase.from("subscription_recurrences").insert({
      tenant_id: body.tenant_id,
      plan_id: body.plan_id,
      interval_months,
      price: body.plan_price,
      pagarme_subscription_id: subscriptionId,
      pagarme_customer_id: customerId,
      pagarme_card_id: cardId,
      pagarme_code: code,
      status,
      current_period_end: nextBilling,
      card_brand: cardBrand,
      card_last4: cardLast4,
      metadata: { created_via: "pagarme-create-subscription" },
    });

    if (insertErr) console.error("[pagarme-create-subscription] erro insert:", insertErr);

    // Se a Pagar.me já retornou cobrança aprovada, estende tenant agora
    const firstCharge = result?.current_cycle?.charge || result?.charges?.[0];
    const chargeStatus = firstCharge?.status;
    if (chargeStatus === "paid" || status === "active") {
      try {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("subscription_ends_at")
          .eq("id", body.tenant_id)
          .maybeSingle();

        const now = new Date();
        const base = tenant?.subscription_ends_at && new Date(tenant.subscription_ends_at) > now
          ? new Date(tenant.subscription_ends_at)
          : now;
        const extended = new Date(base);
        extended.setMonth(extended.getMonth() + interval_months);

        await supabase
          .from("tenants")
          .update({ subscription_ends_at: extended.toISOString(), plan_type: body.plan_id })
          .eq("id", body.tenant_id);

        await supabase
          .from("subscription_recurrences")
          .update({
            last_charge_at: now.toISOString(),
            last_charge_status: chargeStatus || "pending",
            last_charge_id: firstCharge?.id || null,
          })
          .eq("pagarme_subscription_id", subscriptionId);
      } catch (e) {
        console.error("[pagarme-create-subscription] erro estendendo tenant:", e);
      }
    }

    return json({
      success: true,
      subscription_id: subscriptionId,
      status,
      next_billing_at: nextBilling,
    });
  } catch (err) {
    console.error("[pagarme-create-subscription] erro:", err);
    return json({ success: false, error: String(err?.message || err) }, 200);
  }
});
