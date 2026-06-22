import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAGARME_API = "https://api.pagar.me/core/v5";

interface Body {
  tenant_id: string;
  plan_id: string;
  plan_name: string;
  plan_days: number;
  plan_price: number;
  card: {
    number: string;
    holder_name: string;
    exp_month: number;
    exp_year: number;
    cvv: string;
  };
  holder_name: string;
  holder_document: string;
  holder_email: string;
  holder_phone?: string;
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

function authHeader(secret: string) {
  return "Basic " + btoa(`${secret}:`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authH = req.headers.get("Authorization");
    if (!authH) return json({ success: false, error: "Não autenticado" }, 200);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authH } } },
    );

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) return json({ success: false, error: "Usuário inválido" }, 200);

    const body = (await req.json()) as Body;
    if (!body.tenant_id || !body.plan_id || !body.card || !body.holder_document) {
      return json({ success: false, error: "Dados incompletos" }, 200);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .maybeSingle();
    const isSuper = profile?.role === "super_admin";
    if (!isSuper && profile?.tenant_id !== body.tenant_id) {
      return json({ success: false, error: "Sem permissão" }, 200);
    }

    const priceCents = Math.round(Number(body.plan_price) * 100);
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      return json({ success: false, error: "Preço inválido" }, 200);
    }

    const apiKey = Deno.env.get("PAGARME_ORDERZAP_API_KEY");
    if (!apiKey) return json({ success: false, error: "PAGARME_ORDERZAP_API_KEY não configurada" }, 200);

    const document = body.holder_document.replace(/\D/g, "");
    const phoneDigits = (body.holder_phone || "").replace(/\D/g, "");

    const payload: Record<string, unknown> = {
      code: `orderzap-${body.tenant_id}-${body.plan_id}-${Date.now()}`,
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
      items: [
        {
          amount: priceCents,
          description: `OrderZap ${body.plan_name} - ${body.plan_days} dias`,
          quantity: 1,
          code: body.plan_id,
        },
      ],
      payments: [
        {
          payment_method: "credit_card",
          credit_card: {
            installments: 1,
            statement_descriptor: "ORDERZAP",
            card: {
              number: body.card.number.replace(/\D/g, ""),
              holder_name: body.card.holder_name,
              exp_month: Number(body.card.exp_month),
              exp_year: Number(body.card.exp_year) < 100 ? 2000 + Number(body.card.exp_year) : Number(body.card.exp_year),
              cvv: String(body.card.cvv).replace(/\D/g, ""),
              billing_address: {
                line_1: body.billing_address.line_1,
                line_2: body.billing_address.line_2 || "",
                zip_code: body.billing_address.zip_code.replace(/\D/g, ""),
                city: body.billing_address.city,
                state: body.billing_address.state,
                country: body.billing_address.country || "BR",
              },
            },
          },
        },
      ],
      metadata: {
        tenant_id: body.tenant_id,
        plan_id: body.plan_id,
        plan_days: String(body.plan_days),
      },
    };

    console.log("[pagarme-create-order] criando pedido", { tenant_id: body.tenant_id, plan_id: body.plan_id });

    const resp = await fetch(`${PAGARME_API}/orders`, {
      method: "POST",
      headers: { Authorization: authHeader(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      console.error("[pagarme-create-order] erro:", resp.status, result);
      return json(
        {
          success: false,
          error: result?.message || result?.errors?.[0]?.message || "Erro Pagar.me",
          details: result,
        },
        200,
      );
    }

    const charge = result?.charges?.[0];
    const chargeStatus = charge?.status;
    const paid = chargeStatus === "paid" || result?.status === "paid";

    if (paid) {
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
      extended.setDate(extended.getDate() + body.plan_days);

      await supabase
        .from("tenants")
        .update({ subscription_ends_at: extended.toISOString(), plan_type: body.plan_id })
        .eq("id", body.tenant_id);
    }

    return json({
      success: true,
      paid,
      status: chargeStatus || result?.status,
      order_id: result?.id,
    });
  } catch (err: any) {
    console.error("[pagarme-create-order] erro:", err);
    return json({ success: false, error: String(err?.message || err) }, 200);
  }
});
