// Deno runtime (Edge Functions)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-webhook-secret,x-hub-signature",
};

serve(async (req: Request) => {
  // Pré-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors });
  }

  // O painel do Melhor Envio testa com GET → sempre 200
  if (req.method === "GET") {
    return new Response("ok", { status: 200, headers: cors });
  }

  if (req.method === "POST") {
    try {
      // (Opcional) validação de segredo se quiser travar depois
      // const expected = Deno.env.get("ME_WEBHOOK_SECRET") ?? "";
      // const provided = req.headers.get("x-webhook-secret") ?? "";
      // if (expected && expected !== provided) {
      //   return new Response("invalid secret", { status: 401, headers: cors });
      // }

      const body = await req.json().catch(() => ({}));
      // TODO: persista em tabela de logs, atualize status da etiqueta, etc.
      console.log("[melhor-envio-webhook] payload:", body);

      return new Response("received", { status: 200, headers: cors });
    } catch (e) {
      console.error("webhook error:", e);
      return new Response("error", { status: 500, headers: cors });
    }
  }

  return new Response("method not allowed", { status: 405, headers: cors });
});