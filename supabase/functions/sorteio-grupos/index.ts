// Sorteio entre quem está AGORA nos grupos de WhatsApp da loja (Fluxo de Envio).
// - A lista de participantes vem ao vivo do WhatsApp na hora do sorteio (quem saiu não entra).
// - Quem está em vários grupos conta uma vez; admins dos grupos e o número da loja ficam de fora.
// - O sorteio é feito aqui no servidor (aleatório seguro) e gravado em group_raffles. Nada é enviado aos grupos.
// - Liberado só para as lojas da lista abaixo.
// Ações: groups | draw | history
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeTenantCaller, guardResponse } from "../_shared/auth-guard.ts";
import { createUazapiMembers } from "../fe-export-contacts/uazapi.ts";
import { buildPool, drawWinners, normPhone, toMembers, type Member } from "./members.ts";

// Lojas com o sorteio por grupos liberado
export const SORTEIO_GRUPOS_TENANTS = ["b22bb1e6-e9a1-4469-aa4e-57ab13f29321"]; // FL Semi Joias

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function fetchT(url: string, init: RequestInit, ms = 20000) {
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
  // resposta sem participantes não quer dizer grupo vazio
  if (!Array.isArray(m?.participants)) throw new Error("Z-API: resposta sem participantes");
  return m.participants;
}

async function parallelLimit<T>(items: T[], n: number, fn: (i: T) => Promise<void>) {
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (idx < items.length) await fn(items[idx++]); }));
}

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

    if (body.action === "groups") {
      return json({ success: true, groups: activeGroups.map((g: any) => ({ id: g.id, name: g.group_name, participants: g.participant_count, is_admin: !!g.is_admin })) });
    }

    if (body.action === "history") {
      const { data } = await sb.from("group_raffles")
        .select("id, created_at, groups_count, participants_count, winners, groups_failed")
        .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(30);
      return json({ success: true, history: data || [] });
    }

    if (body.action !== "draw") return json({ success: false, error: "Ação inválida" }, 400);

    const ids: string[] = Array.isArray(body.group_ids) ? body.group_ids.filter((x: unknown) => typeof x === "string") : [];
    const chosen = ids.length ? activeGroups.filter((g: any) => ids.includes(g.id)) : activeGroups;
    if (!chosen.length) return json({ success: false, error: "Escolha pelo menos um grupo." });
    const count = Math.max(1, Math.min(20, Math.floor(Number(body.winners) || 1)));
    const exclude: string[] = Array.isArray(body.exclude_phones) ? body.exclude_phones.map(normPhone).filter(Boolean) : [];

    const { data: cfg } = await sb.from("integration_whatsapp")
      .select("provider, zapi_instance_id, zapi_token, zapi_client_token, uazapi_url, uazapi_token, connected_phone")
      .eq("tenant_id", tenantId).eq("is_active", true).maybeSingle();
    const provider = cfg?.provider || "zapi";
    const credsOk = provider === "uazapi" ? !!(cfg?.uazapi_url && cfg?.uazapi_token) : !!(cfg?.zapi_instance_id && cfg?.zapi_token);
    if (!credsOk) return json({ success: false, error: "WhatsApp da loja não está conectado." });

    const membersUazapi = provider === "uazapi" ? createUazapiMembers(cfg as any) : undefined;
    const byGroup: Array<{ group: string; members: Member[] }> = [];
    const failed: Array<{ grupo: string; erro: string }> = [];
    let semNumero = 0;
    await parallelLimit(chosen, 4, async (g: any) => {
      try {
        const raw = membersUazapi ? await membersUazapi(g.group_jid) : await membersZapi(cfg, g.group_jid);
        const { members, semNumero: sn } = toMembers(raw);
        semNumero += sn;
        byGroup.push({ group: g.group_name, members });
      } catch (e: any) {
        failed.push({ grupo: g.group_name, erro: e?.name === "AbortError" ? "tempo esgotado" : String(e?.message || e).slice(0, 160) });
      }
    });
    if (!byGroup.length) return json({ success: false, error: "Não foi possível ler nenhum grupo no WhatsApp agora. Tente de novo em instantes.", grupos_com_erro: failed });

    const { pool, admins } = buildPool(byGroup, { storePhones: [cfg?.connected_phone || ""], exclude });
    if (!pool.length) return json({ success: false, error: "Nenhum participante disponível para o sorteio.", grupos_com_erro: failed });

    const winners = drawWinners(pool, count);
    const row = {
      tenant_id: tenantId,
      created_by: guard.mode === "user" ? guard.userId : null,
      groups_count: byGroup.length,
      groups: byGroup.map((g) => ({ name: g.group, participants: g.members.length })),
      groups_failed: failed,
      participants_count: pool.length,
      excluded_admins: admins,
      excluded_phones: exclude,
      no_phone_count: semNumero,
      winners,
    };
    const { data: saved, error } = await sb.from("group_raffles").insert(row).select("id, created_at").single();
    if (error) console.error("[sorteio-grupos] histórico:", error.message);

    return json({
      success: true, id: saved?.id ?? null, created_at: saved?.created_at ?? new Date().toISOString(),
      winners, participants_count: pool.length, groups_count: byGroup.length, groups_requested: chosen.length,
      excluded_admins: admins, no_phone_count: semNumero, grupos_com_erro: failed,
    });
  } catch (e: any) {
    console.error("[sorteio-grupos] erro:", e?.message || e);
    return json({ success: false, error: "Erro inesperado. Tente novamente." }, 500);
  }
});
