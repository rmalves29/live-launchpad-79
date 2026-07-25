// login-rate-limit: bloqueia temporariamente tentativas de login para uma conta
// específica após várias senhas erradas seguidas. Camada extra além do rate
// limit nativo do Supabase Auth (que é por IP/projeto, não por conta).
//
// Regras: MAX_ATTEMPTS tentativas erradas dentro da janela de WINDOW_MINUTES
// minutos bloqueiam a conta por BLOCK_MINUTES minutos.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const BLOCK_MINUTES = 15;

function normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, email: rawEmail } = await req.json();
    const email = normalizeEmail(rawEmail);
    if (!email) {
      return new Response(JSON.stringify({ error: "email obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();

    if (action === "check") {
      const { data } = await supabase
        .from("login_rate_limits")
        .select("blocked_until")
        .eq("email", email)
        .maybeSingle();

      if (data?.blocked_until && new Date(data.blocked_until) > now) {
        const retryAfterSeconds = Math.ceil((new Date(data.blocked_until).getTime() - now.getTime()) / 1000);
        return new Response(JSON.stringify({ blocked: true, retryAfterSeconds }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ blocked: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "record_failure") {
      const { data: existing } = await supabase
        .from("login_rate_limits")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      const windowExpired = existing?.first_failed_at
        ? (now.getTime() - new Date(existing.first_failed_at).getTime()) > WINDOW_MINUTES * 60 * 1000
        : true;

      const failedAttempts = (!existing || windowExpired) ? 1 : (existing.failed_attempts || 0) + 1;
      const firstFailedAt = (!existing || windowExpired) ? now.toISOString() : existing.first_failed_at;
      const shouldBlock = failedAttempts >= MAX_ATTEMPTS;
      const blockedUntil = shouldBlock ? new Date(now.getTime() + BLOCK_MINUTES * 60 * 1000).toISOString() : null;

      await supabase.from("login_rate_limits").upsert({
        email,
        failed_attempts: failedAttempts,
        first_failed_at: firstFailedAt,
        blocked_until: blockedUntil,
        updated_at: now.toISOString(),
      });

      return new Response(JSON.stringify({
        blocked: shouldBlock,
        remainingAttempts: Math.max(0, MAX_ATTEMPTS - failedAttempts),
        retryAfterSeconds: shouldBlock ? BLOCK_MINUTES * 60 : undefined,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "record_success") {
      await supabase.from("login_rate_limits").delete().eq("email", email);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "action inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[login-rate-limit] Error:", error.message);
    // Falha na checagem nunca deve impedir login legítimo — fail open.
    return new Response(JSON.stringify({ blocked: false, error: error.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
