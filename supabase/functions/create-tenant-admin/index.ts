import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, email, password, tenant_name, role } = await req.json();

    if (!tenant_id || !email || !password) {
      return new Response(
        JSON.stringify({ error: "tenant_id, email e password são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Definir role padrão como tenant_admin se não especificado
    const userRole = role === 'super_admin' ? 'super_admin' : 'tenant_admin';
    console.log(`Criando usuário ${email} com role: ${userRole}`);

    // Create admin client with service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let userId: string;

    if (existingUser) {
      // User exists - just update their profile
      userId = existingUser.id;
      console.log(`Usuário ${email} já existe, atualizando profile com role ${userRole}...`);
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email
      });

      if (createError) {
        console.error("Erro ao criar usuário:", createError);
        return new Response(
          JSON.stringify({ error: `Erro ao criar usuário: ${createError.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;
      console.log(`Usuário ${email} criado com sucesso: ${userId}`);
    }

    // Update profile with tenant_id and role
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        email,
        tenant_id,
        role: userRole,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (profileError) {
      console.error("Erro ao atualizar profile:", profileError);
      return new Response(
        JSON.stringify({ error: `Erro ao atualizar profile: ${profileError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update tenant with admin info
    const { error: tenantError } = await supabaseAdmin
      .from("tenants")
      .update({
        admin_email: email,
        admin_user_id: userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenant_id);

    if (tenantError) {
      console.error("Erro ao atualizar tenant:", tenantError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: userId,
        message: `Admin ${email} configurado para ${tenant_name || 'tenant'}` 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Erro na função:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
