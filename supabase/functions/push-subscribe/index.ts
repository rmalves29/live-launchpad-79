import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { tenant_id, customer_id, endpoint, p256dh, auth, user_agent, name, phone, instagram_handle } = body || {};
    if (!tenant_id || !endpoint || !p256dh || !auth) {
      return new Response(JSON.stringify({ success: false, error: "Dados obrigatórios ausentes." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Try to link with an existing customer by phone
    let linkedCustomerId: number | null = customer_id ?? null;
    if (!linkedCustomerId && phone) {
      const digits = String(phone).replace(/\D/g, "");
      const { data: cust } = await supabase.from("customers").select("id").eq("tenant_id", tenant_id).ilike("phone", `%${digits.slice(-10)}%`).limit(1).maybeSingle();
      if (cust) linkedCustomerId = (cust as any).id;
    }

    const row = {
      tenant_id, customer_id: linkedCustomerId, endpoint, p256dh, auth,
      user_agent: user_agent || null,
      name: name || null, phone: phone || null, instagram_handle: instagram_handle || null,
      is_active: true, last_seen_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
    if (error) throw error;
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || "erro" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
