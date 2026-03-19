import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenantSlug, instagram, phone, name } = await req.json();

    if (!tenantSlug || !instagram || !phone) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: tenantSlug, instagram, phone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate instagram handle
    const cleanInstagram = instagram.replace(/^@/, "").trim();
    if (!cleanInstagram || cleanInstagram.length > 100) {
      return new Response(
        JSON.stringify({ error: "Instagram inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate phone
    const cleanPhone = phone.replace(/\D/g, "").trim();
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return new Response(
        JSON.stringify({ error: "Telefone inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate name
    const cleanName = name ? String(name).trim().slice(0, 200) : null;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find tenant by slug
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .eq("is_active", true)
      .maybeSingle();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: "Loja não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if customer with this instagram already exists for this tenant
    const { data: existing } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("tenant_id", tenant.id)
      .ilike("instagram", cleanInstagram)
      .maybeSingle();

    if (existing) {
      // Update existing customer
      const updateData: Record<string, any> = { phone: cleanPhone, updated_at: new Date().toISOString() };
      if (cleanName) updateData.name = cleanName;

      const { error: updateError } = await supabaseAdmin
        .from("customers")
        .update(updateData)
        .eq("id", existing.id);

      if (updateError) throw updateError;
    } else {
      // Insert new customer
      const { error: insertError } = await supabaseAdmin
        .from("customers")
        .insert({
          tenant_id: tenant.id,
          instagram: cleanInstagram,
          phone: cleanPhone,
          name: cleanName || cleanInstagram,
        });

      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("instagram-register error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno ao processar cadastro" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
