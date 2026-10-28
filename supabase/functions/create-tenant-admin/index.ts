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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ===== AUTHENTICATION & AUTHORIZATION =====
    // Only authenticated super_admin users may create tenant admins / super_admins.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (callerProfile?.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "Forbidden: super_admin role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // ===== END AUTH =====

    const { tenant_id, email, password, tenant_name, role } = await req.json();

    if (!tenant_id || !email || !password) {
      return new Response(
        JSON.stringify({ error: "tenant_id, email e password são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Definir role padrão como tenant_admin se não especificado
    const userRole = role === 'super_admin' ? 'super_admin' : 'tenant_admin';
    console.log(`[create-tenant-admin] Caller=${userData.user.email} criando ${email} com role: ${userRole}`);

    // Check if user already exists (paginated)
    const normEmail = String(email).trim().toLowerCase();
    let existingUser: { id: string } | undefined;
    for (let page = 1; page <= 20; page++) {
      const { data: pageData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listErr) {
        console.error("Erro ao listar usuários:", listErr);
        break;
      }
      const users = pageData?.users ?? [];
      existingUser = users.find((u) => (u.email ?? "").trim().toLowerCase() === normEmail);
      if (existingUser || users.length < 1000) break;
    }

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("tenant_id")
        .eq("id", userId)
        .maybeSingle();

      const otherTenantId = existingProfile?.tenant_id;
      if (otherTenantId && otherTenantId !== tenant_id) {
        const { data: otherTenant } = await supabaseAdmin
          .from("tenants")
          .select("id")
          .eq("id", otherTenantId)
          .maybeSingle();
        if (otherTenant) {
          return new Response(
            JSON.stringify({ error: `O e-mail ${email} já é login de outra empresa` }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (updErr) {
        console.error("Erro ao atualizar senha:", updErr);
        return new Response(
          JSON.stringify({ error: `Erro ao atualizar senha: ${updErr.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log(`Usuário ${email} já existia; senha atualizada e profile com role ${userRole}...`);
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
