// Google Agenda da conta do dono (OAuth com refresh token guardado nos Secrets).
const CID = () => Deno.env.get("GOOGLE_CLIENT_ID") || "";
const CSECRET = () => Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const REFRESH = () => Deno.env.get("GOOGLE_REFRESH_TOKEN") || "";
const CAL = () => encodeURIComponent(Deno.env.get("GOOGLE_CALENDAR_ID") || "primary");
const BASE = "https://www.googleapis.com/calendar/v3";

export const googleConfigured = () => !!(CID() && CSECRET() && REFRESH());

async function accessToken(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CID(), client_secret: CSECRET(), refresh_token: REFRESH(), grant_type: "refresh_token" }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`google token [${r.status}]: ${t.slice(0, 300)}`);
  return JSON.parse(t).access_token;
}

async function call(method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  if (!r.ok && !(method === "DELETE" && (r.status === 404 || r.status === 410))) throw new Error(`google [${r.status}]: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

const range = (startIso: string, minutes: number) => ({
  start: { dateTime: new Date(startIso).toISOString(), timeZone: "America/Sao_Paulo" },
  end: { dateTime: new Date(new Date(startIso).getTime() + minutes * 60e3).toISOString(), timeZone: "America/Sao_Paulo" },
});

export async function createMeetEvent(p: { summary: string; description: string; start: string; minutes: number }) {
  const ev = await call("POST", `/calendars/${CAL()}/events?conferenceDataVersion=1`, {
    summary: p.summary, description: p.description, ...range(p.start, p.minutes),
    conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
  });
  const link = ev?.hangoutLink || ev?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri || null;
  return { id: String(ev.id), link: link as string | null };
}

export async function moveEvent(id: string, start: string, minutes: number) {
  await call("PATCH", `/calendars/${CAL()}/events/${encodeURIComponent(id)}`, range(start, minutes));
}

export async function deleteEvent(id: string) {
  await call("DELETE", `/calendars/${CAL()}/events/${encodeURIComponent(id)}`);
}

/** Intervalos ocupados na agenda do Google (qualquer compromisso seu, não só reuniões do Cartzy). */
export async function busyIntervals(fromIso: string, toIso: string): Promise<{ start: string; end: string }[]> {
  const cal = decodeURIComponent(CAL());
  const r = await call("POST", `/freeBusy`, { timeMin: fromIso, timeMax: toIso, timeZone: "America/Sao_Paulo", items: [{ id: cal }] });
  const busy = r?.calendars?.[cal]?.busy;
  return Array.isArray(busy) ? busy.map((b: any) => ({ start: String(b.start), end: String(b.end) })) : [];
}
