import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Jobs 'running' sem atualização há mais de STALL_MINUTES são reencadeados
const STALL_MINUTES = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const cutoff = new Date(Date.now() - STALL_MINUTES * 60_000).toISOString();

    const { data: jobs, error } = await supabase
      .from("sending_jobs")
      .select("id, tenant_id, updated_at, total_items, processed_items")
      .eq("status", "running")
      .lt("updated_at", cutoff);

    if (error) throw error;

    const revived: string[] = [];
    const finished: string[] = [];

    for (const job of jobs || []) {
      // Ainda há tarefas pendentes?
      const { count: pending } = await supabase
        .from("sendflow_tasks")
        .select("*", { count: "exact", head: true })
        .eq("job_id", job.id)
        .eq("status", "pending");

      if (!pending || pending === 0) {
        await supabase
          .from("sending_jobs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("status", "running");
        finished.push(job.id);
        continue;
      }

      // Destrava tarefas presas em 'processing' há muito tempo
      await supabase
        .from("sendflow_tasks")
        .update({ status: "pending" })
        .eq("job_id", job.id)
        .eq("status", "processing")
        .lt("started_at", cutoff);

      // Toca updated_at para evitar reentrada dupla no próximo ciclo
      await supabase
        .from("sending_jobs")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", job.id);

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/sendflow-process`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ job_id: job.id, tenant_id: job.tenant_id }),
        });
        await resp.text();
        console.log(`[sendflow-watchdog] Rearmado job ${job.id} (${pending} pendentes) status=${resp.status}`);
        revived.push(job.id);
      } catch (e: any) {
        console.error(`[sendflow-watchdog] Falha ao rearmar job ${job.id}:`, e?.message);
      }
    }

    return new Response(
      JSON.stringify({ success: true, checked: jobs?.length || 0, revived, finished }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[sendflow-watchdog] error:", e?.message || e);
    return new Response(JSON.stringify({ success: false, error: String(e?.message || e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
