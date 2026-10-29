type JsonObject = Record<string, unknown>;
const object = (v: unknown): JsonObject | undefined => v && typeof v === "object" && !Array.isArray(v) ? v as JsonObject : undefined;

export function extractParticipants(value: unknown): unknown[] | undefined {
  const root = object(value);
  if (!root) return undefined;
  for (const node of [root, object(root.group), object(root.Group), object(root.data)]) {
    if (!node) continue;
    const participants = node.Participants ?? node.participants;
    if (Array.isArray(participants)) return participants;
  }
  // Missing participant data must never mean an empty group.
  return undefined;
}

export function createUazapiMembers(cfg: { uazapi_url: string; uazapi_token: string }, fetcher: typeof fetch = fetch) {
  const base = cfg.uazapi_url.replace(/\/+$/, "");
  const headers = { "Content-Type": "application/json", token: cfg.uazapi_token };
  let listing: Promise<unknown[]> | undefined;
  const request = async (path: string, init: RequestInit) => {
    const response = await fetcher(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    if (!response.ok) {
      const safeBody = text.split(cfg.uazapi_token).join("[REDACTED]");
      console.warn(`[fe-export-contacts] uazapi ${path} ${response.status}: ${safeBody}`);
      throw new Error(`uazapi ${response.status}: ${safeBody}`);
    }
    return JSON.parse(text);
  };
  const list = () => listing ??= request("/group/list", { method: "GET" }).then((d) => {
    const groups = Array.isArray(d) ? d : d.groups ?? d.data;
    if (!Array.isArray(groups)) throw new Error("uazapi: liste de groupes indisponible".replace("liste de groupes", "lista de grupos"));
    return groups;
  });
  return async (jid: string): Promise<unknown[]> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const data = await request("/group/info", {
          method: "POST", body: JSON.stringify(attempt ? { groupjid: jid, getInviteLink: false, force: true } : { groupjid: jid }),
        });
        const participants = extractParticipants(data);
        if (participants) return participants;
        throw new Error("uazapi: resposta sem participantes");
      } catch (error) { lastError = error; }
    }
    try {
      const groups = await list();
      const group = groups.find((value) => {
        const g = object(value);
        return g && [g.JID, g.jid, g.id, g.groupjid, g.group_jid].includes(jid);
      });
      const participants = extractParticipants(group);
      if (participants) return participants;
    } catch (error) { console.warn(`[fe-export-contacts] fallback indisponível: ${String(error)}`); }
    throw lastError instanceof Error ? lastError : new Error("uazapi: grupo não verificado");
  };
}