// Conversões pelo servidor (03-ads-trafego.md, 3.1 e 3.4):
//  - Meta Conversions API (CAPI), com o MESMO event_id do Pixel para deduplicar.
//  - GA4 Measurement Protocol (o GA4 não deduplica: o navegador pula esses eventos
//    quando VITE_GA4_SERVER_EVENTS=on).
// Sem as variáveis configuradas, as funções não fazem nada. Nunca derrubam a requisição.
//
// Variáveis (secrets da função):
//   META_PIXEL_ID, META_CAPI_TOKEN, META_TEST_EVENT_CODE (opcional, só em teste)
//   GA4_MEASUREMENT_ID, GA4_API_SECRET

export async function sha256(v: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v.trim().toLowerCase()));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UsuarioConversao {
  phone?: string; // 55DDDNUMERO
  firstName?: string;
  email?: string;
  externalId?: string; // id do lead no Supabase
  ip?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
}

export interface EventoMeta {
  nome: string; // Lead | Schedule | Subscribe | Purchase | LeadQualificado
  eventId: string;
  sourceUrl: string;
  usuario: UsuarioConversao;
  customData?: Record<string, unknown>;
  actionSource?: "website" | "system_generated" | "chat";
}

export async function enviarMeta(ev: EventoMeta): Promise<void> {
  const pixel = Deno.env.get("META_PIXEL_ID");
  const token = Deno.env.get("META_CAPI_TOKEN");
  if (!pixel || !token) return;
  try {
    const u = ev.usuario;
    const user_data: Record<string, unknown> = {};
    if (u.phone) user_data.ph = [await sha256(u.phone.replace(/\D/g, ""))];
    if (u.firstName) user_data.fn = [await sha256(u.firstName.split(" ")[0])];
    if (u.email) user_data.em = [await sha256(u.email)];
    if (u.externalId) user_data.external_id = [await sha256(u.externalId)];
    if (u.ip && u.ip !== "unknown") user_data.client_ip_address = u.ip;
    if (u.userAgent) user_data.client_user_agent = u.userAgent;
    if (u.fbp) user_data.fbp = u.fbp;
    if (u.fbc) user_data.fbc = u.fbc;
    const body: Record<string, unknown> = {
      data: [
        {
          event_name: ev.nome,
          event_time: Math.floor(Date.now() / 1000),
          event_id: ev.eventId,
          action_source: ev.actionSource || "website",
          event_source_url: ev.sourceUrl,
          user_data,
          custom_data: ev.customData || {},
        },
      ],
    };
    const teste = Deno.env.get("META_TEST_EVENT_CODE");
    if (teste) body.test_event_code = teste;
    const r = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) console.error("CAPI", ev.nome, r.status, (await r.text()).slice(0, 300));
  } catch (e) {
    console.error("CAPI erro", ev.nome, String(e));
  }
}

export async function enviarGa4(opts: {
  clientId?: string;
  userId?: string;
  nome: string;
  params: Record<string, unknown>;
}): Promise<void> {
  const mid = Deno.env.get("GA4_MEASUREMENT_ID");
  const secret = Deno.env.get("GA4_API_SECRET");
  if (!mid || !secret) return;
  try {
    const clientId = opts.clientId || `${Math.floor(Math.random() * 1e10)}.${Math.floor(Date.now() / 1000)}`;
    const r = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(mid)}&api_secret=${encodeURIComponent(secret)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          user_id: opts.userId,
          events: [{ name: opts.nome, params: { ...opts.params, engagement_time_msec: 1 } }],
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!r.ok) console.error("GA4 MP", opts.nome, r.status);
  } catch (e) {
    console.error("GA4 MP erro", opts.nome, String(e));
  }
}
