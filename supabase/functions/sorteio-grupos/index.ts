// Sorteio entre quem está nos grupos de WhatsApp da loja (Fluxo de Envio). Nada é enviado aos grupos.
//
// Como funciona (grupos grandes demoram para responder no WhatsApp, então a leitura é feita grupo a grupo):
//   1. refresh_group: lê UM grupo no WhatsApp e grava a lista em group_member_snapshots (com a hora da leitura).
//   2. draw: junta as listas lidas há no máximo 30 min, aplica as entradas/saídas registradas depois da leitura
//      (fe_group_events), tira admins, o número da loja e quem já ganhou, sorteia no servidor (aleatório seguro),
//      busca nome/foto do ganhador e grava o sorteio em group_raffles.
// Quem está em vários grupos conta uma vez. Liberado só para as lojas de SORTEIO_GRUPOS_TENANTS.
// Ações: groups | refresh_group | draw | history
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeTenantCaller, guardResponse } from "../_shared/auth-guard.ts";
import { createUazapiClient, GroupNotFound } from "./uazapi-members.ts";
import { applyEvents, buildPool, drawWinners, normPhone, phoneVariants, toMembers, type Member } from "./members.ts";

export const SORTEIO_GRUPOS_TENANTS = ["b22bb1e6-e9a1-4469-aa4e-57ab13f29321"]; // FL Semi Joias
const MAX_AGE_MIN = 30;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function fetchT(url: string, init: RequestInit, ms = 60000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); }
}

async function membersZapi(cfg: any, jid: string): Promise<unknown[]> {
  const base = `https://api.z-api.io/instances/${cfg.zapi_instance_id}/token/${cfg.zapi_token}`;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.zapi_client_token) h["Client-Token"] = cfg.zapi_client_token;
  let r = await fetchT(`${base}/group-metadata/${jid}`, { headers: h });
  if (!r.ok) r = await fetchT(`${base}/light-group-metadata/${jid}`, { headers: h });
  if (!r.ok) throw new Error(`Z-API ${r.status}`);
  const m = await r.json();
  if (!Array.isArray(m?.participants)) throw new Error("Z-API: resposta sem participantes");
  return m.participants;
}

async function zapiContact(cfg: any, phone: string): Promise<{ image: string | null; name: string }> {
  try {
    const h: Record<string, string> = {};
    if (cfg.zapi_client_token) h["Client-Token"] = cfg.zapi_client_token;
    const r = await fetchT(`https://api.z-api.io/instances/${cfg.zapi_instance_id}/token/${cfg.zapi_token}/profile-picture?phone=${phone}`, { headers: h }, 15000);
    const d = await r.json().catch(() => null);
    return { image: d?.link || null, name: "" };
  } catch { return { image: null, name: "" }; }
}

