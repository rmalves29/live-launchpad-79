import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { tenant_id, phone } = await req.json();
    if (!tenant_id || !phone) {
      return new Response(JSON.stringify({ success: false, address: null, error: "tenant_id e phone são obrigatórios" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("customers")
      .select("name, email, cpf, cep, street, number, complement, neighborhood, city, state")
      .eq("tenant_id", tenant_id)
      .eq("phone", String(phone).replace(/\D/g, ""))
      .maybeSingle();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, address: data ?? null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[public-checkout-customer-address]", error);
    return new Response(JSON.stringify({ success: false, address: null, error: "Erro ao buscar endereço do cliente" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});