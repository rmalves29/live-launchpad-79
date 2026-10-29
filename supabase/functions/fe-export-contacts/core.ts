// Lógica pura da exportação de contatos (testável sem rede).
export const normPhone = (raw?: string | null): string => {
  const d = String(raw || "").split("@")[0].split(":")[0].replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
};

export const isJoin = (t: string) => /^(join|add|entr)/i.test(t || "");
export const isLeave = (t: string) => /^(leave|remove|left|sai|exit)/i.test(t || "");

export interface Ev { phone: string | null; event_type: string; created_at: string | null; group_jid: string | null; group_id: string | null; campaign_id: string | null }
export interface Filters { status?: "todos" | "no_grupo" | "saiu" | "nao_verificado"; group_ids?: string[]; campaign_id?: string; date_from?: string; date_to?: string }

export function eventMatches(e: Ev, f: Filters, groupJidById: Map<string, string>): boolean {
  if (f.campaign_id && e.campaign_id !== f.campaign_id) return false;
  if (f.group_ids?.length) {
    const jids = new Set(f.group_ids.map((id) => groupJidById.get(id)).filter(Boolean));
    if (!(e.group_id && f.group_ids.includes(e.group_id)) && !(e.group_jid && jids.has(e.group_jid))) return false;
  }
  const t = e.created_at ? Date.parse(e.created_at) : NaN;
  if (f.date_from && !(t >= Date.parse(`${f.date_from}T00:00:00-03:00`))) return false;
  if (f.date_to && !(t <= Date.parse(`${f.date_to}T23:59:59.999-03:00`))) return false;
  return true;
}

export const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (header: string[], rows: unknown[][]) =>
  "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");

export const fmtBr = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) - 3 * 3600_000);
  return d.toISOString().slice(0, 19).replace("T", " ");
};

export interface ConsolidateInput {
  members: Map<string, Set<string>>; // phone -> group names (atuais)
  events: Ev[]; // já filtrados
  groupNameByJid: Map<string, string>;
  groupNameById: Map<string, string>;
  campaignName: Map<string, string>;
  filters: Filters;
  eventFilterActive: boolean;
  membershipEvents?: Ev[]; // histórico completo, não limitado por data/campanha
  failedGroupJids?: Set<string>;
  groupJidById?: Map<string, string>;
}

export const CONTACT_HEADER = ["telefone", "status", "grupos_atuais", "primeira_entrada", "ultima_entrada", "ultima_saida", "total_entradas", "total_saidas", "campanha_de_entrada", "grupos_historico"];

export function consolidate(inp: ConsolidateInput) {
  const latest = new Map<string, Map<string, Ev>>();
  for (const event of inp.membershipEvents ?? inp.events) {
    const phone = normPhone(event.phone);
    const jid = event.group_jid || (event.group_id && inp.groupJidById?.get(event.group_id));
    if (!phone || !jid || !event.created_at || (!isJoin(event.event_type) && !isLeave(event.event_type))) continue;
    let groups = latest.get(phone);
    if (!groups) { groups = new Map(); latest.set(phone, groups); }
    const previous = groups.get(jid);
    if (!previous?.created_at || Date.parse(event.created_at) >= Date.parse(previous.created_at)) groups.set(jid, event);
  }
  type Row = { phone: string; joins: string[]; leaves: string[]; hist: Set<string>; firstCampaign?: { at: string; id: string } };
  const map = new Map<string, Row>();
  const get = (p: string) => { let r = map.get(p); if (!r) { r = { phone: p, joins: [], leaves: [], hist: new Set() }; map.set(p, r); } return r; };
  for (const e of inp.events) {
    const p = normPhone(e.phone);
    if (!p || !e.created_at) continue;
    const r = get(p);
    const gname = (e.group_jid && inp.groupNameByJid.get(e.group_jid)) || (e.group_id && inp.groupNameById.get(e.group_id)) || e.group_jid || "";
    if (gname) r.hist.add(gname);
    if (isJoin(e.event_type)) {
      r.joins.push(e.created_at);
      if (e.campaign_id && (!r.firstCampaign || e.created_at < r.firstCampaign.at)) r.firstCampaign = { at: e.created_at, id: e.campaign_id };
    } else if (isLeave(e.event_type)) r.leaves.push(e.created_at);
  }
  if (!inp.eventFilterActive) for (const p of inp.members.keys()) get(p);

  const rows: unknown[][] = [];
  let no_grupo = 0, saiu = 0, nao_verificado = 0;
  for (const r of map.values()) {
    const cur = inp.members.get(r.phone);
    const inGroup = !!cur && cur.size > 0;
    const unknown = !inGroup && [...(latest.get(r.phone)?.entries() ?? [])].some(([jid, event]) => inp.failedGroupJids?.has(jid) && isJoin(event.event_type));
    const status = inGroup ? "no_grupo" : unknown ? "nao_verificado" : "saiu";
    if (inp.filters.status && inp.filters.status !== "todos" && inp.filters.status !== status) continue;
    if (inGroup) no_grupo++; else if (unknown) nao_verificado++; else saiu++;
    cur?.forEach((g) => r.hist.add(g));
    const j = [...r.joins].sort(), l = [...r.leaves].sort();
    rows.push([
      r.phone, inGroup ? "no grupo" : unknown ? "não verificado" : "saiu", cur ? [...cur].join("; ") : "",
      fmtBr(j[0]), fmtBr(j[j.length - 1]), fmtBr(l[l.length - 1]), j.length, l.length,
      r.firstCampaign ? inp.campaignName.get(r.firstCampaign.id) || "" : "", [...r.hist].join("; "),
    ]);
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return { rows, no_grupo, saiu, nao_verificado };
}
