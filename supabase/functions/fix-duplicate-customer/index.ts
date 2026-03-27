import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const tenantId = "b22bb1e6-e9a1-4469-aa4e-57ab13f29321";

    // 1. Update the correct record (6367) with the name from the bad record
    const { error: e1 } = await supabase
      .from("customers")
      .update({ name: "meusegredosbell" })
      .eq("id", 6367);

    // 2. Fix the order that has the wrong phone
    const { error: e2 } = await supabase
      .from("orders")
      .update({ customer_phone: "11994256717", customer_name: "meusegredosbell" })
      .eq("id", 4316);

    // 3. Delete the duplicate record with leading zero
    const { error: e3 } = await supabase
      .from("customers")
      .delete()
      .eq("id", 6366);

    const errors = [e1, e2, e3].filter(Boolean);

    return new Response(
      JSON.stringify({ 
        ok: errors.length === 0, 
        errors: errors.map(e => e?.message),
        actions: ["updated customer 6367 name", "fixed order 4316 phone", "deleted duplicate 6366"]
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
