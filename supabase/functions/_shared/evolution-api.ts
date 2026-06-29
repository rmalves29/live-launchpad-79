const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

function getHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY };
}

function evoUrl(path: string): string {
  return EVOLUTION_API_URL.replace(/\/+$/, "") + path;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 25_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readEvolutionResult(res: Response): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const text = await res.text();
  let data: any = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (res.ok) {
    return {
      success: true,
      messageId: data?.key?.id || data?.message?.key?.id || data?.id,
    };
  }

  const body = data ? JSON.stringify(data) : text.replace(/\s+/g, " ").trim();
  const snippet = (body || res.statusText || "sem resposta").substring(0, 300);
  return { success: false, error: `Evolution ${res.status}: ${snippet}` };
}

async function loadMediaPayload(mediaUrl: string, fallbackFileName: string): Promise<{ media: string; mimetype: string; fileName: string }> {
  if (!/^https?:\/\//i.test(mediaUrl)) {
    return { media: mediaUrl, mimetype: "image/jpeg", fileName: fallbackFileName };
  }

  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar mídia ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return {
    media: btoa(binary),
    mimetype: contentType,
    fileName: fallbackFileName.replace(/\.[a-z0-9]+$/i, "") + "." + extension,
  };
}

export async function sendText(instanceName: string, phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const res = await fetchWithTimeout(evoUrl("/message/sendText/" + instanceName), { method: "POST", headers: getHeaders(), body: JSON.stringify({ number: phone, text: message }) }, 90_000);
    return await readEvolutionResult(res);
  } catch (e: any) { return { success: false, error: e.name === "AbortError" ? "Evolution timeout ao enviar texto" : e.message }; }
}

export async function sendButton(
  instanceName: string,
  phone: string,
  message: string,
  buttonLabel: string,
  buttonUrl: string,
  title?: string,
  footer?: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const payload: Record<string, unknown> = {
      number: phone,
      title: title || "",
      description: message,
      footer: footer || "",
      buttons: [
        {
          type: "url",
          displayText: (buttonLabel || "Pagar Agora").slice(0, 20),
          url: buttonUrl,
        },
      ],
    };
    const res = await fetchWithTimeout(
      evoUrl("/message/sendButtons/" + instanceName),
      { method: "POST", headers: getHeaders(), body: JSON.stringify(payload) },
      60_000,
    );
    return await readEvolutionResult(res);
  } catch (e: any) {
    return { success: false, error: e.name === "AbortError" ? "Evolution timeout ao enviar botão" : e.message };
  }
}


export async function sendImage(instanceName: string, phone: string, imageUrl: string, caption?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const mediaPayload = await loadMediaPayload(imageUrl, "produto.jpg");
    const res = await fetchWithTimeout(evoUrl("/message/sendMedia/" + instanceName), { method: "POST", headers: getHeaders(), body: JSON.stringify({ number: phone, mediatype: "image", ...mediaPayload, caption: caption || "" }) }, 60_000);
    return await readEvolutionResult(res);
  } catch (e: any) { return { success: false, error: e.name === "AbortError" ? "Evolution timeout ao enviar imagem" : e.message }; }
}

export async function sendImageByUrl(instanceName: string, phone: string, imageUrl: string, caption?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const res = await fetchWithTimeout(evoUrl("/message/sendMedia/" + instanceName), {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ number: phone, mediatype: "image", mimetype: "image/jpeg", media: imageUrl, caption: caption || "" }),
    }, 60_000);
    return await readEvolutionResult(res);
  } catch (e: any) { return { success: false, error: e.name === "AbortError" ? "Evolution timeout ao enviar imagem por URL" : e.message }; }
}

export async function sendAudio(instanceName: string, phone: string, audioUrl: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const res = await fetchWithTimeout(evoUrl("/message/sendMedia/" + instanceName), { method: "POST", headers: getHeaders(), body: JSON.stringify({ number: phone, mediatype: "audio", media: audioUrl }) });
    return await readEvolutionResult(res);
  } catch (e: any) { return { success: false, error: e.name === "AbortError" ? "Evolution timeout ao enviar áudio" : e.message }; }
}

export async function sendVideo(instanceName: string, phone: string, videoUrl: string, caption?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const res = await fetchWithTimeout(evoUrl("/message/sendMedia/" + instanceName), { method: "POST", headers: getHeaders(), body: JSON.stringify({ number: phone, mediatype: "video", media: videoUrl, caption: caption || "" }) });
    return await readEvolutionResult(res);
  } catch (e: any) { return { success: false, error: e.name === "AbortError" ? "Evolution timeout ao enviar vídeo" : e.message }; }
}

export async function sendDocument(instanceName: string, phone: string, documentUrl: string, fileName = "documento.pdf"): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const res = await fetchWithTimeout(evoUrl("/message/sendMedia/" + instanceName), { method: "POST", headers: getHeaders(), body: JSON.stringify({ number: phone, mediatype: "document", media: documentUrl, fileName }) });
    return await readEvolutionResult(res);
  } catch (e: any) { return { success: false, error: e.name === "AbortError" ? "Evolution timeout ao enviar documento" : e.message }; }
}

