// login-rate-limit: segunda camada de proteção do login, além do hook de verificação de senha do Supabase Auth
// (que bloqueia a CONTA de verdade, contando as senhas erradas que o próprio Auth viu) e do rate limit nativo por IP.
//
// Esta função é pública (roda antes do login), então ela NUNCA pode ser usada para trancar a conta de outra pessoa:
//  - o contador é por e-mail + IP de quem chama: quem erra senha só tranca a si mesmo;
//  - existe um teto de chamadas por IP, para não virar ferramenta de spam;
//  - "record_success" só zera o contador se o chamador estiver logado como aquele e-mail (JWT válido).
// Regras: MAX_ATTEMPTS erros dentro de WINDOW_MINUTES bloqueiam por BLOCK_MINUTES.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientIp, rateLimitOk } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const BLOCK_MINUTES = 15;
const IP_MAX_CALLS = 60; // chamadas por IP...
const IP_WINDOW_SECONDS = 600; // ...a cada 10 minutos

function normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase().slice(0, 254);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const ip = clientIp(req);
    if (!(await rateLimitOk(supabase, `login-rl:${ip}`, IP_MAX_CALLS, IP_WINDOW_SECONDS))) {
      return json({ blocked: true, retryAfterSeconds: IP_WINDOW_SECONDS }, 429);
    }

    const { action, email: rawEmail } = await req.json();
    const email = normalizeEmail(rawEmail);
    if (!email) return json({ error: "email obrigatório" }, 400);

    // chave: e-mail + IP (quem erra só tranca a si mesmo)
    const key = `${email}|${ip}`;
    const now = new Date();

    if (action === "check") {
      const { data } = await supabase
        .from("login_rate_limits")
        .select("blocked_until")
        .eq("email", key)
        .maybeSingle();

      if (data?.blocked_until && new Date(data.blocked_until) > now) {
        const retryAfterSeconds = Math.ceil((new Date(data.blocked_until).getTime() - now.getTime()) / 1000);
        return json({ blocked: true, retryAfterSeconds });
      }
      return json({ blocked: false });
    }

    if (action === "record_failure") {
      const { data: existing } = await supabase
        .from("login_rate_limits")
        .select("*")
        .eq("email", key)
        .maybeSingle();

      const windowExpired = existing?.first_failed_at
        ? (now.getTime() - new Date(existing.first_failed_at).getTime()) > WINDOW_MINUTES * 60 * 1000
        : true;

      const failedAttempts = (!existing || windowExpired) ? 1 : (existing.failed_attempts || 0) + 1;
      const firstFailedAt = (!existing || windowExpired) ? now.toISOString() : existing.first_failed_at;
      const shouldBlock = failedAttempts >= MAX_ATTEMPTS;
      const blockedUntil = shouldBlock ? new Date(now.getTime() + BLOCK_MINUTES * 60 * 1000).toISOString() : null;

      await supabase.from("login_rate_limits").upsert({
        email: key,
        failed_attempts: failedAttempts,
        first_failed_at: firstFailedAt,
        blocked_until: blockedUntil,
        updated_at: now.toISOString(),
      });

      return json({
        blocked: shouldBlock,
        remainingAttempts: Math.max(0, MAX_ATTEMPTS - failedAttempts),
        retryAfterSeconds: shouldBlock ? BLOCK_MINUTES * 60 : undefined,
      });
    }

    if (action === "record_success") {
      // só zera se o chamador provar que é o dono do e-mail
      const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (token) {
        const { data: u } = await supabase.auth.getUser(token);
        if (u?.user?.email && normalizeEmail(u.user.email) === email) {
          await supabase.from("login_rate_limits").delete().eq("email", key);
        }
      }
      return json({ ok: true });
    }

    return json({ error: "action inválida" }, 400);
  } catch (error: any) {
    console.error("[login-rate-limit] Error:", error.message);
    // Falha na checagem nunca deve impedir login legítimo — fail open.
    return json({ blocked: false, error: error.message });
  }
});
