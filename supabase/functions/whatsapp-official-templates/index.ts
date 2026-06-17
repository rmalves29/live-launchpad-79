import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v21.0";

// Converte template interno ({nome}, {valor}) para formato Meta com {{1}}, {{2}}
function buildMetaTemplate(template: any) {
  const content: string = template.content || "";
  const variables: string[] = Array.from(new Set((content.match(/\{[^}]+\}/g) || []).map((s: string) => s)));
  let body = content;
  variables.forEach((v, idx) => {
    body = body.split(v).join(`{{${idx + 1}}}`);
  });
  const components: any[] = [{ type: "BODY", text: body }];
  return { components, variables };
}

function templateNameFromTitle(title: string, type: string, tenantId: string): string {
  const base = (title || type || "tpl")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").substring(0, 40);
  const suffix = tenantId.replace(/-/g, "").substring(0, 8);
  return `${base || "tpl"}_${suffix}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { tenant_id, action } = body;

    if (!tenant_id || !action) {
      return new Response(JSON.stringify({ success: false, error: "tenant_id e action obrigatórios" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: integ } = await supabase
      .from("integration_whatsapp_official")
      .select("waba_id, access_token")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!integ) {
      return new Response(JSON.stringify({ success: false, error: "Integração não configurada" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "submit_all_pending") {
      const { data: templates } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("tenant_id", tenant_id)
        .in("official_status", ["not_submitted", "rejected"]);

      const results: any[] = [];
      for (const tpl of (templates || [])) {
        const { components, variables } = buildMetaTemplate(tpl);
        const name = tpl.official_template_name || templateNameFromTitle(tpl.title || tpl.type, tpl.type, tenant_id);
        const payload = {
          name,
          language: tpl.official_language || "pt_BR",
          category: tpl.official_category || "UTILITY",
          components,
        };
        const url = `https://graph.facebook.com/${GRAPH_VERSION}/${integ.waba_id}/message_templates`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${integ.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => ({}));
        const ok = resp.ok && !data?.error;
        await supabase.from("whatsapp_templates").update({
          official_template_name: name,
          official_status: ok ? (data.status?.toLowerCase() || "pending") : "rejected",
          official_rejection_reason: ok ? null : (data?.error?.message || JSON.stringify(data).substring(0, 500)),
          official_components: components,
          official_variables: variables,
          official_last_synced_at: new Date().toISOString(),
        }).eq("id", tpl.id);
        results.push({ id: tpl.id, name, ok, error: ok ? null : data?.error });
      }

      return new Response(JSON.stringify({ success: true, results }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_status") {
      const url = `https://graph.facebook.com/${GRAPH_VERSION}/${integ.waba_id}/message_templates?limit=200`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${integ.access_token}` } });
      const data = await resp.json();
      if (!resp.ok) {
        return new Response(JSON.stringify({ success: false, error: data?.error?.message || "erro" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const list = data.data || [];
      for (const remote of list) {
        await supabase.from("whatsapp_templates").update({
          official_status: (remote.status || "pending").toLowerCase(),
          official_category: remote.category,
          official_language: remote.language,
          official_last_synced_at: new Date().toISOString(),
        }).eq("tenant_id", tenant_id).eq("official_template_name", remote.name);
      }
      return new Response(JSON.stringify({ success: true, count: list.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "test_connection") {
      const url = `https://graph.facebook.com/${GRAPH_VERSION}/${integ.waba_id}?fields=name,id`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${integ.access_token}` } });
      const data = await resp.json();
      return new Response(JSON.stringify({ success: resp.ok, data }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "ação desconhecida" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[whatsapp-official-templates] error", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
