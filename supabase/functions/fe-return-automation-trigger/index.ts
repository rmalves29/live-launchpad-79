// Trigger da automação de retorno. Chamado pelo zapi-webhook logo após inserir
// um evento em fe_group_events. Não bloqueia o webhook (fire-and-forget).
//
// - event_type = 'leave': agenda convites em fe_return_pending
// - event_type = 'join' : se houver convite pendente, envia recompensa (cupom)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  tenant_id: string;
  group_id?: string | null;
  group_jid: string;
  group_name?: string | null;
  phone: string;
  event_type: "join" | "leave";
}

function fillVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k) => vars[k] ?? "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body: Body = await req.json();
    const { tenant_id, group_jid, phone, event_type } = body;
    if (!tenant_id || !group_jid || !phone || !event_type) {
      return new Response(JSON.stringify({ ok: false, error: "missing fields" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ignora telefones anônimos (sem identificação real)
    if (phone.startsWith("unknown-")) {
      return new Response(JSON.stringify({ ok: true, skipped: "anonymous" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve group_id caso não venha
    let groupId = body.group_id ?? null;
    let groupName = body.group_name ?? "";
    if (!groupId) {
      const { data: g } = await supabase
        .from("fe_groups")
        .select("id, group_name")
        .eq("tenant_id", tenant_id)
        .eq("group_jid", group_jid)
        .maybeSingle();
      if (g) {
        groupId = g.id;
        groupName = g.group_name || groupName;
      }
    }

    if (event_type === "leave") {
      // Busca automações ativas que cubram este grupo
      const { data: autos } = await supabase
        .from("fe_return_automations")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("is_active", true);

      // Descobre campanhas que contêm este grupo
      let campaignIds: string[] = [];
      if (groupId) {
        const { data: cg } = await supabase
          .from("fe_campaign_groups")
          .select("campaign_id")
          .eq("group_id", groupId);
        campaignIds = (cg || []).map((r: any) => r.campaign_id);
      }

      const applicable = (autos || []).filter((a: any) => {
        const inGroups = groupId && Array.isArray(a.group_ids) && a.group_ids.includes(groupId);
        const inCampaigns = Array.isArray(a.campaign_ids)
          && campaignIds.some((cid) => a.campaign_ids.includes(cid));
        return inGroups || inCampaigns;
      });

      if (applicable.length === 0) {
        return new Response(JSON.stringify({ ok: true, scheduled: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let scheduled = 0;
      for (const a of applicable) {
        // Cooldown: se houver invited/rewarded recente (< cooldown_hours), pula
        const cooldownMs = (a.cooldown_hours || 24) * 3600 * 1000;
        const cooldownSince = new Date(Date.now() - cooldownMs).toISOString();
        const { data: recent } = await supabase
          .from("fe_return_pending")
          .select("id, status, invite_sent_at, reward_sent_at, created_at")
          .eq("tenant_id", tenant_id)
          .eq("group_jid", group_jid)
          .eq("phone", phone)
          .eq("automation_id", a.id)
          .gte("created_at", cooldownSince)
          .limit(1);
        if (recent && recent.length > 0) continue;

        // Evita duplicar pendente ativo (scheduled/invited)
        const { data: active } = await supabase
          .from("fe_return_pending")
          .select("id")
          .eq("tenant_id", tenant_id)
          .eq("group_jid", group_jid)
          .eq("phone", phone)
          .eq("automation_id", a.id)
          .in("status", ["scheduled", "invited"])
          .limit(1);
        if (active && active.length > 0) continue;

        const now = Date.now();
        const delayMs = Math.max(0, (a.delay_minutes ?? 0)) * 60 * 1000;
        const inviteAt = new Date(now + delayMs).toISOString();
        const expiresAt = new Date(
          now + delayMs + (a.validity_days || 7) * 86400 * 1000,
        ).toISOString();

        const { error } = await supabase.from("fe_return_pending").insert({
          tenant_id,
          automation_id: a.id,
          group_id: groupId,
          group_jid,
          phone,
          status: "scheduled",
          invite_send_at: inviteAt,
          expires_at: expiresAt,
        });
        if (!error) scheduled++;
      }
      return new Response(JSON.stringify({ ok: true, scheduled }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // event_type === 'join' → entrega recompensa se houver pendente 'invited'
    if (event_type === "join") {
      const nowIso = new Date().toISOString();
      const { data: pendings } = await supabase
        .from("fe_return_pending")
        .select("id, automation_id, group_id")
        .eq("tenant_id", tenant_id)
        .eq("group_jid", group_jid)
        .eq("phone", phone)
        .eq("status", "invited")
        .gt("expires_at", nowIso);

      if (!pendings || pendings.length === 0) {
        return new Response(JSON.stringify({ ok: true, rewarded: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let rewarded = 0;
      for (const p of pendings) {
        const { data: a } = await supabase
          .from("fe_return_automations")
          .select("reward_message, coupon_code")
          .eq("id", p.automation_id)
          .maybeSingle();
        if (!a) continue;

        // Nome do cliente (best effort)
        const { data: cust } = await supabase
          .from("customers")
          .select("name")
          .eq("tenant_id", tenant_id)
          .eq("phone", phone)
          .maybeSingle();

        const msg = fillVars(a.reward_message || "", {
          nome: cust?.name || "",
          cupom: a.coupon_code || "",
          grupo: groupName || "",
        });

        try {
          await supabase.functions.invoke("zapi-send-message", {
            body: { tenant_id, phone, message: msg },
          });
          await supabase
            .from("fe_return_pending")
            .update({ status: "rewarded", reward_sent_at: nowIso })
            .eq("id", p.id);
          rewarded++;
        } catch (e: any) {
          await supabase
            .from("fe_return_pending")
            .update({ status: "failed", error_message: String(e?.message || e) })
            .eq("id", p.id);
        }
      }

      return new Response(JSON.stringify({ ok: true, rewarded }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, ignored: event_type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[fe-return-automation-trigger] error:", e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
