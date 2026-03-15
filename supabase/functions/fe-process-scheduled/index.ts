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
      .select("id, tenant_id, group_id, content_type, content_text, media_url")
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

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const msg of messages) {
      if (!msg.group_id) {
        failed += 1;
        await supabase
          .from("fe_messages")
          .update({ status: "failed" })
          .eq("id", msg.id)
          .eq("status", "pending");
        continue;
      }

      const { data: lockedMessage, error: lockError } = await supabase
        .from("fe_messages")
        .update({ status: "sending" })
        .eq("id", msg.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (lockError) {
        console.error(`[fe-process-scheduled] Lock error for message ${msg.id}: ${lockError.message}`);
        failed += 1;
        continue;
      }

      if (!lockedMessage) {
        skipped += 1;
        continue;
      }

      try {
        const sendRes = await fetch(`${supabaseUrl}/functions/v1/fe-send-message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            tenant_id: msg.tenant_id,
            group_ids: [msg.group_id],
            message_ids: [msg.id],
            content_type: msg.content_type,
            content_text: msg.content_text,
            media_url: msg.media_url,
          }),
        });

        const payload = await sendRes.json().catch(() => null);

        if (!sendRes.ok || !payload?.sent) {
          failed += 1;
          const errText = payload?.error || payload?.message || JSON.stringify(payload || {});
          console.error(`[fe-process-scheduled] Send failed for message ${msg.id}: ${errText}`);

          await supabase
            .from("fe_messages")
            .update({ status: "failed" })
            .eq("id", msg.id)
            .eq("status", "sending");
        } else {
          processed += 1;
        }
      } catch (err: any) {
        failed += 1;
        console.error(`[fe-process-scheduled] Error for message ${msg.id}:`, err.message);

        await supabase
          .from("fe_messages")
          .update({ status: "failed" })
          .eq("id", msg.id)
          .eq("status", "sending");
      }
    }

    return new Response(JSON.stringify({ processed, failed, skipped, total: messages.length }), {
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
