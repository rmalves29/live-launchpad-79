import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPostedStatus } from "../_shared/postage-confirmation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WS_BASE = "https://mandabem.com.br/ws";

function form(params: Record<string, string | number>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  return body.toString();
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

async function saveIntegrationLog(
  supabase: any,
  tenant_id: string,
  order_id: number,
  action: string,
  status_code: number,
  request_payload: any,
  response_body: string,
  error_message?: string,
) {
  try {
    const safePayload = { ...request_payload };
    delete safePayload.plataforma_chave;
    await supabase.from("webhook_logs").insert({
      tenant_id,
      webhook_type: `mandabem_${action}`,
      status_code,
      payload: { order_id, action, request: safePayload },
      response: response_body?.substring(0, 10000),
      error_message,
    });
  } catch (e) {
    console.error("[mandabem-labels] Erro ao salvar log:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, order_id, tenant_id } = await req.json();
    console.log("[mandabem-labels] Request:", { action, order_id, tenant_id });

    if (!tenant_id || !order_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id e order_id são obrigatórios" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integration } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "mandabem")
      .eq("is_active", true)
      .maybeSingle();

    if (!integration) {
      return new Response(
        JSON.stringify({ success: false, error: "Integração Manda Bem não encontrada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const auth = {
      plataforma_id: integration.client_id || "",
      plataforma_chave: integration.access_token || "",
    };

    if (!auth.plataforma_id || !auth.plataforma_chave) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais Manda Bem não configuradas" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!order) {
      return new Response(
        JSON.stringify({ success: false, error: "Pedido não encontrado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    switch (action) {
      case "create_order":
        return await createShipment(supabase, integration, auth, order, tenant_id);
      case "get_tracking":
        return await getTracking(supabase, auth, order);
      case "cancel_order":
        return await cancelShipment(supabase, order);
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Ação desconhecida: ${action}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
  } catch (error) {
    console.error("[mandabem-labels] Erro:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function createShipment(
  supabase: any,
  integration: any,
  auth: Record<string, string>,
  order: any,
  tenantId: string,
) {
  const { data: tenant } = await supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle();

  const { data: items } = await supabase
    .from("cart_items")
    .select("*")
    .eq("cart_id", order.cart_id);

  const { data: customer } = await supabase
    .from("customers")
    .select("neighborhood, email, name, cpf")
    .eq("phone", onlyDigits(order.customer_phone))
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // Forma de envio: prioriza o serviço escolhido no checkout (gravado na observação)
  const obs = String(order.observation || "").toUpperCase();
  let formaEnvio = "PAC";
  if (obs.includes("SEDEX")) formaEnvio = "SEDEX";
  else if (obs.includes("MINI")) formaEnvio = "PACMINI";

  const list = items || [];
  const totalWeight = Math.max(
    list.reduce((sum: number, i: any) => sum + 0.3 * (Number(i.qty) || 1), 0),
    0.1,
  );
  let declaredValue = Math.round(Number(order.total_amount) || 0) / 100;
  if (declaredValue < 1) declaredValue = 1;

  const payload: Record<string, string | number> = {
    ...auth,
    forma_envio: formaEnvio,
    destinatario: String(order.customer_name || customer?.name || "Cliente").substring(0, 40),
    cep: onlyDigits(order.customer_cep),
    logradouro: order.customer_street || "",
    numero: order.customer_number || "S/N",
    complemento: order.customer_complement || "",
    bairro: order.customer_neighborhood || customer?.neighborhood || "",
    cidade: order.customer_city || "",
    estado: String(order.customer_state || "").substring(0, 2).toUpperCase(),
    peso: totalWeight.toFixed(3),
    altura: 2,
    largura: 16,
    comprimento: 20,
    valor_seguro: declaredValue.toFixed(2),
    ref_id: String(order.id),
    integration: "OrderZaps",
    email: customer?.email || tenant?.email || "no-reply@orderzap.app",
    cep_origem: onlyDigits(integration.from_cep),
  };

  if (customer?.cpf) payload.cpf_destinatario = onlyDigits(customer.cpf);

  list.forEach((item: any, idx: number) => {
    payload[`produtos[${idx}][nome]`] = String(item.product_name || item.product_code || "Produto").substring(0, 60);
    payload[`produtos[${idx}][quantidade]`] = Number(item.qty) || 1;
    payload[`produtos[${idx}][preco]`] = (Math.round(Number(item.unit_price) || 0) / 100).toFixed(2);
  });

  const response = await fetch(`${WS_BASE}/gerar_envio`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form(payload),
  });

  const text = await response.text();
  console.log("[mandabem-labels] gerar_envio:", response.status, text.substring(0, 500));

  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch { /* resposta não-JSON */ }

  const resultado = json?.resultado || json;
  const ok = response.ok && String(resultado?.sucesso) === "true" && resultado?.envio_id;

  await saveIntegrationLog(
    supabase,
    order.tenant_id,
    order.id,
    "create_order",
    response.status,
    payload,
    text,
    ok ? undefined : text.substring(0, 500),
  );

  if (!ok) {
    return new Response(
      JSON.stringify({
        success: false,
        error: resultado?.mensagem || resultado?.erro || "Erro ao gerar envio no Manda Bem",
        details: text.substring(0, 500),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const envioId = String(resultado.envio_id);
  const trackingCode = resultado.etiqueta || resultado.rastreio || null;

  await supabase
    .from("orders")
    .update({
      melhor_envio_shipment_id: `mandabem_${envioId}`,
      melhor_envio_tracking_code: trackingCode,
      // Gerar etiqueta não é postagem: só a transportadora confirma o envio real
      tracking_posted: false,
      observation: `${order.observation || ""}\n[Manda Bem: ${envioId}]`.trim(),
    })
    .eq("id", order.id);

  return new Response(
    JSON.stringify({
      success: true,
      mandabem_envio_id: envioId,
      tracking_code: trackingCode,
      message: "Envio gerado no Manda Bem com sucesso",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function getTracking(supabase: any, auth: Record<string, string>, order: any) {
  const shipmentId = String(order.melhor_envio_shipment_id || "");
  const envioId = shipmentId.startsWith("mandabem_") ? shipmentId.replace("mandabem_", "") : "";

  const payload: Record<string, string | number> = { ...auth };
  if (envioId) payload.id = envioId;
  else payload.ref_id = String(order.id);

  const response = await fetch(`${WS_BASE}/envio`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form(payload),
  });

  const text = await response.text();
  console.log("[mandabem-labels] envio:", response.status, text.substring(0, 500));

  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch { /* resposta não-JSON */ }

  const resultado = json?.resultado || json;

  if (!response.ok || String(resultado?.sucesso) === "false") {
    return new Response(
      JSON.stringify({
        success: false,
        error: resultado?.mensagem || resultado?.erro || "Erro ao consultar envio no Manda Bem",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const status = String(resultado?.status || "");
  const trackingCode = resultado?.etiqueta || order.melhor_envio_tracking_code || null;

  // Regra única do sistema: só confirma postagem quando a transportadora
  // registra postagem/coleta/trânsito/entrega — gerar etiqueta não conta.
  const posted = isPostedStatus(status);

  const updates: Record<string, unknown> = { tracking_updated_at: new Date().toISOString() };
  if (trackingCode && trackingCode !== order.melhor_envio_tracking_code) {
    updates.melhor_envio_tracking_code = trackingCode;
  }
  if (posted && !order.tracking_posted) {
    updates.tracking_posted = true;
  }

  await supabase.from("orders").update(updates).eq("id", order.id);

  return new Response(
    JSON.stringify({ success: true, status, tracking_code: trackingCode, posted }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function cancelShipment(supabase: any, order: any) {
  // O webservice do Manda Bem não expõe cancelamento: limpamos o vínculo local
  await supabase
    .from("orders")
    .update({
      melhor_envio_shipment_id: null,
      melhor_envio_tracking_code: null,
      tracking_posted: false,
    })
    .eq("id", order.id);

  return new Response(
    JSON.stringify({
      success: true,
      message: "Vínculo do envio removido. Cancele a etiqueta também no painel do Manda Bem.",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