export async function sendPresenceComposing(instanceName: string, phone: string, durationMs?: number): Promise<void> {
  try {
    const wait = durationMs || 3000;
    await fetch(evoUrl("/chat/sendPresence/" + instanceName), { method: "POST", headers: getHeaders(), body: JSON.stringify({ number: phone, options: { presence: "composing", delay: wait } }) });
    await new Promise((r) => setTimeout(r, wait));
  } catch (e: any) { console.warn("[evolution] sendPresenceComposing error: " + e.message); }
}

export function calcTypingDuration(messageLength: number): number {
  const base = (messageLength / 40) * 1000;
  const multiplier = 0.5 + Math.random();
  return Math.min(Math.max(base * multiplier, 2000), 8000);
}

export async function sendPresenceAvailable(instanceName: string, phone: string): Promise<void> {
  try {
    await fetch(evoUrl("/chat/sendPresence/" + instanceName), { method: "POST", headers: getHeaders(), body: JSON.stringify({ number: phone, options: { presence: "available" } }) });
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
  } catch (e: any) { console.warn("[evolution] sendPresenceAvailable error: " + e.message); }
}

export async function markMessageAsRead(instanceName: string, phone: string, messageId: string): Promise<void> {
  try {
    await fetch(evoUrl("/chat/markMessageAsRead/" + instanceName), { method: "POST", headers: getHeaders(), body: JSON.stringify({ readMessages: [{ remoteJid: phone, id: messageId, fromMe: false }] }) });
  } catch (e: any) { console.warn("[evolution] markMessageAsRead error: " + e.message); }
}

export async function sendReaction(instanceName: string, phone: string, messageId: string, emoji: string): Promise<void> {
  try {
    await fetch(evoUrl("/message/sendReaction/" + instanceName), { method: "POST", headers: getHeaders(), body: JSON.stringify({ key: { remoteJid: phone, id: messageId, fromMe: false }, reaction: emoji }) });
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
  } catch (e: any) { console.warn("[evolution] sendReaction error: " + e.message); }
}

const REACTION_EMOJIS = ["❤️", "🔥", "😍", "👏", "🛍️", "💜", "😱", "🤩", "👀", "💯"];
export function getRandomReactionEmoji(): string { return REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)]; }

export async function checkPhone(instanceName: string, phone: string): Promise<string> {
  try {
    const res = await fetch(evoUrl("/chat/whatsappNumbers/" + instanceName), { method: "POST", headers: getHeaders(), body: JSON.stringify({ numbers: [phone] }) });
    const data = await res.json();
    const result = Array.isArray(data) ? data[0] : null;
    if (result?.exists && result?.jid) return result.jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
    return phone;
  } catch (e: any) { console.warn("[evolution] checkPhone error: " + e.message); return phone; }
}

export async function getGroupParticipants(instanceName: string, groupJid: string): Promise<string[]> {
  try {
    const res = await fetch(evoUrl("/group/findGroupInfos/" + instanceName + "?groupJid=" + groupJid), { method: "GET", headers: getHeaders() });
    const data = await res.json();
    return (data?.participants || []).map((p: any) => p.id || p);
  } catch (e: any) { console.warn("[evolution] getGroupParticipants error: " + e.message); return []; }
}

export async function createInstance(instanceName: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(evoUrl("/instance/create"), { method: "POST", headers: getHeaders(), body: JSON.stringify({ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true }) });
    const data = await res.json();
    if (res.ok) return { success: true };
    return { success: false, error: JSON.stringify(data).substring(0, 200) };
  } catch (e: any) { return { success: false, error: e.message }; }
}

export async function getQRCode(instanceName: string): Promise<{ qrcode?: string; error?: string }> {
  try {
    const res = await fetch(evoUrl("/instance/connect/" + instanceName), { method: "GET", headers: getHeaders() });
    const data = await res.json();
    if (res.ok) return { qrcode: data?.base64 || data?.qrcode?.base64 };
    return { error: JSON.stringify(data).substring(0, 200) };
  } catch (e: any) { return { error: e.message }; }
}

export async function getInstanceStatus(instanceName: string): Promise<{ connected: boolean; status?: string; user?: { phone?: string } }> {
  try {
    const res = await fetch(evoUrl("/instance/fetchInstances?instanceName=" + instanceName), { method: "GET", headers: getHeaders() });
    const data = await res.json();
    const instance = Array.isArray(data) ? data[0] : data;
    const state = instance?.instance?.state || instance?.connectionStatus || instance?.state || "";
    const connected = state === "open";
    const ownerJid = instance?.instance?.ownerJid || instance?.ownerJid || "";
    const phone = ownerJid ? ownerJid.replace("@s.whatsapp.net", "").replace("@c.us", "") : undefined;
    return { connected, status: state, user: phone ? { phone } : undefined };
  } catch (e: any) { return { connected: false }; }
}

export async function deleteInstance(instanceName: string): Promise<{ success: boolean; error?: string }> {
  try {
    await fetch(evoUrl("/instance/logout/" + instanceName), { method: "DELETE", headers: getHeaders() });
    const res = await fetch(evoUrl("/instance/delete/" + instanceName), { method: "DELETE", headers: getHeaders() });
    if (res.ok) return { success: true };
    return { success: false, error: "Erro ao deletar instancia" };
  } catch (e: any) { return { success: false, error: e.message }; }
}