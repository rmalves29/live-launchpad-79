import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeTenantCaller, guardResponse } from "../_shared/auth-guard.ts";
import { createUazapiMembers } from "./uazapi.ts";
import { CONTACT_HEADER, consolidate, eventMatches, fmtBr, isJoin, normPhone, toCsv, type Ev, type Filters } from "./core.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, "Content-Type": "application/json" } });

async function parallelLimit<T>(items: T[], n: number, fn: (i: T) => Promise<void>) {
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (idx < items.length) await fn(items[idx++]); }));
}
async function fetchT(url: string, init: RequestInit, ms = 20000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); }
}
// Extrai número do participante; LID sem número retorna "".
function participantPhone(p: any): string {
  if (typeof p === "string") return p.includes("@lid") ? "" : normPhone(p);
  const cands = [p.PhoneNumber, p.phoneNumber, p.phone, p.JID, p.jid, p.id];
  for (const c of cands) { if (c && !String(c).includes("@lid")) { const n = normPhone(c); if (n.length >= 10 && n.length <= 13) return n; } }
  return "";
}

async function membersZapi(cfg: any, jid: string): Promise<any[]> {
  const base = `https://api.z-api.io/instances/${cfg.zapi_instance_id}/token/${cfg.zapi_token}`;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.zapi_client_token) h["Client-Token"] = cfg.zapi_client_token;
  let r = await fetchT(`${base}/group-metadata/${jid}`, { headers: h });
  if (!r.ok) r = await fetchT(`${base}/light-group-metadata/${jid}`, { headers: h });
  if (!r.ok) throw new Error(`Z-API ${r.status}`);
  const m = await r.json();
  return Array.isArray(m?.participants) ? m.participants : [];
}

async function allEvents(sb: any, tenant_id: string): Promise<Ev[]> {
  const out: Ev[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("fe_group_events").select("phone, event_type, created_at, group_jid, group_id, campaign_id").eq("tenant_id", tenant_id).order("created_at").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const tenant_id = body?.tenant_id;
    if (!tenant_id || typeof tenant_id !== "string") return json({ success: false, error: "tenant_id obrigatório" });
    const guard = await authorizeTenantCaller(req, sb, tenant_id);
    if (!guard.ok) return guardResponse(guard, cors);

    const f: Filters = {
      status: ["todos", "no_grupo", "saiu", "nao_verificado"].includes(body.status) ? body.status : "todos",
      group_ids: Array.isArray(body.group_ids) ? body.group_ids.filter((x: unknown) => typeof x === "string") : [],
      campaign_id: typeof body.campaign_id === "string" && body.campaign_id ? body.campaign_id : undefined,
      date_from: /^\d{4}-\d{2}-\d{2}$/.test(body.date_from || "") ? body.date_from : undefined,
      date_to: /^\d{4}-\d{2}-\d{2}$/.test(body.date_to || "") ? body.date_to : undefined,
    };
    const mode = body.mode === "movements" ? "movements" : "contacts";

    const [{ data: groups }, { data: camps }] = await Promise.all([
      sb.from("fe_groups").select("id, group_jid, group_name, is_active, is_admin").eq("tenant_id", tenant_id),
      sb.from("fe_campaigns").select("id, name").eq("tenant_id", tenant_id),
    ]);
    const groupNameByJid = new Map<string, string>(), groupNameById = new Map<string, string>(), groupJidById = new Map<string, string>();
    for (const g of groups || []) { groupNameByJid.set(g.group_jid, g.group_name); groupNameById.set(g.id, g.group_name); groupJidById.set(g.id, g.group_jid); }
    const campaignName = new Map<string, string>((camps || []).map((c: any) => [c.id, c.name]));

    const membershipEvents = await allEvents(sb, tenant_id);
    const events = membershipEvents.filter((e) => eventMatches(e, f, groupJidById));

    if (mode === "movements") {
      const rows = events.map((e) => [fmtBr(e.created_at), isJoin(e.event_type) ? "entrada" : "saida", normPhone(e.phone),
        (e.group_jid && groupNameByJid.get(e.group_jid)) || (e.group_id && groupNameById.get(e.group_id)) || e.group_jid || "",
        e.campaign_id ? campaignName.get(e.campaign_id) || "" : ""]);
      return json({ success: true, csv: toCsv(["data", "tipo", "telefone", "grupo", "campanha"], rows), summary: { total: rows.length } });
    }

    // Fonte A: membros atuais
    const { data: cfg } = await sb.from("integration_whatsapp").select("provider, zapi_instance_id, zapi_token, zapi_client_token, uazapi_url, uazapi_token").eq("tenant_id", tenant_id).eq("is_active", true).maybeSingle();
    const provider = cfg?.provider || "zapi";
    let active = (groups || []).filter((g: any) => g.is_active !== false && g.is_admin);
    if (f.group_ids?.length) active = active.filter((g: any) => f.group_ids?.includes(g.id));
    const members = new Map<string, Set<string>>();
    const failedGroupJids = new Set<string>();
    const membersUazapi = cfg?.uazapi_url && cfg?.uazapi_token ? createUazapiMembers(cfg) : undefined;
    const grupos_com_erro: { grupo: string; erro: string }[] = [];
    let sem_numero = 0;
    const credsOk = provider === "uazapi" ? !!(cfg?.uazapi_url && cfg?.uazapi_token) : !!(cfg?.zapi_instance_id && cfg?.zapi_token);
    if (!credsOk) {
      active.forEach((g: any) => failedGroupJids.add(g.group_jid));
      if (active.length) grupos_com_erro.push({ grupo: "todos", erro: "WhatsApp não configurado" });
    } else {
      await parallelLimit(active, 4, async (g: any) => {
        try {
          const pts = provider === "uazapi" && membersUazapi ? await membersUazapi(g.group_jid) : await membersZapi(cfg, g.group_jid);
          for (const p of pts) {
            const ph = participantPhone(p);
            if (!ph) { sem_numero++; continue; }
            let s = members.get(ph); if (!s) { s = new Set(); members.set(ph, s); }
            s.add(g.group_name);
          }
        } catch (e: any) {
          failedGroupJids.add(g.group_jid);
          grupos_com_erro.push({ grupo: g.group_name, erro: e?.name === "AbortError" ? "tempo esgotado" : String(e?.message || e) });
        }
      });
    }

    const eventFilterActive = !!(f.campaign_id || f.date_from || f.date_to);
    const { rows, no_grupo, saiu, nao_verificado } = consolidate({ members, events, membershipEvents, failedGroupJids, groupJidById, groupNameByJid, groupNameById, campaignName, filters: f, eventFilterActive });
    return json({ success: true, csv: toCsv(CONTACT_HEADER, rows), summary: { total: rows.length, no_grupo, saiu, nao_verificado, sem_numero }, grupos_com_erro, grupos_consultados: active.length });
  } catch (e: any) {
    return json({ success: false, error: e?.message || String(e) });
  }
});
