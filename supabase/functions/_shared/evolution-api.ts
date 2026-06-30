// ⚠️ COMPATIBILITY SHIM — evolution-api.ts foi substituído pela uazapi.
// Para minimizar diff nos senders, mantemos as mesmas assinaturas. O parâmetro
// `instanceName` agora deve receber a string `"<url>|<token>"` (URL e token da
// uazapi separados por pipe). Cada sender deve montar essa string a partir das
// colunas `uazapi_url` e `uazapi_token` da tabela `integration_whatsapp`.
//
// Exemplo:
//   const instanceName = `${integration.uazapi_url}|${integration.uazapi_token}`;
//   await sendText(instanceName, phone, "Olá");

import {
  sendText as uazSendText,
  sendImage as uazSendImage,
  sendDocument as uazSendDocument,
  sendAudio as uazSendAudio,
  sendVideo as uazSendVideo,
  sendButton as uazSendButton,
  sendLinkMessage as uazSendLinkMessage,
  sendPresenceAvailable as uazSendPresenceAvailable,
  sendPresenceComposing as uazSendPresenceComposing,
  getGroupParticipants as uazGetGroupParticipants,
  getInstanceStatus as uazGetInstanceStatus,
  connectInstance as uazConnectInstance,
  disconnectInstance as uazDisconnectInstance,
  calcTypingDuration as uazCalcTypingDuration,
  getRandomReactionEmoji as uazGetRandomReactionEmoji,
  type UazapiConfig,
} from "./uazapi-api.ts";

function parseCfg(instanceName: string): UazapiConfig | null {
  if (!instanceName || !instanceName.includes("|")) return null;
  const [url, token] = instanceName.split("|");
  if (!url || !token) return null;
  return { url, token };
}

function noCfgError(fn: string): { success: false; error: string } {
  return { success: false, error: `[evolution-shim] ${fn}: instanceName deve ser "<url>|<token>" da uazapi` };
}

export async function sendText(instanceName: string, phone: string, message: string) {
  const cfg = parseCfg(instanceName);
  if (!cfg) return noCfgError("sendText");
  return uazSendText(cfg, phone, message);
}

export async function sendButton(
  instanceName: string,
  phone: string,
  message: string,
  buttonLabel: string,
  buttonUrl: string,
  _title?: string,
  _footer?: string,
) {
  const cfg = parseCfg(instanceName);
  if (!cfg) return noCfgError("sendButton");
  return uazSendButton(cfg, phone, message, buttonLabel, buttonUrl, _footer);
}

export async function sendImage(instanceName: string, phone: string, imageUrl: string, caption?: string) {
  const cfg = parseCfg(instanceName);
  if (!cfg) return noCfgError("sendImage");
  return uazSendImage(cfg, phone, imageUrl, caption);
}

export async function sendImageByUrl(instanceName: string, phone: string, imageUrl: string, caption?: string) {
  return sendImage(instanceName, phone, imageUrl, caption);
}

export async function sendAudio(instanceName: string, phone: string, audioUrl: string) {
  const cfg = parseCfg(instanceName);
  if (!cfg) return noCfgError("sendAudio");
  return uazSendAudio(cfg, phone, audioUrl);
}

export async function sendVideo(instanceName: string, phone: string, videoUrl: string, caption?: string) {
  const cfg = parseCfg(instanceName);
  if (!cfg) return noCfgError("sendVideo");
  return uazSendVideo(cfg, phone, videoUrl, caption);
}

export async function sendDocument(instanceName: string, phone: string, documentUrl: string, fileName = "documento.pdf") {
  const cfg = parseCfg(instanceName);
  if (!cfg) return noCfgError("sendDocument");
  return uazSendDocument(cfg, phone, documentUrl, fileName);
}

export async function sendPresenceComposing(instanceName: string, phone: string, durationMs?: number): Promise<void> {
  const cfg = parseCfg(instanceName);
  if (!cfg) return;
  await uazSendPresenceComposing(cfg, phone, durationMs);
}

export async function sendPresenceAvailable(instanceName: string, phone: string): Promise<void> {
  const cfg = parseCfg(instanceName);
  if (!cfg) return;
  await uazSendPresenceAvailable(cfg, phone);
}

export function calcTypingDuration(messageLength: number): number {
  return uazCalcTypingDuration(messageLength);
}

export async function markMessageAsRead(_instanceName: string, _phone: string, _messageId: string): Promise<void> {
  // Não implementado na shim. Sem-op.
}

export async function sendReaction(_instanceName: string, _phone: string, _messageId: string, _emoji: string): Promise<void> {
  // Não implementado na shim. Sem-op.
}

export function getRandomReactionEmoji(): string {
  return uazGetRandomReactionEmoji();
}

export async function checkPhone(_instanceName: string, phone: string): Promise<string> {
  return phone;
}

export async function getGroupParticipants(instanceName: string, groupJid: string): Promise<string[]> {
  const cfg = parseCfg(instanceName);
  if (!cfg) return [];
  return uazGetGroupParticipants(cfg, groupJid);
}

export async function createInstance(_instanceName: string): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: "Use uazapi-instance-manager (action: init_instance)" };
}

export async function getQRCode(instanceName: string): Promise<{ qrcode?: string; error?: string }> {
  const cfg = parseCfg(instanceName);
  if (!cfg) return { error: "instanceName inválido — use uazapi" };
  const r = await uazConnectInstance(cfg);
  return { qrcode: r.qrcode, error: r.error };
}

export async function getInstanceStatus(instanceName: string): Promise<{ connected: boolean; status?: string; user?: { phone?: string } }> {
  const cfg = parseCfg(instanceName);
  if (!cfg) return { connected: false };
  return uazGetInstanceStatus(cfg);
}

export async function deleteInstance(instanceName: string): Promise<{ success: boolean; error?: string }> {
  const cfg = parseCfg(instanceName);
  if (!cfg) return { success: false, error: "instanceName inválido" };
  return uazDisconnectInstance(cfg);
}
