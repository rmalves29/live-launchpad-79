// uazapi webhook handler — recebe eventos da uazapi e:
//  1. Atualiza status de conexão da integração (connection events).
//  2. Atualiza delivery_status de mensagens enviadas (messages_update / ack).
//  3. Para mensagens recebidas, normaliza o payload em formato Z-API e
//     re-invoca `zapi-webhook` passando `uazapi_tenant_id` para reaproveitar
//     TODA a lógica já existente (consentimento, SIM/NÃO, grupos, códigos
//     de produto C123x2, sorteio, criação de pedidos etc.).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, token",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function digitsOnly(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function normalizeBrazilianPhoneCandidate(value: unknown): string {
  let digits = digitsOnly(String(value || "").split("@")[0]);
  if (!digits) return "";

  // Telefones BR reais têm 10/11 dígitos sem DDI ou 12/13 com DDI 55.
  // IDs de grupo e LIDs do WhatsApp costumam ter 15+ dígitos e não são telefone.
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
    digits = digits.slice(2);
  } else if (digits.length > 11) {
    return "";
  }

  if (digits.length < 10 || digits.length > 11) return "";

  const ddd = Number(digits.slice(0, 2));
  if (Number.isNaN(ddd) || ddd < 11 || ddd > 99) return "";

  return digits;
}

function phoneFromJid(jid: string): string {
  return normalizeBrazilianPhoneCandidate(jid);
}

function pickFirstPhone(...values: unknown[]): string {
  for (const value of values) {
    const phone = normalizeBrazilianPhoneCandidate(value);
    if (phone) return phone;
  }
  return "";
}

function isLikelyNonPhoneIdentifier(value: unknown): boolean {
  return digitsOnly(value).length > 13;
}

function isGroupJid(jid: string): boolean {
  return String(jid || "").includes("@g.us");
}

function normalizeGroupAction(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  const compact = raw.replace(/[\s_\-.]+/g, "");
  if (["add", "join", "joined", "invite", "introduced", "participantadd", "groupadd"].some((k) => compact.includes(k))) {
    return "add";
  }
  if ([
    "remove",
    "removed",
    "leave",
    "left",
    "exit",
    "exited",
    "out",
    "kick",
    "kicked",
    "participantremove",
    "participantremoved",
    "groupremove",
    "deleteparticipant",
  ].some((k) => compact.includes(k))) {
    return "remove";
  }
  return raw;
}

function extractText(data: any): string {
  if (!data) return "";
  return (
    data?.text ||
    data?.message?.text ||
    data?.message?.conversation ||
    data?.body ||
    data?.content?.text ||
    data?.caption ||
    data?.messageText ||
    ""
  ).toString().trim();
}

function pickEventKind(payload: any): string {
  // uazapi emite eventos como `messages`, `messages_update`, `connection`, `presence`, `groups`
  // mas também pode mandar payload com `event` (string OU objeto), `type`, ou só `data` puro.
  // IMPORTANTE: em payloads novos da uazapi, `payload.event` pode ser um OBJETO com os dados
  // do evento (JID/Sender/JoinReason). Precisamos priorizar strings de tipo.
  const candidates = [payload?.EventType, payload?.type, payload?.event];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.toLowerCase();
  }
  if (payload?.status && payload?.ids) return "messages_update";
  if (payload?.data?.message || payload?.message || payload?.text) return "messages";
  if (payload?.instance?.status || payload?.connection) return "connection";
  return "unknown";
}


