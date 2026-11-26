// Leitura pura dos participantes de um grupo (UazAPI ou Z-API) para o sorteio. Testável sem rede.
// deno-lint-ignore-file no-explicit-any

export type Member = { phone: string; name: string; admin: boolean };

export const normPhone = (raw?: unknown): string => {
  const d = String(raw ?? "").split("@")[0].split(":")[0].replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
};

// Número do participante; participante só com LID (sem número) volta "".
export function participantPhone(p: any): string {
  if (typeof p === "string") return p.includes("@lid") ? "" : normPhone(p);
  for (const c of [p?.PhoneNumber, p?.phoneNumber, p?.phone, p?.JID, p?.jid, p?.id]) {
    if (c && !String(c).includes("@lid")) {
      const n = normPhone(c);
      if (n.length >= 12 && n.length <= 13) return n;
    }
  }
  return "";
}

export function participantIsAdmin(p: any): boolean {
  if (!p || typeof p !== "object") return false;
  return !!(p.IsAdmin || p.IsSuperAdmin || p.isAdmin || p.isSuperAdmin || p.admin === "admin" || p.admin === "superadmin");
}

export function participantName(p: any): string {
  if (!p || typeof p !== "object") return "";
  const n = p.DisplayName ?? p.displayName ?? p.PushName ?? p.pushName ?? p.name ?? p.Name ?? p.short ?? "";
  return String(n || "").trim().slice(0, 80);
}

export function toMembers(raw: unknown[]): { members: Member[]; semNumero: number } {
  const members: Member[] = [];
  let semNumero = 0;
  for (const p of raw) {
    const phone = participantPhone(p);
    if (!phone) { semNumero++; continue; }
    members.push({ phone, name: participantName(p), admin: participantIsAdmin(p) });
  }
  return { members, semNumero };
}

// Junta os grupos: quem está em mais de um grupo conta uma vez; tira admins, o número da loja e quem foi excluído.
export function buildPool(
  byGroup: Array<{ group: string; members: Member[] }>,
  opts: { storePhones: string[]; exclude: string[] },
) {
  const block = new Set([...opts.storePhones, ...opts.exclude].map(normPhone).filter(Boolean));
  const admins = new Set<string>();
  for (const g of byGroup) for (const m of g.members) if (m.admin) admins.add(m.phone);
  const pool = new Map<string, { phone: string; name: string; groups: string[] }>();
  for (const g of byGroup) {
    for (const m of g.members) {
      if (admins.has(m.phone) || block.has(m.phone)) continue;
      const cur = pool.get(m.phone);
      if (cur) { if (!cur.groups.includes(g.group)) cur.groups.push(g.group); if (!cur.name && m.name) cur.name = m.name; }
      else pool.set(m.phone, { phone: m.phone, name: m.name, groups: [g.group] });
    }
  }
  return { pool: Array.from(pool.values()), admins: admins.size };
}

// Sorteio com número aleatório seguro (sem viés de módulo).
export function secureIndex(n: number): number {
  if (n <= 0) throw new Error("sem participantes");
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

export function drawWinners<T>(pool: T[], count: number): T[] {
  const copy = pool.slice();
  const out: T[] = [];
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i++) out.push(copy.splice(secureIndex(copy.length), 1)[0]);
  return out;
}

const isJoin = (t: string) => /^(join|add|entr|promote|demote)/i.test(t || "");
const isLeave = (t: string) => /^(leave|remove|left|sai|exit)/i.test(t || "");

// Lista lida do grupo + entradas/saídas registradas DEPOIS da leitura = quem está no grupo agora.
// Eventos em ordem de data. Quem entrou depois da leitura entra como participante comum (não admin).
export function applyEvents(members: Member[], events: Array<{ phone: string | null; event_type: string }>): Member[] {
  const map = new Map(members.map((m) => [m.phone, m]));
  for (const e of events) {
    const phone = normPhone(e.phone);
    if (!phone) continue;
    if (isLeave(e.event_type)) map.delete(phone);
    else if (isJoin(e.event_type) && !map.has(phone)) map.set(phone, { phone, name: "", admin: false });
  }
  return Array.from(map.values());
}

// Variações do número brasileiro (com/sem 55, com/sem o 9 do celular) para achar a cliente no cadastro.
export function phoneVariants(phone: string): string[] {
  const p = normPhone(phone);
  const out = new Set<string>([p]);
  const local = p.startsWith("55") ? p.slice(2) : p;
  out.add(local);
  if (local.length === 10) { const with9 = local.slice(0, 2) + "9" + local.slice(2); out.add(with9); out.add("55" + with9); }
  if (local.length === 11 && local[2] === "9") { const sem9 = local.slice(0, 2) + local.slice(3); out.add(sem9); out.add("55" + sem9); }
  return Array.from(out);
}
