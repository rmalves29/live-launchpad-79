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
  type: "image" | "video" | "audio" | "document" | "ptt" | "ptv",
  fileUrlOrBase64: string,
  caption?: string,
  docName?: string,
  viewOnce?: boolean,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // uazapi aceita URL ou base64 no campo "file"
    const body: Record<string, unknown> = { number: phone, type, file: fileUrlOrBase64 };
    if (caption) body.text = caption;
    if (docName) body.docName = docName;
    if (viewOnce) body.viewOnce = true; // visualização única (imagem, vídeo, áudio)
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

// Vídeo redondo ("recado de vídeo" / PTV). Não aceita legenda: o texto vai em mensagem separada.
export async function sendVideoNote(cfg: UazapiConfig, phone: string, videoUrl: string) {
  return sendMedia(cfg, phone, "ptv", videoUrl);
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

export async function sendPoll(
  cfg: UazapiConfig,
  phone: string,
  question: string,
  options: string[],
  selectableCount = 1,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const choices = options.map((o) => (o || "").toString().trim()).filter(Boolean);
    if (!question.trim() || choices.length < 2) {
      return { success: false, error: "Enquete precisa de pergunta e ao menos 2 opcoes" };
    }
    const res = await fetchWithTimeout(`${trimUrl(cfg.url)}/send/menu`, {
      method: "POST",
      headers: instanceHeaders(cfg.token),
      body: JSON.stringify({
        number: phone,
        type: "poll",
        text: question,
        choices,
        selectableCount: Math.min(Math.max(1, selectableCount), choices.length),
      }),
    }, 60_000);
    return await readResult(res);
  } catch (e: any) {
    return { success: false, error: e.name === "AbortError" ? "uazapi timeout sendPoll" : e.message };
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
    const res = await fetchWithTimeout(`${trimUrl(cfg.url)}/message/presence`, {
      method: "POST",
      headers: instanceHeaders(cfg.token),
      body: JSON.stringify(body),
    }, 10_000);
    if (res.ok) {
      console.log(`[uazapi] presence ${presence} OK → ${phone}${delayMs ? ` (delay=${delayMs}ms)` : ""}`);
    } else {
      const txt = (await res.text()).substring(0, 200);
      console.warn(`[uazapi] presence ${presence} FAIL ${res.status}: ${txt}`);
    }
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

// Nova regra de digitação:
//  - 0,06s (60ms) por caractere
//  - a cada bloco completo de 300 caracteres, uma pausa de 1s no meio do bloco
export function calcTypingDuration(messageLength: number): number {
  const len = Math.max(0, messageLength | 0);
  const typingMs = len * 60;
  const pauses = Math.floor(len / 300);
  return typingMs + pauses * 1000;
}

export function calcTypingSegments(messageLength: number): { typingMs: number; pauseAfterMs: number }[] {
  const len = Math.max(0, messageLength | 0);
  const totalTyping = len * 60;
  const pauses = Math.floor(len / 300);
  const segCount = pauses + 1;
  if (totalTyping <= 0) return [{ typingMs: 500, pauseAfterMs: 0 }];
  const perSeg = Math.max(300, Math.floor(totalTyping / segCount));
  const segs: { typingMs: number; pauseAfterMs: number }[] = [];
  for (let i = 0; i < segCount; i++) {
    segs.push({ typingMs: perSeg, pauseAfterMs: i < segCount - 1 ? 1000 : 0 });
  }
  return segs;
}

// Executa a sequência de "digitando" respeitando pausas a cada 300 caracteres.
// Não envia "available" (deixa isso a cargo do chamador, para permitir a v11 sequence).
export async function runTypingSegments(cfg: UazapiConfig, phone: string, messageLength: number): Promise<void> {
  const segs = calcTypingSegments(messageLength);
  for (let i = 0; i < segs.length; i++) {
    const { typingMs, pauseAfterMs } = segs[i];
    // sendPresenceComposing já aguarda `typingMs` localmente após enviar o status
    await sendPresenceComposing(cfg, phone, typingMs);
    if (pauseAfterMs > 0) {
      // Sai do estado "digitando" durante a pausa
      try { await sendPresence(cfg, phone, "paused"); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, pauseAfterMs));
    }
  }
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

// Retorna apenas os telefones (só dígitos) dos participantes marcados como
// admin/superadmin do grupo. Usado para decidir a posse (ownership) de um
// grupo com base em quem de fato administra ele, em vez de "quem processou
// primeiro" — evita o caso de dois tenants com número no mesmo grupo.
export async function getGroupAdmins(cfg: UazapiConfig, groupJid: string): Promise<string[]> {
  try {
    const res = await fetch(`${trimUrl(cfg.url)}/group/info`, {
      method: "POST",
      headers: instanceHeaders(cfg.token),
      body: JSON.stringify({ groupjid: groupJid }),
    });
    const data = await res.json().catch(() => null);
    const participants = data?.participants || data?.group?.participants || data?.Participants || [];
    const admins: string[] = [];
    for (const p of participants) {
      if (typeof p !== "object" || !p) continue;
      const isAdmin = !!(p.IsAdmin || p.isAdmin || p.admin || p.IsSuperAdmin || p.isSuperAdmin || p.superAdmin);
      if (!isAdmin) continue;
      const raw = p.PhoneNumber || p.phoneNumber || p.phone || p.id || p.JID || p.jid || "";
      const digits = String(raw).split("@")[0].replace(/\D/g, "");
      if (digits) admins.push(digits);
    }
    return admins;
  } catch (e: any) {
    console.warn(`[uazapi] getGroupAdmins error: ${e.message}`);
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

// ============ Etiquetas e arquivamento ============

export interface UazapiLabel { id?: string; labelid?: string; name?: string; color?: number }

function friendlyLabelError(err?: string): string {
  const e = err || "erro desconhecido";
  if (/business/i.test(e)) return `conta não é WhatsApp Business (${e})`;
  return e;
}

const LABEL_TIMEOUT_MS = 30_000;
const RETRY_WAIT_MS = 3_000;

function isRetryable(err?: string): boolean {
  return !!err && /abort|timeout|websocket not connected/i.test(err);
}

// Faz a chamada com timeout de 30s e 1 retry (espera 3s) em timeout ou "websocket not connected".
// Loga status e corpo resumido (nunca o token) quando logTag é informado.
async function callWithRetry(
  cfg: UazapiConfig, path: string, init: { method: string; body?: unknown }, logTag?: string,
): Promise<{ success: boolean; data?: any; error?: string }> {
  let last: { success: boolean; data?: any; error?: string } = { success: false, error: "sem tentativa" };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetchWithTimeout(`${trimUrl(cfg.url)}${path}`, {
        method: init.method,
        headers: instanceHeaders(cfg.token),
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      }, LABEL_TIMEOUT_MS);
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }
      if (logTag) console.log(`[uazapi ${logTag}] tentativa ${attempt} status=${res.status} body=${(text || "").replace(/\s+/g, " ").substring(0, 500)}`);
      if (res.ok) return { success: true, data };
      last = { success: false, error: `uazapi ${res.status}: ${(text || res.statusText).replace(/\s+/g, " ").substring(0, 300)}` };
    } catch (e: any) {
      const msg = e?.name === "AbortError" || /abort/i.test(e?.message || "") ? `timeout ${LABEL_TIMEOUT_MS / 1000}s em ${path}` : (e?.message || String(e));
      if (logTag) console.log(`[uazapi ${logTag}] tentativa ${attempt} erro=${msg}`);
      last = { success: false, error: msg };
    }
    if (attempt === 1 && isRetryable(last.error)) { await new Promise((r) => setTimeout(r, RETRY_WAIT_MS)); continue; }
    break;
  }
  return last;
}

export async function listLabels(cfg: UazapiConfig): Promise<{ success: boolean; labels: UazapiLabel[]; error?: string }> {
  const r = await callWithRetry(cfg, "/labels", { method: "GET" }, "GET /labels");
  if (!r.success) return { success: false, labels: [], error: friendlyLabelError(r.error) };
  const d = r.data;
  const labels = Array.isArray(d) ? d : (d?.labels || d?.data || []);
  return { success: true, labels };
}

function labelRef(l: UazapiLabel): string | undefined {
  return (l.labelid || l.id) ? String(l.labelid || l.id) : undefined;
}

// Retorna o id da etiqueta com o nome informado, criando-a se não existir.
export async function ensureLabel(cfg: UazapiConfig, name: string): Promise<{ labelId?: string; error?: string }> {
  const find = (labels: UazapiLabel[]) =>
    labels.find((l) => (l.name || "").trim().toLowerCase() === name.trim().toLowerCase());
  const first = await listLabels(cfg);
  if (!first.success) return { error: first.error };
  const existing = find(first.labels);
  if (existing && labelRef(existing)) return { labelId: labelRef(existing) };
  const created = await callWithRetry(cfg, "/label/edit", { method: "POST", body: { labelid: "new", name, color: 1, delete: false } }, "POST /label/edit");
  if (!created.success) return { error: friendlyLabelError(created.error) };
  const again = await listLabels(cfg);
  const found = again.success ? find(again.labels) : undefined;
  if (found && labelRef(found)) return { labelId: labelRef(found) };
  return { error: again.error || `etiqueta "${name}" criada mas não encontrada em /labels` };
}

export async function addChatLabel(cfg: UazapiConfig, phone: string, labelId: string): Promise<{ success: boolean; error?: string }> {
  const r = await callWithRetry(cfg, "/chat/labels", { method: "POST", body: { number: phone, add_labelid: labelId } }, "POST /chat/labels");
  return r.success ? { success: true } : { success: false, error: friendlyLabelError(r.error) };
}

export async function archiveChat(cfg: UazapiConfig, phone: string, archive = true): Promise<{ success: boolean; error?: string }> {
  const r = await callWithRetry(cfg, "/chat/archive", { method: "POST", body: { number: phone, archive } });
  return r.success ? { success: true } : { success: false, error: r.error };
}

// Variantes de número BR com/sem nono dígito.
export function brPhoneVariants(phone: string): string[] {
  const d = phone.replace(/\D/g, "");
  const out = [d];
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") out.push(d.slice(0, 4) + d.slice(5));
  else if (d.startsWith("55") && d.length === 12) out.push(d.slice(0, 4) + "9" + d.slice(4));
  return out;
}

export interface UazapiChatState { found: boolean; chatid?: string; archived?: boolean; labels?: unknown; raw?: any; error?: string }

// POST /chat/find — consulta estado real do chat (só leitura), testando variantes com/sem 9.
export async function findChat(cfg: UazapiConfig, phone: string): Promise<UazapiChatState> {
  let lastErr: string | undefined;
  for (const v of brPhoneVariants(phone)) {
    const r = await callWithRetry(cfg, "/chat/find", {
      method: "POST",
      body: { operator: "AND", sort: "-wa_lastMsgTimestamp", limit: 5, offset: 0, wa_chatid: `${v}@s.whatsapp.net` },
    }, "POST /chat/find");
    if (!r.success) { lastErr = r.error; continue; }
    const chats = Array.isArray(r.data) ? r.data : (r.data?.chats || r.data?.data || []);
    const c = chats.find((x: any) => String(x?.wa_chatid || "").startsWith(v + "@")) || chats[0];
    if (c) {
      return {
        found: true,
        chatid: c.wa_chatid,
        archived: c.wa_archived === true || c.wa_archived === "true",
        labels: c.wa_label ?? c.labels ?? null,
        raw: {
          wa_chatid: c.wa_chatid, wa_archived: c.wa_archived, wa_label: c.wa_label, wa_name: c.wa_name ?? c.name,
          wa_lastMsgTimestamp: c.wa_lastMsgTimestamp, wa_isGroup: c.wa_isGroup, phone: c.phone,
        },
      };
    }
  }
  return { found: false, error: lastErr };
}
