// Acesso à UazAPI para o sorteio: participantes de UM grupo por vez (grupos grandes demoram) e foto/nome do ganhador.
// Resposta sem participantes nunca é tratada como grupo vazio.
import { extractParticipants } from "../fe-export-contacts/uazapi.ts";

export class GroupNotFound extends Error {}

export function createUazapiClient(cfg: { uazapi_url: string; uazapi_token: string }, fetcher: typeof fetch = fetch) {
  const base = cfg.uazapi_url.replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json", token: cfg.uazapi_token };
  const request = async (path: string, body: unknown, ms: number) => {
    const response = await fetcher(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
    const text = await response.text();
    if (!response.ok) {
      const safe = text.split(cfg.uazapi_token).join("[REDACTED]").slice(0, 160);
      if (/does not exist|not found|n[aã]o existe/i.test(safe)) throw new GroupNotFound(safe);
      throw new Error(`uazapi ${response.status}: ${safe}`);
    }
    return JSON.parse(text);
  };

  const groupMembers = async (jid: string, ms = 100_000): Promise<unknown[]> => {
    const data = await request("/group/info", { groupjid: jid }, ms);
    const participants = extractParticipants(data);
    if (!participants) throw new Error("uazapi: resposta sem participantes");
    return participants;
  };

  // Foto e nome do WhatsApp de um número (para mostrar o ganhador). Nunca lança erro.
  const contact = async (phone: string): Promise<{ image: string | null; name: string }> => {
    try {
      const d = await request("/chat/details", { number: phone }, 15_000);
      const image = d?.image || d?.imagePreview || null;
      const name = String(d?.wa_contactName || d?.wa_name || d?.name || d?.lead_name || "").trim();
      return { image, name };
    } catch {
      return { image: null, name: "" };
    }
  };

  return { groupMembers, contact };
}
