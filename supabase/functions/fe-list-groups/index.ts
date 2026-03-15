import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { tenant_id } = await req.json();

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Z-API credentials
    const { data: waConfig } = await supabase
      .from("integration_whatsapp")
      .select("zapi_instance_id, zapi_token, zapi_client_token")
      .eq("tenant_id", tenant_id)
      .eq("provider", "zapi")
      .eq("is_active", true)
      .maybeSingle();

    if (!waConfig?.zapi_instance_id || !waConfig?.zapi_token) {
      return new Response(JSON.stringify({ error: "Z-API não configurada para este tenant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (waConfig.zapi_client_token) headers["Client-Token"] = waConfig.zapi_client_token;

    // Fetch groups from Z-API
    const response = await fetch(
      `https://api.z-api.io/instances/${waConfig.zapi_instance_id}/token/${waConfig.zapi_token}/chats`,
      { headers }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[fe-list-groups] Z-API error: ${response.status} ${errText}`);
      return new Response(JSON.stringify({ error: `Z-API retornou ${response.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chats = await response.json();
    const groupChats = (chats || []).filter((c: any) => c.isGroup);

    // Upsert into fe_groups
    let added = 0;
    for (const g of groupChats) {
      const { error } = await supabase
        .from("fe_groups")
        .upsert(
          {
            tenant_id,
            group_jid: g.phone,
            group_name: g.name || g.phone,
            participant_count: g.participantsCount || 0,
          },
          { onConflict: "tenant_id,group_jid" }
        );
      if (!error) added++;
    }

    // Return updated list
    const { data: groups } = await supabase
      .from("fe_groups")
      .select("*")
      .eq("tenant_id", tenant_id)
      .order("group_name");

    return new Response(JSON.stringify({ added, total: groupChats.length, groups }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[fe-list-groups] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
