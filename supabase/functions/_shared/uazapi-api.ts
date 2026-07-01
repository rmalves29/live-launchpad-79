// uazapi (uazapiGO) API wrapper
// Docs: https://docs.uazapi.com

export interface UazapiConfig {
  url: string;   // ex: https://yourname.uazapi.com
  token: string; // token da instância
}

export interface UazapiAdminConfig {
  url: string;
  adminToken: string;
}

function trimUrl(u: string): string {
  return (u || "").replace(/\/+$/, "");
}

function instanceHeaders(token: string): Record<string, string> {
  return { "Content-Type": "application/json", "token": token };
}

function adminHeaders(adminToken: string): Record<string, string> {
  return { "Content-Type": "application/json", "admintoken": adminToken };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readResult(res: Response): Promise<{ success: boolean; messageId?: string; error?: string; data?: any }> {
  const text = await res.text();
  let data: any = null;
  if (text) {
    try { data = JSON.parse(text); } catch { /* ignore */ }
  }
  if (res.ok) {
    const id = data?.id || data?.messageid || data?.message?.id || data?.key?.id || undefined;
    return { success: true, messageId: id, data };
  }
  const body = data ? JSON.stringify(data) : text;
  const snippet = (body || res.statusText || "sem resposta").replace(/\s+/g, " ").trim().substring(0, 300);
  return { success: false, error: `uazapi ${res.status}: ${snippet}` };
}

// ============ Mensagens ============

export async function sendText(cfg: UazapiConfig, phone: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const res = await fetchWithTimeout(`${trimUrl(cfg.url)}/send/text`, {
      method: "POST",
      headers: instanceHeaders(cfg.token),
      body: JSON.stringify({ number: phone, text }),
    }, 60_000);
    return await readResult(res);
  } catch (e: any) {
    return { success: false, error: e.name === "AbortError" ? "uazapi timeout sendText" : e.message };
  }
}

