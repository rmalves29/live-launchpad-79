import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  email: string;
  newPassword: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env vars in edge function");
}

const ALLOWED_EMAIL = "rmalves21@hotmail.com"; // Restrito por segurança

export default serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, newPassword } = (await req.json()) as Payload;

    if (!email || !newPassword) {
      return new Response(JSON.stringify({ error: "email and newPassword are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
      return new Response(JSON.stringify({ error: "Email not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Tenta criar o usuário já confirmado; se já existir, seguimos para atualizar
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: newPassword,
      email_confirm: true,
    });

    let userId = created?.user?.id as string | undefined;

    if (createErr && !userId) {
      // Usuário pode já existir; vamos procurar e atualizar
      // listUsers não filtra por email, mas é suficiente para bases pequenas
      let foundId: string | undefined;
      let page = 1;
      const perPage = 200;
      for (;;) {
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (listErr) throw listErr;
        const match = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (match) {
          foundId = match.id;
          break;
        }
        if (!list || list.users.length < perPage) break; // terminou
        page += 1;
      }
      if (!foundId) {
        throw new Error(createErr.message || "Failed to create or find user");
      }
      userId = foundId;
    }

    // Atualiza senha e garante email confirmado
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId!, {
      password: newPassword,
      email_confirm: true,
    });
    if (updErr) throw updErr;

    // Garante perfil com role master
    const { error: upsertErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId!, email, tenant_role: "master" }, { onConflict: "id" });
    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({ success: true, userId }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});