const ageMin = (iso?: string | null) => iso ? (Date.now() - Date.parse(iso)) / 60000 : Infinity;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : "";
    if (!tenantId) return json({ success: false, error: "tenant_id obrigatório" }, 400);
    const guard = await authorizeTenantCaller(req, sb, tenantId);
    if (!guard.ok) return guardResponse(guard, cors);
    if (!SORTEIO_GRUPOS_TENANTS.includes(tenantId)) return json({ success: false, error: "Sorteio por grupos não disponível para esta loja." }, 403);

    const { data: groups } = await sb.from("fe_groups")
      .select("id, group_jid, group_name, participant_count, is_active, is_admin")
      .eq("tenant_id", tenantId).order("group_name");
    const activeGroups = (groups || []).filter((g: any) => g.is_active !== false && g.group_jid);

    const loadSnapshots = async () => {
      const { data } = await sb.from("group_member_snapshots")
        .select("group_jid, read_at, status, error, member_count, no_phone_count, members").eq("tenant_id", tenantId);
      return new Map<string, any>((data || []).map((s: any) => [s.group_jid, s]));
    };

    const { data: cfg } = await sb.from("integration_whatsapp")
      .select("provider, zapi_instance_id, zapi_token, zapi_client_token, uazapi_url, uazapi_token, connected_phone")
      .eq("tenant_id", tenantId).eq("is_active", true).maybeSingle();
    const provider = cfg?.provider || "zapi";
    const credsOk = provider === "uazapi" ? !!(cfg?.uazapi_url && cfg?.uazapi_token) : !!(cfg?.zapi_instance_id && cfg?.zapi_token);
    const uaz = provider === "uazapi" && credsOk ? createUazapiClient(cfg as any) : undefined;

    // ---------------- lista de grupos (com o status da última leitura) ----------------
    if (body.action === "groups") {
      const snaps = await loadSnapshots();
      return json({
        success: true, max_age_min: MAX_AGE_MIN,
        groups: activeGroups.map((g: any) => {
          const s = snaps.get(g.group_jid);
          return { id: g.id, name: g.group_name, participants: g.participant_count, read_at: s?.read_at ?? null, status: s?.status ?? null, error: s?.error ?? null, read_count: s?.member_count ?? null };
        }),
      });
    }

    if (body.action === "history") {
      const { data } = await sb.from("group_raffles")
        .select("id, created_at, groups_count, participants_count, winners, groups_failed")
        .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(30);
      return json({ success: true, history: data || [] });
    }

    if (!credsOk) return json({ success: false, error: "WhatsApp da loja não está conectado." });

    // ---------------- lê UM grupo no WhatsApp ----------------
    if (body.action === "refresh_group") {
      const g = activeGroups.find((x: any) => x.id === body.group_id);
      if (!g) return json({ success: false, error: "Grupo não encontrado." }, 404);
      let row: any;
      try {
        const raw = uaz ? await uaz.groupMembers(g.group_jid) : await membersZapi(cfg, g.group_jid);
        const { members, semNumero } = toMembers(raw);
        row = { status: "ok", error: null, member_count: members.length, no_phone_count: semNumero, members };
      } catch (e: any) {
        const msg = String(e?.message || e);
        const status = e instanceof GroupNotFound ? "not_found" : "error";
        row = { status, error: status === "not_found" ? "grupo não existe mais no WhatsApp" : (/timed out|abort/i.test(msg) || e?.name === "TimeoutError" ? "o WhatsApp demorou para responder" : msg.slice(0, 160)), member_count: null, no_phone_count: null, members: [] };
      }
      // leitura com erro não apaga a última lista boa: só marca o erro
      const { data: prev } = await sb.from("group_member_snapshots").select("status").eq("tenant_id", tenantId).eq("group_jid", g.group_jid).maybeSingle();
      if (row.status === "error" && prev?.status === "ok") {
        await sb.from("group_member_snapshots").update({ error: row.error, attempted_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("group_jid", g.group_jid);
      } else {
        const now = new Date().toISOString();
        await sb.from("group_member_snapshots").upsert({ tenant_id: tenantId, group_jid: g.group_jid, group_name: g.group_name, read_at: row.status === "ok" ? now : null, attempted_at: now, ...row }, { onConflict: "tenant_id,group_jid" });
      }
      return json({ success: row.status === "ok", status: row.status, error: row.error, member_count: row.member_count });
    }

    if (body.action !== "draw") return json({ success: false, error: "Ação inválida" }, 400);

    // ---------------- sorteio ----------------
    const ids: string[] = Array.isArray(body.group_ids) ? body.group_ids.filter((x: unknown) => typeof x === "string") : [];
    const chosen = ids.length ? activeGroups.filter((g: any) => ids.includes(g.id)) : activeGroups;
    if (!chosen.length) return json({ success: false, error: "Escolha pelo menos um grupo." });
    const count = Math.max(1, Math.min(20, Math.floor(Number(body.winners) || 1)));
    const exclude: string[] = Array.isArray(body.exclude_phones) ? body.exclude_phones.map(normPhone).filter(Boolean) : [];

    const snaps = await loadSnapshots();
    const fresh = chosen.filter((g: any) => { const s = snaps.get(g.group_jid); return s?.status === "ok" && ageMin(s.read_at) <= MAX_AGE_MIN; });
    const notUsed = chosen.filter((g: any) => !fresh.includes(g)).map((g: any) => {
      const s = snaps.get(g.group_jid);
      return { grupo: g.group_name, motivo: s?.status === "not_found" ? "grupo não existe mais" : !s?.read_at ? "ainda não foi lido" : s.status !== "ok" ? (s.error || "erro na leitura") : "leitura com mais de 30 minutos" };
    });
    if (!fresh.length) return json({ success: false, error: "Atualize os participantes antes de sortear.", grupos_fora: notUsed });
    if (notUsed.length && body.allow_partial !== true) return json({ success: false, needs_confirmation: true, error: `${notUsed.length} grupo(s) ficariam de fora do sorteio.`, grupos_fora: notUsed });

    // lista lida + entradas/saídas depois da leitura
    const byGroup: Array<{ group: string; members: Member[] }> = [];
    let semNumero = 0;
    for (const g of fresh) {
      const s = snaps.get(g.group_jid);
      const { data: evs } = await sb.from("fe_group_events").select("phone, event_type, created_at")
        .eq("tenant_id", tenantId).eq("group_jid", g.group_jid).gt("created_at", s.read_at).order("created_at").limit(5000);
      byGroup.push({ group: g.group_name, members: applyEvents(s.members || [], evs || []) });
      semNumero += Number(s.no_phone_count || 0);
    }

    const { pool, admins } = buildPool(byGroup, { storePhones: [cfg?.connected_phone || ""], exclude });
    if (!pool.length) return json({ success: false, error: "Nenhum participante disponível para o sorteio.", grupos_fora: notUsed });

    const drawn = drawWinners(pool, count);

    // nome (cadastro da loja > WhatsApp) e foto do WhatsApp de cada ganhador
    const winners = await Promise.all(drawn.map(async (w) => {
      const { data: cust } = await sb.from("customers").select("name").eq("tenant_id", tenantId).in("phone", phoneVariants(w.phone)).limit(1);
      const info = uaz ? await uaz.contact(w.phone) : await zapiContact(cfg, w.phone);
      return { ...w, name: (cust?.[0]?.name || "").trim() || info.name || w.name || "", whatsapp_name: info.name || null, image: info.image };
    }));

    const oldest = fresh.reduce((min: string | null, g: any) => { const r = snaps.get(g.group_jid)?.read_at; return !min || r < min ? r : min; }, null);
    const { data: saved, error } = await sb.from("group_raffles").insert({
      tenant_id: tenantId,
      created_by: guard.mode === "user" ? guard.userId : null,
      groups_count: byGroup.length,
      groups: byGroup.map((g) => ({ name: g.group, participants: g.members.length })),
      groups_failed: notUsed,
      participants_count: pool.length,
      excluded_admins: admins,
      excluded_phones: exclude,
      no_phone_count: semNumero,
      winners,
    }).select("id, created_at").single();
    if (error) console.error("[sorteio-grupos] histórico:", error.message);

    return json({
      success: true, id: saved?.id ?? null, created_at: saved?.created_at ?? new Date().toISOString(),
      winners, participants_count: pool.length, groups_count: byGroup.length, groups_requested: chosen.length,
      excluded_admins: admins, no_phone_count: semNumero, grupos_fora: notUsed, oldest_read_at: oldest,
    });
  } catch (e: any) {
    console.error("[sorteio-grupos] erro:", e?.message || e);
    return json({ success: false, error: "Erro inesperado. Tente novamente." }, 500);
  }
});
