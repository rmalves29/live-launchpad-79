// Minimal Web Push helper (VAPID + aes128gcm) for Deno.
// Uses npm:web-push under the hood.
// deno-lint-ignore-file no-explicit-any
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const RAW_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@orderzaps.com";
// Sanitize: accept "mailto: <email>" / "<email>" / "email@x" and normalize to "mailto:email"
function normalizeSubject(s: string): string {
  let v = (s || "").trim();
  const emailMatch = v.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) return `mailto:${emailMatch[0]}`;
  if (v.startsWith("http")) return v;
  return "mailto:contato@orderzaps.com";
}
const VAPID_SUBJECT = normalizeSubject(RAW_SUBJECT);

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); } catch (_) {}
}

export interface PushEndpointSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function sendWebPush(
  sub: PushEndpointSub,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; statusCode?: number; error?: string; gone?: boolean }> {
  try {
    const res = await webpush.sendNotification(sub as any, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
    return { ok: true, statusCode: (res as any)?.statusCode };
  } catch (e: any) {
    const code = e?.statusCode || 0;
    const gone = code === 404 || code === 410;
    return { ok: false, statusCode: code, error: e?.body || e?.message || String(e), gone };
  }
}

export function getVapidPublicKey(): string { return VAPID_PUBLIC; }