async function loadBase64(mediaUrl: string): Promise<string> {
  if (!/^https?:\/\//i.test(mediaUrl)) return mediaUrl;
  const r = await fetch(mediaUrl);
  if (!r.ok) throw new Error(`Falha ao baixar mídia ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function sendMedia(
  cfg: UazapiConfig,
  phone: string,
  type: "image" | "video" | "audio" | "document" | "ptt",
  fileUrlOrBase64: string,
  caption?: string,
  docName?: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // uazapi aceita URL ou base64 no campo "file"
    const body: Record<string, unknown> = { number: phone, type, file: fileUrlOrBase64 };
    if (caption) body.text = caption;
    if (docName) body.docName = docName;
    const res = await fetchWithTimeout(`${trimUrl(cfg.url)}/send/media`, {
      method: "POST",
      headers: instanceHeaders(cfg.token),
      body: JSON.stringify(body),
    }, 90_000);
    return await readResult(res);
  } catch (e: any) {
    return { success: false, error: e.name === "AbortError" ? "uazapi timeout sendMedia" : e.message };
  }
}

export async function sendImage(cfg: UazapiConfig, phone: string, imageUrl: string, caption?: string) {
  return sendMedia(cfg, phone, "image", imageUrl, caption);
}

export async function sendDocument(cfg: UazapiConfig, phone: string, documentUrl: string, fileName = "documento.pdf") {
  return sendMedia(cfg, phone, "document", documentUrl, undefined, fileName);
}

export async function sendAudio(cfg: UazapiConfig, phone: string, audioUrl: string) {
  return sendMedia(cfg, phone, "audio", audioUrl);
}

export async function sendVideo(cfg: UazapiConfig, phone: string, videoUrl: string, caption?: string) {
  return sendMedia(cfg, phone, "video", videoUrl, caption);
}

export async function sendButton(
  cfg: UazapiConfig,
  phone: string,
  message: string,
  buttonLabel: string,
  buttonUrl: string,
  footerText?: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const label = (buttonLabel || "Pagar Agora").toString().trim().slice(0, 20) || "Pagar Agora";
    const url = (buttonUrl || "").toString().trim();
    if (!url) return sendText(cfg, phone, message);

    const body: Record<string, unknown> = {
      number: phone,
      type: "button",
      text: message,
      choices: [`${label}|${url}`],
    };
    if (footerText) body.footerText = footerText;

    const res = await fetchWithTimeout(`${trimUrl(cfg.url)}/send/menu`, {
      method: "POST",
      headers: instanceHeaders(cfg.token),
      body: JSON.stringify(body),
    }, 60_000);
    return await readResult(res);
  } catch (e: any) {
    return { success: false, error: e.name === "AbortError" ? "uazapi timeout sendButton" : e.message };
  }
}

export async function sendReaction(
  cfg: UazapiConfig,
  phone: string,
  messageId: string,
  emoji: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const id = (messageId || "").toString().trim();
    const reaction = (emoji || "❤️").toString().trim() || "❤️";
    if (!id) return { success: false, error: "messageId ausente para reação" };

    const res = await fetchWithTimeout(`${trimUrl(cfg.url)}/send/reaction`, {
      method: "POST",
      headers: instanceHeaders(cfg.token),
      body: JSON.stringify({
        number: phone,
        messageid: id,
        messageId: id,
        id,
        reaction,
        emoji: reaction,
      }),
    }, 20_000);
    return await readResult(res);
  } catch (e: any) {
    return { success: false, error: e.name === "AbortError" ? "uazapi timeout sendReaction" : e.message };
  }
}

// Fallback textual para fluxos onde o botão nativo não deve ser usado.
export async function sendLinkMessage(
  cfg: UazapiConfig,
  phone: string,
  message: string,
  buttonLabel: string,
  buttonUrl: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const text = `${message}\n\n👉 ${buttonLabel}: ${buttonUrl}`;
  return sendText(cfg, phone, text);
}

// ============ Presença ============

export async function sendPresence(
  cfg: UazapiConfig,
  phone: string,
  presence: "composing" | "available" | "recording" | "paused",
  delayMs?: number,
): Promise<void> {
  try {
    const body: Record<string, unknown> = { number: phone, presence };
    if (delayMs) body.delay = delayMs;
    await fetchWithTimeout(`${trimUrl(cfg.url)}/send/presence`, {
      method: "POST",
      headers: instanceHeaders(cfg.token),
      body: JSON.stringify(body),
    }, 10_000);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  } catch (e: any) {
    console.warn(`[uazapi] sendPresence error: ${e.message}`);
  }
}

export async function sendPresenceComposing(cfg: UazapiConfig, phone: string, durationMs?: number) {
  return sendPresence(cfg, phone, "composing", durationMs || 3000);
}

export async function sendPresenceAvailable(cfg: UazapiConfig, phone: string) {
  await sendPresence(cfg, phone, "available");
  await new Promise((r) => setTimeout(r, 400 + Math.random() * 500));
}

export function calcTypingDuration(messageLength: number): number {
  const base = (messageLength / 40) * 1000;
  const multiplier = 0.5 + Math.random();
  return Math.min(Math.max(base * multiplier, 2000), 8000);
}

// ============ Instância ============

export interface UazapiStatus {
  connected: boolean;
  status: string;
  user?: { phone?: string; name?: string };
  qrcode?: string;
  paircode?: string;
}

export async function getInstanceStatus(cfg: UazapiConfig): Promise<UazapiStatus> {
  try {
    const res = await fetch(`${trimUrl(cfg.url)}/instance/status`, {
      method: "GET",
      headers: instanceHeaders(cfg.token),
    });
    const data = await res.json().catch(() => null);
    const inst = data?.instance || data;
    const status = inst?.status || "disconnected";
    const connected = status === "connected";
    const phone = inst?.owner || inst?.wid || inst?.phoneconnected || undefined;
    const name = inst?.profileName || inst?.profilename || undefined;
    return {
      connected,
      status,
      user: phone ? { phone: String(phone).replace(/@.*/, ""), name } : undefined,
      qrcode: inst?.qrcode,
      paircode: inst?.paircode,
    };
  } catch (e: any) {
    return { connected: false, status: "error" };
  }
}

export async function connectInstance(cfg: UazapiConfig, phone?: string): Promise<{ qrcode?: string; paircode?: string; status?: string; error?: string }> {
  try {
    const body: Record<string, unknown> = {};
    if (phone) body.phone = phone;
    const res = await fetch(`${trimUrl(cfg.url)}/instance/connect`, {
      method: "POST",
      headers: instanceHeaders(cfg.token),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { error: JSON.stringify(data).substring(0, 300) };
    const inst = data?.instance || data;
    return { qrcode: inst?.qrcode, paircode: inst?.paircode, status: inst?.status };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function disconnectInstance(cfg: UazapiConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${trimUrl(cfg.url)}/instance/disconnect`, {
      method: "POST",
      headers: instanceHeaders(cfg.token),
    });
    if (res.ok) return { success: true };
    const t = await res.text();
    return { success: false, error: t.substring(0, 200) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createInstance(admin: UazapiAdminConfig, name: string, systemName?: string): Promise<{ success: boolean; token?: string; error?: string; raw?: any }> {
  try {
    const res = await fetch(`${trimUrl(admin.url)}/instance/init`, {
      method: "POST",
      headers: adminHeaders(admin.adminToken),
      body: JSON.stringify({ name, systemName: systemName || name }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { success: false, error: JSON.stringify(data).substring(0, 300), raw: data };
    const token = data?.instance?.token || data?.token;
    if (!token) return { success: false, error: "Token da instância não retornado", raw: data };
    return { success: true, token, raw: data };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function setWebhook(cfg: UazapiConfig, webhookUrl: string, events?: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const body = {
      url: webhookUrl,
      enabled: true,
      events: events || ["messages", "messages_update", "connection", "presence", "groups"],
      addUrlEvents: false,
      addUrlTypesMessages: false,
    };
    const res = await fetch(`${trimUrl(cfg.url)}/webhook`, {
      method: "POST",
      headers: instanceHeaders(cfg.token),
      body: JSON.stringify(body),
    });
    if (res.ok) return { success: true };
    const t = await res.text();
    return { success: false, error: t.substring(0, 200) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ============ Helpers ============

export async function getGroupParticipants(cfg: UazapiConfig, groupJid: string): Promise<string[]> {
  try {
    const res = await fetch(`${trimUrl(cfg.url)}/group/info`, {
      method: "POST",
      headers: instanceHeaders(cfg.token),
      body: JSON.stringify({ groupjid: groupJid }),
    });
    const data = await res.json().catch(() => null);
    const participants = data?.participants || data?.group?.participants || [];
    return participants.map((p: any) => (typeof p === "string" ? p : p.id || p.jid || p)).filter(Boolean);
  } catch (e: any) {
    console.warn(`[uazapi] getGroupParticipants error: ${e.message}`);
    return [];
  }
}

export async function listGroups(cfg: UazapiConfig): Promise<any[]> {
  try {
    const res = await fetch(`${trimUrl(cfg.url)}/group/list`, {
      method: "GET",
      headers: instanceHeaders(cfg.token),
    });
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : (data?.groups || []);
  } catch (e: any) {
    console.warn(`[uazapi] listGroups error: ${e.message}`);
    return [];
  }
}

// Helper para buscar credenciais uazapi do tenant
export async function getUazapiConfig(
  supabase: any,
  tenantId: string,
): Promise<{ cfg?: UazapiConfig; error?: string }> {
  const { data, error } = await supabase
    .from("integration_whatsapp")
    .select("uazapi_url, uazapi_token, provider, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Integração WhatsApp não configurada" };
  if (!data.uazapi_url || !data.uazapi_token) return { error: "Credenciais uazapi não configuradas" };
  return { cfg: { url: data.uazapi_url, token: data.uazapi_token } };
}

const REACTION_EMOJIS = ["❤️", "🔥", "😍", "👏", "🛍️", "💜", "😱", "🤩", "👀", "💯"];
export function getRandomReactionEmoji(): string {
  return REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)];
}
