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

    // Find pending scheduled messages that are due
    const now = new Date().toISOString();
    const { data: messages, error } = await supabase
      .from("fe_messages")
      .select("*, fe_groups!inner(group_jid, group_name)")
      .eq("status", "pending")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[fe-process-scheduled] Query error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!messages?.length) {
      return new Response(JSON.stringify({ processed: 0, message: "No pending messages" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[fe-process-scheduled] Processing ${messages.length} scheduled messages`);

    // Group by tenant to reuse Z-API credentials
    const byTenant: Record<string, any[]> = {};
    for (const msg of messages) {
      if (!byTenant[msg.tenant_id]) byTenant[msg.tenant_id] = [];
      byTenant[msg.tenant_id].push(msg);
    }

    let processed = 0;
    let failed = 0;

    for (const [tenantId, tenantMsgs] of Object.entries(byTenant)) {
      // Call fe-send-message for each batch
      const groupIds = tenantMsgs.map((m: any) => m.group_id);

      // Mark as sending
      await supabase
        .from("fe_messages")
        .update({ status: "sending" })
        .in("id", tenantMsgs.map((m: any) => m.id));

      try {
        const sendRes = await fetch(`${supabaseUrl}/functions/v1/fe-send-message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            group_ids: [...new Set(groupIds)],
            content_type: tenantMsgs[0].content_type,
            content_text: tenantMsgs[0].content_text,
            media_url: tenantMsgs[0].media_url,
          }),
        });

        if (sendRes.ok) {
          processed += tenantMsgs.length;
        } else {
          failed += tenantMsgs.length;
          const errText = await sendRes.text();
          console.error(`[fe-process-scheduled] Send failed for tenant ${tenantId}: ${errText}`);
        }
      } catch (err: any) {
        failed += tenantMsgs.length;
        console.error(`[fe-process-scheduled] Error for tenant ${tenantId}:`, err.message);

        await supabase
          .from("fe_messages")
          .update({ status: "failed" })
          .in("id", tenantMsgs.map((m: any) => m.id));
      }
    }

    return new Response(JSON.stringify({ processed, failed, total: messages.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[fe-process-scheduled] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
