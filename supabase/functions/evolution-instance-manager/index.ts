import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createInstance,
  getQRCode,
  getInstanceStatus,
  deleteInstance,
} from "../_shared/evolution-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function setEvolutionWebhook(apiUrl: string, apiKey: string, instance: string, webhookUrl: string) {
  const headers = { "Content-Type": "application/json", "apikey": apiKey };
  const events = ["MESSAGES_UPSERT", "CONNECTION_UPDATE"];

  // Tentativa 1: payload v2 (objeto "webhook")
  const v2Body = {
    webhook: {
      enabled: true,
      url: webhookUrl,
      webhookByEvents: false,
      webhookBase64: false,
      events,
    },
  };
  try {
    const r = await fetch(`${apiUrl}/webhook/set/${instance}`, { method: "POST", headers, body: JSON.stringify(v2Body) });
    const txt = await r.text();
    console.log(`[evolution-webhook-setup] v2 status=${r.status} body=${txt.slice(0,300)}`);
    if (r.ok) return { ok: true, format: "v2", response: txt };
  } catch (e: any) { console.warn(`[evolution-webhook-setup] v2 erro: ${e.message}`); }

  // Tentativa 2: payload plano (compat antiga)
  const flatBody = { url: webhookUrl, enabled: true, webhook_by_events: false, webhook_base64: false, events };
  try {
    const r = await fetch(`${apiUrl}/webhook/set/${instance}`, { method: "POST", headers, body: JSON.stringify(flatBody) });
    const txt = await r.text();
    console.log(`[evolution-webhook-setup] flat status=${r.status} body=${txt.slice(0,300)}`);
    return { ok: r.ok, format: "flat", response: txt };
  } catch (e: any) {
    console.error(`[evolution-webhook-setup] flat erro: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization") || "";
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    const body = await req.json();
    const { action, tenant_id, instance_name } = body;

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id obrigatorio" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify user belongs to this tenant
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();
      if (profile && profile.tenant_id !== tenant_id) {
        return new Response(JSON.stringify({ error: "Nao autorizado" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    switch (action) {
      case "create": {
        if (!instance_name) {
          return new Response(JSON.stringify({ error: "instance_name obrigatorio" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const slugName = instance_name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40);

        const result = await createInstance(slugName);
        if (!result.success) {
          return new Response(JSON.stringify({ error: result.error || "Erro ao criar instancia" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Configure webhook on Evolution API to point to evolution-webhook edge function
        const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL") || "";
        const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY") || "";
        const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
        await setEvolutionWebhook(evolutionApiUrl, evolutionApiKey, slugName, webhookUrl);

        // Save to DB
        const { data: existing } = await supabase.from("integration_whatsapp").select("id").eq("tenant_id", tenant_id).maybeSingle();

        if (existing) {
          await supabase.from("integration_whatsapp").update({
            evolution_instance_name: slugName,
            provider: "evolution",
            is_active: true,
            updated_at: new Date().toISOString(),
          }).eq("tenant_id", tenant_id);
        } else {
          await supabase.from("integration_whatsapp").insert({
            tenant_id,
            evolution_instance_name: slugName,
            provider: "evolution",
            is_active: true,
            instance_name: slugName,
            webhook_secret: crypto.randomUUID(),
          });
        }

        return new Response(JSON.stringify({ success: true, instance_name: slugName, webhook_url: webhookUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "qrcode": {
        const { data: integration } = await supabase.from("integration_whatsapp").select("evolution_instance_name").eq("tenant_id", tenant_id).maybeSingle();
        const instName = instance_name || integration?.evolution_instance_name;
        if (!instName) {
          return new Response(JSON.stringify({ error: "Instancia nao configurada" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const result = await getQRCode(instName);
        if (!result.qrcode) {
          return new Response(JSON.stringify({ error: result.error || "Erro ao buscar QR Code" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ success: true, qrCode: result.qrcode }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "status": {
        const { data: integration } = await supabase.from("integration_whatsapp").select("evolution_instance_name, provider").eq("tenant_id", tenant_id).maybeSingle();
        const instName = integration?.evolution_instance_name;
        if (!instName || integration?.provider !== "evolution") {
          return new Response(JSON.stringify({ connected: false, status: "not_configured" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const result = await getInstanceStatus(instName);
        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "delete": {
        const { data: integration } = await supabase.from("integration_whatsapp").select("id, evolution_instance_name").eq("tenant_id", tenant_id).maybeSingle();
        const instName = integration?.evolution_instance_name;

        if (instName) {
          await deleteInstance(instName);
        }

        if (integration?.id) {
          await supabase.from("integration_whatsapp").update({
            evolution_instance_name: null,
            provider: "zapi",
            updated_at: new Date().toISOString(),
          }).eq("id", integration.id);
        }

        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      default:
        return new Response(JSON.stringify({ error: "Action invalida: " + action }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (error: any) {
    console.error("[evolution-instance-manager] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
