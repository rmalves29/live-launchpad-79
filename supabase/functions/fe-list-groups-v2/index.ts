import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeTenantCaller, guardResponse } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function parallelLimit<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) { const i = idx++; if (i >= items.length) break; results[i] = await fn(items[i]); }
  }));
  return results;
}

const norm = (v?: string | null) => v?.replace(/\D/g, "") || "";
const core = (p: string) => { let n = p.replace(/\D/g, ""); if (n.startsWith("55") && n.length >= 12) n = n.slice(2); return n; };
const match = (a: string, b: string) => {
  if (!a || !b) return false;
  const na = a.replace(/\D/g, ""), nb = b.replace(/\D/g, "");
  if (na === nb) return true;
  const ca = core(na), cb = core(nb);
  if (ca === cb) return true;
  const s9 = (n: string) => n.length === 11 && n[2] === "9" ? n.slice(0, 2) + n.slice(3) : n;
  const a9 = (n: string) => n.length === 10 ? n.slice(0, 2) + "9" + n.slice(2) : n;
  if (s9(ca) === s9(cb) || a9(ca) === cb || ca === a9(cb)) return true;
  if (na.endsWith(nb) || nb.endsWith(na)) return true;
  return false;
};
const parseCount = (s: any) => { const r = s?.participantsCount ?? s?.participants_count ?? s?.participantsSize ?? s?.size; return r != null && !isNaN(Number(r)) ? Number(r) : 0; };

async function syncZapi(supabase: any, tenant_id: string, cfg: any, admin_only: boolean) {
  const base = `https://api.z-api.io/instances/${cfg.zapi_instance_id}/token/${cfg.zapi_token}`;
  const zh: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.zapi_client_token) zh["Client-Token"] = cfg.zapi_client_token;

  let connPhone = norm(cfg.connected_phone);
  if (!connPhone) {
    for (const ep of [{ url: `${base}/phone`, f: ["phone","number"] }, { url: `${base}/profile`, f: ["phone","number","phoneNumber"] }, { url: `${base}/status`, f: ["phoneConnected","phone","number"] }]) {
      if (connPhone) break;
      try { const r = await fetch(ep.url, { headers: zh }); if (r.ok) { const d = await r.json(); for (const f of ep.f) { const v = norm(d?.[f]); if (v && v.length >= 10) { connPhone = v; break; } } } } catch {}
    }
    if (connPhone) await supabase.from("integration_whatsapp").update({ connected_phone: connPhone }).eq("tenant_id", tenant_id).eq("provider", "zapi");
  }

  let allGroups: any[] = [];
  let page = 1;
  while (true) {
    const r = await fetch(`${base}/groups?page=${page}&pageSize=100`, { headers: zh });
    if (!r.ok) { const t = await r.text(); return { error: `Z-API ${r.status}: ${t.substring(0, 100)}` }; }
    const pg = await r.json();
    if (!Array.isArray(pg) || pg.length === 0) break;
    allGroups = allGroups.concat(pg);
    if (pg.length < 100) break;
    page++;
  }

  const effectiveAdmin = admin_only && !!connPhone;
  const enriched = await parallelLimit(allGroups, 15, async (g: any) => {
    const base2 = parseCount(g);
    try {
      let mr = await fetch(`${base}/group-metadata/${g.phone}`, { headers: zh });
      if (!mr.ok) mr = await fetch(`${base}/light-group-metadata/${g.phone}`, { headers: zh });
      if (mr.ok) {
        const m = await mr.json();
        const pts = Array.isArray(m.participants) ? m.participants : [];
        const count = pts.length || parseCount(m) || base2;
        const isAdmin = connPhone ? pts.some((p: any) => match(norm(p.phone), connPhone) && (p.isAdmin || p.isSuperAdmin)) : false;
        return { group_jid: g.phone, group_name: g.name || g.subject || g.phone, participant_count: count, invite_link: m.invitationLink || m.inviteLink || g.invitationLink || null, _include: effectiveAdmin ? isAdmin : true };
      }
    } catch {}
    return { group_jid: g.phone, group_name: g.name || g.subject || g.phone, participant_count: base2, invite_link: g.invitationLink || null, _include: !effectiveAdmin };
  });

  const filtered = enriched.filter(g => g._include);
  await supabase.from("fe_groups").delete().eq("tenant_id", tenant_id);
  const payload = filtered.map(g => ({ tenant_id, group_jid: g.group_jid, group_name: g.group_name, participant_count: g.participant_count || 0, max_participants: 1024, invite_link: g.invite_link || null }));
  let added = 0;
  for (let i = 0; i < payload.length; i += 50) {
    const { error } = await supabase.from("fe_groups").upsert(payload.slice(i, i + 50), { onConflict: "tenant_id,group_jid" });
    if (!error) added += Math.min(50, payload.length - i);
  }
  const { data: groups } = await supabase.from("fe_groups").select("*").eq("tenant_id", tenant_id).order("group_name");
  return { added, total_found: allGroups.length, synced: filtered.length, admin_only: effectiveAdmin, warning: admin_only && !connPhone ? "Número conectado não encontrado." : undefined, groups };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { tenant_id, admin_only } = await req.json();
    if (!tenant_id) return new Response(JSON.stringify({ error: "tenant_id obrigatório" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Antes era publica: qualquer pessoa apagava/recriava os grupos de qualquer tenant e lia os links de convite.
    const guard = await authorizeTenantCaller(req, supabase, tenant_id);
    if (!guard.ok) return guardResponse(guard, corsHeaders);

    const { data: cfg } = await supabase.from("integration_whatsapp").select("zapi_instance_id, zapi_token, zapi_client_token, connected_phone, provider, uazapi_url, uazapi_token").eq("tenant_id", tenant_id).eq("is_active", true).maybeSingle();
    const provider = cfg?.provider || "zapi";

    if (provider === "uazapi") {
      return new Response(JSON.stringify({ error: "Sincronização de grupos UazAPI deve ser feita pelo painel do UazAPI" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!cfg?.zapi_instance_id || !cfg?.zapi_token) {
      return new Response(JSON.stringify({ error: "Z-API não configurada" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await syncZapi(supabase, tenant_id, cfg, admin_only);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
