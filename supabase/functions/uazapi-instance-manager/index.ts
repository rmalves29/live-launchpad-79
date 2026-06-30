import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  connectInstance,
  getInstanceStatus,
  disconnectInstance,
  createInstance,
  setWebhook,
  type UazapiConfig,
} from "../_shared/uazapi-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    const { action, tenant_id } = body;
    if (!tenant_id) return json({ error: "tenant_id obrigatório" }, 400);

    if (user) {
      const { data: profile } = await supabase.from("profiles").select("tenant_id, role").eq("id", user.id).maybeSingle();
      if (profile && profile.tenant_id !== tenant_id && profile.role !== "super_admin") {
        return json({ error: "Não autorizado" }, 403);
      }
    }

    const { data: integration } = await supabase
      .from("integration_whatsapp")
      .select("id, uazapi_url, uazapi_token, uazapi_admin_token, provider")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    const cfg: UazapiConfig | null = integration?.uazapi_url && integration?.uazapi_token
      ? { url: integration.uazapi_url, token: integration.uazapi_token }
      : null;

    switch (action) {
      case "save_credentials": {
        const { uazapi_url, uazapi_token, uazapi_admin_token } = body;
        if (!uazapi_url || !uazapi_token) return json({ error: "uazapi_url e uazapi_token são obrigatórios" }, 400);
        const payload: Record<string, unknown> = {
          uazapi_url: String(uazapi_url).replace(/\/+$/, ""),
          uazapi_token,
          uazapi_admin_token: uazapi_admin_token || null,
          provider: "uazapi",
          is_active: true,
          updated_at: new Date().toISOString(),
        };
        if (integration?.id) {
          await supabase.from("integration_whatsapp").update(payload).eq("id", integration.id);
        } else {
          await supabase.from("integration_whatsapp").insert({
            tenant_id,
            ...payload,
            instance_name: "uazapi",
            webhook_secret: crypto.randomUUID(),
          });
        }
        // Configurar webhook automaticamente
        const newCfg: UazapiConfig = { url: String(payload.uazapi_url), token: String(payload.uazapi_token) };
        const webhookUrl = `${supabaseUrl}/functions/v1/uazapi-webhook`;
        const hk = await setWebhook(newCfg, webhookUrl);
        return json({ success: true, webhook: hk });
      }

      case "init_instance": {
        // Cria uma nova instância usando admintoken
        const { name } = body;
        if (!integration?.uazapi_url || !integration?.uazapi_admin_token) {
          return json({ error: "URL da uazapi e admin token são obrigatórios para criar instância" }, 400);
        }
        const instName = (name || `tenant-${tenant_id.slice(0, 8)}`).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
        const result = await createInstance({ url: integration.uazapi_url, adminToken: integration.uazapi_admin_token }, instName);
        if (!result.success) return json({ error: result.error || "Falha ao criar instância", raw: result.raw }, 500);
        await supabase.from("integration_whatsapp").update({
          uazapi_token: result.token,
          provider: "uazapi",
          is_active: true,
          updated_at: new Date().toISOString(),
        }).eq("id", integration.id);

        const newCfg: UazapiConfig = { url: integration.uazapi_url, token: result.token! };
        const webhookUrl = `${supabaseUrl}/functions/v1/uazapi-webhook`;
        await setWebhook(newCfg, webhookUrl);
        return json({ success: true, instance_name: instName, token: result.token });
      }

      case "status": {
        if (!cfg) return json({ connected: false, status: "not_configured" });
        const result = await getInstanceStatus(cfg);
        // Atualizar telefone conectado
        if (result.connected && result.user?.phone && integration?.id) {
          await supabase.from("integration_whatsapp").update({
            connected_phone: result.user.phone,
            last_status_check: new Date().toISOString(),
          }).eq("id", integration.id);
        }
        return json(result);
      }

      case "qrcode":
      case "connect": {
        if (!cfg) return json({ error: "Credenciais uazapi não configuradas" }, 400);
        const result = await connectInstance(cfg, body.phone);
        if (result.error) return json({ error: result.error }, 500);
        return json({ success: true, qrCode: result.qrcode, pairCode: result.paircode, status: result.status });
      }

      case "disconnect": {
        if (!cfg) return json({ error: "Credenciais uazapi não configuradas" }, 400);
        const result = await disconnectInstance(cfg);
        return json(result);
      }

      case "reconfigure_webhook": {
        if (!cfg) return json({ error: "Credenciais uazapi não configuradas" }, 400);
        const webhookUrl = `${supabaseUrl}/functions/v1/uazapi-webhook`;
        const result = await setWebhook(cfg, webhookUrl);
        return json({ ...result, webhook_url: webhookUrl });
      }

      default:
        return json({ error: `Action inválida: ${action}` }, 400);
    }
  } catch (e: any) {
    console.error("[uazapi-instance-manager] Error:", e.message);
    return json({ error: e.message }, 500);
  }
});
