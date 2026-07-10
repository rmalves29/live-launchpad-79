import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const logId = url.searchParams.get("log_id");
    if (!logId) return new Response(JSON.stringify({ success: false }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: log } = await supabase.from("push_notifications_log").select("id, campaign_id").eq("id", Number(logId)).maybeSingle();
    if (log) {
      await supabase.from("push_notifications_log").update({ status: "clicked", clicked_at: new Date().toISOString() }).eq("id", (log as any).id);
      if ((log as any).campaign_id) {
        await supabase.rpc("push_increment_campaign_clicks", { p_campaign_id: (log as any).campaign_id }).then(()=>{}).catch(()=>{});
        // fallback direct update if rpc missing
        const { data: c } = await supabase.from("push_campaigns").select("total_clicked").eq("id", (log as any).campaign_id).maybeSingle();
        if (c) await supabase.from("push_campaigns").update({ total_clicked: ((c as any).total_clicked || 0) + 1 }).eq("id", (log as any).campaign_id);
      }
    }
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
