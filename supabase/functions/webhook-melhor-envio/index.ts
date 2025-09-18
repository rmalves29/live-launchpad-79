import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      // TODO: validar 'Webhook Secret' do ME se quisermos (opcional)
      console.log("[ME Webhook] body=", body);
      return new Response("ok", { status: 200 });
    }

    // o portal do ME às vezes testa com GET; responda 200 também
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("ok", { status: 200 }); // nunca 4xx/5xx para o teste
  }
});