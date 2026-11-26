// Participantes dos grupos na UazAPI para o sorteio.
// Grupos grandes (400+ pessoas) demoram para responder no /group/info; por isso primeiro busca a lista de
// TODOS os grupos de uma vez (/group/list, que já traz os participantes) e só consulta um a um os que faltarem.
// Resposta sem participantes nunca é tratada como grupo vazio: o grupo fica como "não lido".
import { extractParticipants } from "../fe-export-contacts/uazapi.ts";

type JsonObject = Record<string, unknown>;
const object = (v: unknown): JsonObject | undefined => v && typeof v === "object" && !Array.isArray(v) ? v as JsonObject : undefined;

export function createUazapiGroupReader(cfg: { uazapi_url: string; uazapi_token: string }, fetcher: typeof fetch = fetch) {
  const base = cfg.uazapi_url.replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json", token: cfg.uazapi_token };
  const request = async (path: string, init: RequestInit, ms: number) => {
    const response = await fetcher(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(ms) });
    const text = await response.text();
    if (!response.ok) throw new Error(`uazapi ${response.status}: ${text.split(cfg.uazapi_token).join("[REDACTED]").slice(0, 120)}`);
    return JSON.parse(text);
  };

  // jid -> participantes, a partir da lista geral
  const listAll = async (): Promise<Map<string, unknown[]>> => {
    const map = new Map<string, unknown[]>();
    try {
      const d = await request("/group/list", { method: "GET" }, 90_000);
      const groups = Array.isArray(d) ? d : (d?.groups ?? d?.data);
      if (Array.isArray(groups)) {
        for (const value of groups) {
          const g = object(value);
          if (!g) continue;
          const participants = extractParticipants(g);
          if (!participants) continue;
          for (const jid of [g.JID, g.jid, g.id, g.groupjid, g.group_jid]) if (typeof jid === "string") map.set(jid, participants);
        }
      }
    } catch (e) { console.warn(`[sorteio-grupos] lista geral indisponível: ${String(e)}`); }
    return map;
  };

  const info = async (jid: string): Promise<unknown[]> => {
    const data = await request("/group/info", { method: "POST", body: JSON.stringify({ groupjid: jid }) }, 40_000);
    const participants = extractParticipants(data);
    if (!participants) throw new Error("uazapi: resposta sem participantes");
    return participants;
  };

  return { listAll, info };
}
