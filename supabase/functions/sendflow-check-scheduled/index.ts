import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find all scheduled jobs whose scheduled_at has passed
    const { data: scheduledJobs, error } = await supabase
      .from("sending_jobs")
      .select("id, tenant_id, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());

    if (error) {
      console.error("[sendflow-check-scheduled] Error fetching jobs:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!scheduledJobs || scheduledJobs.length === 0) {
      return new Response(JSON.stringify({ triggered: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[sendflow-check-scheduled] Found ${scheduledJobs.length} scheduled job(s) ready to run`);

    let triggered = 0;

    for (const job of scheduledJobs) {
      // Update status to running
      const { error: updateError } = await supabase
        .from("sending_jobs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("status", "scheduled"); // Ensure no race condition

      if (updateError) {
        console.error(`[sendflow-check-scheduled] Error updating job ${job.id}:`, updateError.message);
        continue;
      }

      // Invoke sendflow-process
      const functionUrl = `${supabaseUrl}/functions/v1/sendflow-process`;
      try {
        const resp = await fetch(functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ job_id: job.id, tenant_id: job.tenant_id }),
        });
        console.log(`[sendflow-check-scheduled] Triggered job ${job.id}, status: ${resp.status}`);
        await resp.text(); // consume body
        triggered++;
      } catch (e: any) {
        console.error(`[sendflow-check-scheduled] Error triggering job ${job.id}:`, e?.message);
      }
    }

    return new Response(JSON.stringify({ triggered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[sendflow-check-scheduled] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
