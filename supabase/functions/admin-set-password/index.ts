import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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

    // 1) Buscar usuário por e-mail via GoTrue Admin API
    const adminUsersUrl = `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
    const findRes = await fetch(adminUsersUrl, {
      method: "GET",
      headers: {
        apikey: SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!findRes.ok) {
      const text = await findRes.text();
      return new Response(JSON.stringify({ error: `Failed to fetch user: ${text}` }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const users = (await findRes.json()) as { users: Array<{ id: string; email: string }> } | Array<{ id: string; email: string }>;

    const list = Array.isArray(users) ? users : users.users;
    const user = list?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 2) Atualizar senha do usuário
    const updateUrl = `${SUPABASE_URL}/auth/v1/admin/users/${user.id}`;
    const updateRes = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: newPassword }),
    });

    if (!updateRes.ok) {
      const text = await updateRes.text();
      return new Response(JSON.stringify({ error: `Failed to update password: ${text}` }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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