const ACK_MAP: Record<string, string> = {
  "0": "SENT",
  "1": "SENT",
  "2": "RECEIVED",
  "3": "READ",
  "4": "PLAYED",
  "sent": "SENT",
  "received": "RECEIVED",
  "delivered": "RECEIVED",
  "read": "READ",
  "played": "PLAYED",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = await req.json().catch(() => ({} as any));
    const event = pickEventKind(payload);
    const instanceToken: string | undefined =
      payload?.token || payload?.instance?.token || req.headers.get("token") || undefined;
    const instanceName: string | undefined = payload?.instance?.name || payload?.instance_name;

    console.log(`[uazapi-webhook] event=${event} instance=${instanceName} token=${instanceToken?.slice(0, 8)}...`);

    // Resolver tenant pelo token da instância (desempata por instance_name / connected_phone se houver duplicidade)
    let tenantId: string | null = null;
    let uazapiUrl: string | null = null;
    if (instanceToken) {
      const { data: rows } = await supabase
        .from("integration_whatsapp")
        .select("tenant_id, uazapi_url, instance_name, connected_phone, is_active")
        .eq("uazapi_token", instanceToken);
      const candidates = (rows || []).filter((r: any) => r.is_active !== false);
      let integ: any = null;
      if (candidates.length === 1) {
        integ = candidates[0];
      } else if (candidates.length > 1) {
        const ownerPhone = String(
          payload?.owner || payload?.instance?.owner || payload?.instance?.phoneconnected || payload?.phoneconnected || ""
        ).replace(/@.*/, "").replace(/\D/g, "");
        if (instanceName) {
          integ = candidates.find((r: any) => (r.instance_name || "").trim().toLowerCase() === instanceName.trim().toLowerCase()) || null;
        }
        if (!integ && ownerPhone) {
          integ = candidates.find((r: any) => (r.connected_phone || "").replace(/\D/g, "") === ownerPhone) || null;
        }
        if (!integ) {
          console.warn(`[uazapi-webhook] token duplicado em ${candidates.length} integrações e sem instance_name/owner para desempatar`);
        }
      }
      if (integ?.tenant_id) {
        tenantId = integ.tenant_id;
        uazapiUrl = (integ as any).uazapi_url || null;
      }
    }


    if (!tenantId) {
      console.warn("[uazapi-webhook] tenant não identificado pelo token. Salvando como órfão.");
      try {
        await supabase.from("whatsapp_webhook_orphans").insert({
          payload,
          received_at: new Date().toISOString(),
        });
      } catch (_) { /* ignore */ }
      return json({ ok: true, warning: "tenant não identificado" });
    }

    const eventObj = (payload?.event && typeof payload.event === "object" && !Array.isArray(payload.event)) ? payload.event : null;
    const data = payload?.data || payload?.message || eventObj || payload;


    // ─── 1) Eventos de conexão ──────────────────────────────────────────────
    if (event === "connection" || event === "connection_update" || (!["messages", "messages.upsert", "message"].includes(event) && (payload?.instance?.status || payload?.connection))) {
      const status = data?.status || payload?.status;
      const phone = data?.owner || data?.wid || data?.phoneconnected;
      const updates: Record<string, unknown> = { last_status_check: new Date().toISOString() };
      if (phone) updates.connected_phone = String(phone).replace(/@.*/, "").replace(/\D/g, "");
      await supabase.from("integration_whatsapp").update(updates).eq("tenant_id", tenantId);

      try {
        await supabase.from("whatsapp_connection_logs").insert({
          tenant_id: tenantId,
          status,
          metadata: { event, payload: data },
        });
      } catch (_) { /* ignore */ }
      return json({ ok: true, handled: "connection" });
    }

    // ─── 2) Status de mensagem (ack / delivery) ─────────────────────────────
    if (event === "messages_update" || event === "messages.update" || event === "message_update" || event === "ack" || (payload?.ids && payload?.status)) {
      const ids: string[] = payload?.ids || (data?.id ? [data.id] : []);
      const rawStatus = String(payload?.status ?? data?.status ?? data?.ack ?? "").toLowerCase();
      const mapped = ACK_MAP[rawStatus] || rawStatus.toUpperCase() || "SENT";
      if (ids.length) {
        try {
          const { error, count } = await supabase
            .from("whatsapp_messages")
            .update({ delivery_status: mapped, delivered_at: new Date().toISOString() })
            .in("zapi_message_id", ids)
            .eq("tenant_id", tenantId)
            .select("id", { count: "exact", head: true });
          if (error) console.warn("[uazapi-webhook] update delivery_status erro:", error.message);
          else console.log(`[uazapi-webhook] Updated ${count ?? 0} message(s) to status ${mapped}`);
        } catch (e: any) {
          console.warn("[uazapi-webhook] update delivery_status exception:", e.message);
        }
      }
      return json({ ok: true, handled: "status", mapped });
    }

    // ─── 3) Mensagens (incoming/outgoing) ───────────────────────────────────
    if (event === "messages" || event === "messages.upsert" || event === "message" || data?.text || data?.message || data?.messageText) {
      const remoteJid: string = data?.chatid || data?.chatId || data?.key?.remoteJid || data?.from || data?.remoteJid || "";
      const fromMe: boolean = !!(data?.fromMe ?? data?.fromme ?? data?.key?.fromMe);
      const text = extractText(data);
      const messageId: string = data?.id || data?.messageid || data?.key?.id || data?.messageId || crypto.randomUUID();
      const isGroup = isGroupJid(remoteJid) || !!data?.isGroup;
      // Em grupos, o JID/telefone do remetente aparece em diferentes campos
      // dependendo da versão da uazapi: sender, senderJid, senderLid, participant, author, key.participant, sender_phone, etc.
      const senderJid =
        data?.sender ||
        data?.senderId ||
        data?.senderJid ||
        data?.sender_jid ||
        data?.senderLid ||
        data?.sender_lid ||
        data?.participant ||
        data?.author ||
        data?.key?.participant ||
        data?.participantJid ||
        data?.participant_jid ||
        "";
      let participantPhone = phoneFromJid(senderJid);
      // Fallbacks adicionais quando o JID veio sem telefone real (ex: LID puro)
      if (!participantPhone) {
        participantPhone = pickFirstPhone(
          data?.senderPhone,
          data?.sender_phone,
          data?.senderPn,
          data?.senderPN,
          data?.sender_pn,
          data?.senderpn,
          data?.participantPhone,
          data?.participant_phone,
          data?.participantPn,
          data?.participantPN,
          data?.participant_pn,
          data?.participantpn,
          data?.authorPhone,
          data?.author_phone,
        );
      }
      const chatPhone = phoneFromJid(remoteJid);
      const chatName = data?.chatname || data?.chatName || data?.groupName || data?.pushName || "";
      const connectedPhone = pickFirstPhone(data?.owner, data?.wid, data?.phoneconnected, payload?.instance?.owner, payload?.instance?.wid);
      // Para grupos: NUNCA usar o ID do grupo como telefone do cliente.
      // Em mensagens fromMe no grupo, o sender/participant pode vir como LID; usa o número conectado.
      const senderPhone = (isGroup && fromMe)
        ? (connectedPhone || participantPhone)
        : (participantPhone || (isGroup ? "" : chatPhone));

      if (isGroup && !participantPhone) {
        console.warn(
          `[uazapi-webhook] ⚠️ Mensagem de grupo sem participantPhone identificável. ` +
          `Campos disponíveis em data: ${Object.keys(data || {}).join(", ")}`
        );
        console.warn(`[uazapi-webhook] payload bruto: ${JSON.stringify(data).slice(0, 800)}`);
      }

      if (isGroup && isLikelyNonPhoneIdentifier(senderJid)) {
        console.warn(
          `[uazapi-webhook] ⚠️ Sender/participant parece LID ou ID interno, não telefone. ` +
          `senderJid=${String(senderJid).slice(0, 80)} connectedPhone=${connectedPhone || "N/A"}`
        );
      }

      // Se a mensagem de grupo veio SEM telefone real do remetente (só LID),
      // persistimos o payload cru como órfão para diagnóstico e NÃO encaminhamos
      // ao zapi-webhook (evita processar como pedido de telefone vazio).
      if (isGroup && !participantPhone) {
        try {
          await supabase.from("whatsapp_webhook_orphans").insert({
            phone: remoteJid,
            message_id: messageId,
            status: "uazapi_message_lid_only",
            raw_payload: payload,
            received_at: new Date().toISOString(),
          });
        } catch (e: any) {
          console.warn("[uazapi-webhook] falha ao salvar órfão LID:", e?.message);
        }
        console.warn(
          `[uazapi-webhook] ⏭️ Ignorando msg de grupo sem telefone real do remetente. ` +
          `text="${String(text).slice(0, 80)}" tenant=${tenantId} group=${remoteJid}`
        );
        return json({ ok: true, skipped: "group_message_lid_only", tenantId, groupJid: remoteJid });
      }

      // NÃO inserir em whatsapp_messages aqui — o zapi-webhook faz o próprio
      // controle de deduplicação/inserção. Se inserirmos antes, ele pula o
      // processamento com skipped=duplicate_message_db e nenhum item-added é
      // disparado, nenhum pedido é criado.


      // ─── BRIDGE: re-emite o evento em formato Z-API para zapi-webhook ────
      // Assim a lógica de consentimento/SIM-NÃO/grupos/códigos de produto/sorteio
      // que já existe em zapi-webhook é reaproveitada integralmente.
      const zapiPayload: Record<string, unknown> = {
        // tenant já resolvido por nós — fast path em zapi-webhook
        uazapi_tenant_id: tenantId,
        // identificação
        instanceId: `uazapi:${tenantId}`,
        connectedPhone,
        // conteúdo
        type: "ReceivedCallback",
        phone: chatPhone,
        chatId: remoteJid,
        chatName,
        participantPhone,
        senderPhone,
        text: { message: text },
        message: text,
        isGroup,
        fromMe,
        fromApi: !!(data?.fromApi || data?.fromapi || data?.wasSentByApi || data?.wasSentByapi),
        messageId,
        zapiMessageId: messageId,
        momment: data?.messageTimestamp || data?.timestamp || Date.now(),
      };

      // Para eventos de grupo (entrada/saída de participantes), uazapi usa `groups`/`group_participants_update`.
      // Esses caem no ramo de eventos abaixo, fora deste bloco.

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/zapi-webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify(zapiPayload),
        });
        const body = await resp.text();
        console.log(`[uazapi-webhook] → zapi-webhook ${resp.status} | ${body.slice(0, 200)}`);
      } catch (e: any) {
        console.error("[uazapi-webhook] erro encaminhando para zapi-webhook:", e.message);
      }

      return json({ ok: true, handled: "message_forwarded", fromMe, isGroup, messageId });
    }

    // ─── 4) Eventos de grupo (participantes entram/saem) ────────────────────
    // Detecção ampla: uazapi pode emitir sob nomes variados
    // ("groups", "groups_update", "group_participants_update", "group_update",
    // "chats_update" com participants, "presence", etc). Trata como evento de
    // grupo qualquer payload que traga participantes ou uma action típica.
    // Detecta ações. Formato novo uazapi: `JoinReason` presente → participante entrou;
    // campos de saída/remoção variam conforme a versão (`LeaveReason`, `RemoveReason`, etc.).
    // presença de `PrevParticipantVersionID`/`ParticipantVersionID` também indica update de participantes.
    const hasJoinReason = !!(data?.JoinReason || data?.joinReason || data?.join_reason);
    const hasLeaveReason = !!(data?.LeaveReason || data?.leaveReason || data?.leave_reason || data?.RemoveReason || data?.removeReason || data?.remove_reason);
    const hasParticipantVersion = !!(data?.ParticipantVersionID || data?.participantVersionID);

    // Formato uazapi novo: arrays de topo Join/Leave/Promote/Demote com JIDs
    const joinArr: any[] = Array.isArray(data?.Join) ? data.Join : (Array.isArray(data?.join) ? data.join : []);
    const leaveArr: any[] = Array.isArray(data?.Leave) ? data.Leave : (Array.isArray(data?.leave) ? data.leave : []);
    const promoteArr: any[] = Array.isArray(data?.Promote) ? data.Promote : [];
    const demoteArr: any[] = Array.isArray(data?.Demote) ? data.Demote : [];

    const rawActionCandidates = [
      data?.action, data?.Action, data?.type, data?.Type,
      data?.operation, data?.Operation, data?.status, data?.Status,
      data?.JoinReason, data?.joinReason, data?.join_reason,
      data?.LeaveReason, data?.leaveReason, data?.leave_reason,
      data?.RemoveReason, data?.removeReason, data?.remove_reason,
      payload?.action, payload?.Action, payload?.operation, payload?.Operation,
    ];
    let rawAction = "";
    for (const candidate of rawActionCandidates) {
      rawAction = normalizeGroupAction(candidate);
      if (rawAction) break;
    }
    // Prioriza arrays concretos (fonte de verdade no formato novo da uazapi)
    if (leaveArr.length > 0) rawAction = "remove";
    else if (joinArr.length > 0) rawAction = "add";
    else if (promoteArr.length > 0) rawAction = "promote";
    else if (demoteArr.length > 0) rawAction = "demote";
    else if (!rawAction && hasJoinReason) rawAction = "add";
    else if (!rawAction && hasLeaveReason) rawAction = "remove";

    const groupActionKeywords = ["add", "remove", "removed", "join", "joined", "leave", "left", "exit", "out", "kick", "kicked", "invite", "promote", "demote", "introduced"];
    const looksLikeGroupEvent = (
      event.includes("group") ||
      Array.isArray(data?.participants) ||
      Array.isArray(payload?.participants) ||
      joinArr.length > 0 ||
      leaveArr.length > 0 ||
      promoteArr.length > 0 ||
      demoteArr.length > 0 ||
      (rawAction && groupActionKeywords.some((k) => rawAction.includes(k))) ||
      hasJoinReason ||
      hasLeaveReason ||
      (hasParticipantVersion && !!(data?.JID || data?.Sender))
    );
    if (looksLikeGroupEvent) {
      const groupJid: string = data?.chatid || data?.chatId || data?.group_id || data?.groupId || data?.GroupJID || data?.GroupJid || data?.groupJid || data?.jid || data?.JID || data?.remoteJid || data?.id || "";
      const action: string = rawAction || "group_event";

      // Fonte primária: arrays Join/Leave/Promote/Demote quando disponíveis
      let primaryArr: any[] = [];
      if (action === "remove") primaryArr = leaveArr;
      else if (action === "add") primaryArr = joinArr;
      else if (action === "promote") primaryArr = promoteArr;
      else if (action === "demote") primaryArr = demoteArr;

      const rawParticipants = primaryArr.length
        ? primaryArr
        : (data?.participants || data?.Participants || data?.participant || data?.Participant || payload?.participants || payload?.Participants || []);
      let participants: string[] = (Array.isArray(rawParticipants) ? rawParticipants : [rawParticipants]).map((p: any) =>
        typeof p === "string" ? p : (p?.id || p?.jid || p?.JID || p?.phone || p?.Phone || p?.PhoneNumber || p?.participant || p?.Participant || p?.Sender || p?.SenderPN || p?.PN || p?.LID || p?.lid || "")
      ).filter(Boolean);
      if (!participants.length) {
        // Sender é quem executou a ação (admin removendo), não o participante afetado.
        // Só use como fallback se realmente não houver nada nos arrays.
        const single = data?.ParticipantPN || data?.participantPN || data?.ParticipantJID || data?.participantJID || data?.RemovedParticipant || data?.removedParticipant || data?.LeftParticipant || data?.leftParticipant;
        if (single) participants = [String(single)];
      }

      console.log(`[uazapi-webhook] 📥 group event | event=${event} action=${action} group=${groupJid} participants=${participants.length}`);

      // ─── DIAGNÓSTICO: se ação for genérica, logar payload BRUTO completo e
      // persistir em whatsapp_webhook_orphans p/ análise offline.
      if (!rawAction || action === "group_event") {
        try {
          const rawJson = JSON.stringify(payload);
          console.warn(`[uazapi-webhook] ⚠️ GROUP_EVENT AÇÃO INDEFINIDA — RAW PAYLOAD: ${rawJson}`);
          await supabase.from("whatsapp_webhook_orphans").insert({
            phone: groupJid || null,
            status: `uazapi_group_action_unresolved:${event}`,
            message_id: null,
            zaap_id: null,
            ids: null,
            raw_payload: payload as any,
          });
        } catch (diagErr: any) {
          console.error("[uazapi-webhook] erro salvando diagnóstico:", diagErr?.message);
        }
      }

      const zapiPayload: Record<string, unknown> = {
        uazapi_tenant_id: tenantId,
        instanceId: `uazapi:${tenantId}`,
        type: "GroupParticipantsCallback",
        notification: action || "group_event",
        action,
        groupId: groupJid,
        chatId: groupJid,
        chatName: data?.chatname || data?.groupName || "",
        phone: groupJid,
        isGroup: true,
        participants,
        participant: participants[0] || "",
        participantPhone: phoneFromJid(participants[0] || ""),
        momment: Date.now(),
      };

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/zapi-webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify(zapiPayload),
        });
        const body = await resp.text();
        console.log(`[uazapi-webhook] group → zapi-webhook ${resp.status} | ${body.slice(0, 200)}`);
      } catch (e: any) {
        console.error("[uazapi-webhook] erro encaminhando evento de grupo:", e.message);
      }
      return json({ ok: true, handled: "group_event_forwarded", action });
    }

    // Log payload de eventos desconhecidos para descobrir novos formatos da uazapi.
    if (event === "unknown") {
      try {
        console.log(`[uazapi-webhook] payload desconhecido keys=${Object.keys(payload || {}).join(",")} sample=${JSON.stringify(payload).slice(0, 500)}`);
        await supabase.from("whatsapp_webhook_orphans").insert({
          payload: { _reason: "unknown_event_kind", tenant_id: tenantId, ...payload },
          received_at: new Date().toISOString(),
        });
      } catch (_) { /* ignore */ }
    }
    return json({ ok: true, handled: "ignored", event });
  } catch (e: any) {
    console.error("[uazapi-webhook] erro fatal:", e.message);
    return json({ ok: false, error: e.message }, 200);
  }
});
