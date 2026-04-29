import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 import { antiBlockDelay, logAntiBlockDelay, antiBlockDelayLive, addMessageVariation, getTypingDelay, simulateTyping } from "../_shared/anti-block-delay.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para obter a data atual no timezone de Brasília (America/Sao_Paulo)
function getBrasiliaDateISO(): string {
  const now = new Date();
  // Brasília é UTC-3, então subtraímos 3 horas do UTC
  const brasiliaOffset = -3 * 60; // -180 minutos
  const utcOffset = now.getTimezoneOffset(); // minutos de diferença do UTC
  const brasiliaTime = new Date(now.getTime() + (utcOffset + brasiliaOffset) * 60 * 1000);
  
  const year = brasiliaTime.getFullYear();
  const month = String(brasiliaTime.getMonth() + 1).padStart(2, '0');
  const day = String(brasiliaTime.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

interface ZAPIWebhookPayload {
  phone?: string;
  chatId?: string;
  chatName?: string;
  senderPhone?: string;
  senderName?: string;
  participantPhone?: string;
  participant?: string;
  participants?: string[];
  groupId?: string;
  action?: string;
  event?: string;
  text?: {
    message?: string;
  };
  message?: string;
  isGroup?: boolean;
  fromMe?: boolean;
  momment?: number;
  timestamp?: number;
  type?: string;
  status?: string;
  ids?: string[];
  instanceId?: string;
  messageId?: string;
  zapiMessageId?: string;
  notification?: string;
  notificationParameters?: string[];
  data?: {
    action?: string;
    event?: string;
    participants?: string[];
    participant?: string;
    participantPhone?: string;
    phone?: string;
    groupId?: string;
    chatId?: string;
    timestamp?: number;
  };
}

const processedMessages = new Map<string, number>();
const MESSAGE_CACHE_TTL_MS = 60000;
const processedProductsInMessage = new Map<string, number>();
const PRODUCT_CACHE_TTL_MS = 30000;
const processedGroupEvents = new Map<string, number>();
const GROUP_EVENT_CACHE_TTL_MS = 5 * 60 * 1000;

function cleanMessageCache() {
  const now = Date.now();
  for (const [key, timestamp] of processedMessages.entries()) {
    if (now - timestamp > MESSAGE_CACHE_TTL_MS) {
      processedMessages.delete(key);
    }
  }
  for (const [key, timestamp] of processedProductsInMessage.entries()) {
    if (now - timestamp > PRODUCT_CACHE_TTL_MS) {
      processedProductsInMessage.delete(key);
    }
  }
  for (const [key, timestamp] of processedGroupEvents.entries()) {
    if (now - timestamp > GROUP_EVENT_CACHE_TTL_MS) {
      processedGroupEvents.delete(key);
    }
  }
}

function normalizeDigits(value?: string | null): string {
  return (value || '').replace(/\D/g, '');
}

function normalizeParticipantPhone(value?: string | null): string {
  const digits = normalizeDigits(value);

  if (!digits) return '';

  // Telefones BR reais têm 10-11 dígitos sem DDI e 12-13 com DDI.
  // Identificadores maiores costumam ser LIDs do WhatsApp e não devem ser truncados.
  if (digits.length > 13) {
    return digits;
  }

  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return digits.slice(2);
  }

  return digits;
}

async function triggerItemAddedMessage(
  tenantId: string,
  customerPhone: string,
  product: any,
  quantity: number,
  unitPrice: number,
  orderId: number | string | null,
) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const response = await fetch(`${supabaseUrl}/functions/v1/zapi-send-item-added`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        customer_phone: customerPhone,
        product_name: product.name,
        product_code: product.code,
        quantity,
        unit_price: unitPrice,
        original_price: product.price,
        order_id: orderId,
      }),
    });

    const responseText = await response.text();
    console.log(`[zapi-webhook] 📤 Item-added dispatch for ${customerPhone} (${product.code}): status=${response.status} body=${responseText.substring(0, 300)}`);
  } catch (error: any) {
    console.error(`[zapi-webhook] ❌ Item-added dispatch failed for ${customerPhone} (${product?.code || 'unknown'}):`, error?.message || error);
  }
}

function queueItemAddedMessage(
  tenantId: string,
  customerPhone: string,
  product: any,
  quantity: number,
  unitPrice: number,
  orderId: number | string | null,
) {
  const task = triggerItemAddedMessage(tenantId, customerPhone, product, quantity, unitPrice, orderId);
  const edgeRuntime = (globalThis as any).EdgeRuntime;

  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(task);
  } else {
    task.catch((error: any) => console.error('[zapi-webhook] Background item-added dispatch error:', error?.message || error));
  }
}

function hashMessage(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function isDuplicateGroupEvent(key: string): boolean {
  cleanMessageCache();
  if (processedGroupEvents.has(key)) {
    console.log(`[zapi-webhook] 🔄 DUPLICATE group event ignored: ${key}`);
    return true;
  }
  processedGroupEvents.set(key, Date.now());
  return false;
}

function isProductAlreadyProcessedForMessage(
  messageId: string | undefined,
  phone: string,
  messageText: string,
  productCode: string
): boolean {
  const messageKey = messageId || `${phone}:${hashMessage(messageText)}`;
  const productKey = `${messageKey}:${productCode}`;

  if (processedProductsInMessage.has(productKey)) {
    console.log(`[zapi-webhook] 🔄 DUPLICATE product ${productCode} for message already processed`);
    return true;
  }

  processedProductsInMessage.set(productKey, Date.now());
  return false;
}

function isDuplicateMessage(messageId: string | undefined, phone: string, messageText: string): boolean {
  cleanMessageCache();

  if (messageId) {
    if (processedMessages.has(messageId)) {
      console.log(`[zapi-webhook] 🔄 DUPLICATE detected by messageId: ${messageId}`);
      return true;
    }
    processedMessages.set(messageId, Date.now());
    return false;
  }

  const compositeKey = `${phone}:${messageText}`;
  const existingTimestamp = processedMessages.get(compositeKey);

  if (existingTimestamp) {
    const timeDiff = Date.now() - existingTimestamp;
    if (timeDiff < 10000) {
      console.log(`[zapi-webhook] 🔄 DUPLICATE detected by content (within ${timeDiff}ms): ${compositeKey.substring(0, 50)}...`);
      return true;
    }
  }

  processedMessages.set(compositeKey, Date.now());
  return false;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const payload: ZAPIWebhookPayload = await req.json();
    
    // ─── LOG RESUMIDO DE TODA MOVIMENTAÇÃO ───────────────────────────────
    const evtType = payload.type || 'unknown';
    const evtNotif = payload.notification || '';
    const evtPhone = payload.phone || payload.chatId || '';
    const evtIsGroup = payload.isGroup || false;
    const evtAction = payload.action || payload.event || payload.data?.action || payload.data?.event || '';
    const evtParticipant = payload.participantPhone || payload.participant || payload.data?.participantPhone || payload.data?.participant || '';
    const evtParticipants = payload.participants || payload.data?.participants || [];
    
    // Log compacto para TODOS os eventos (exceto status callbacks de leitura)
    const isStatusCb = evtType === 'MessageStatusCallback';
    const isReadStatus = isStatusCb && ['READ', 'READ_BY_ME', 'PLAYED', 'DELIVERED'].includes(payload.status || '');
    
    if (!isReadStatus) {
      console.log(`[zapi-webhook] 📋 EVENT type=${evtType} notification=${evtNotif} action=${evtAction} phone=${evtPhone} isGroup=${evtIsGroup} participant=${evtParticipant} participants=${JSON.stringify(evtParticipants)} instanceId=${payload.instanceId || ''}`);
    }
    
    // Log detalhado APENAS para eventos de grupo (participantes)
    const isGroupParticipantEvent = 
      evtType === 'GroupParticipantsUpdate' ||
      evtType === 'group-participants.update' ||
      evtType === 'onGroupParticipantsUpdate' ||
      evtNotif.includes('GROUP_PARTICIPANT') ||
      evtAction.includes('add') || evtAction.includes('remove') || evtAction.includes('leave') || evtAction.includes('join');
    
    if (isGroupParticipantEvent) {
      console.log(`[zapi-webhook] 🚨 GROUP PARTICIPANT EVENT DETECTED! Full payload:`, JSON.stringify(payload, null, 2));
    } else if (!isReadStatus) {
      // Log full payload only for non-read-status, non-group events for debugging
      console.log('[zapi-webhook] Received payload:', JSON.stringify(payload, null, 2));
    }
    // ─── FIM LOG RESUMIDO ────────────────────────────────────────────────

    // Check if this is a message status callback
    if (isStatusCb && payload.status && payload.ids) {
      return await handleMessageStatusCallback(supabase, payload);
    }

    // ─── FLUXO DE ENVIO: Captura eventos de grupo (join/leave) ───────────
    // Detect group participant events from TWO Z-API formats:
    // 1) type = GroupParticipantsUpdate / group-participants.update / onGroupParticipantsUpdate
    // 2) type = ReceivedCallback with notification = GROUP_PARTICIPANT_ADD / GROUP_PARTICIPANT_LEAVE / GROUP_PARTICIPANT_REMOVE
    const eventType = payload.type;
    const notification = payload.notification || '';

    const isGroupParticipantsUpdateType =
      eventType === 'GroupParticipantsUpdate' ||
      eventType === 'group-participants.update' ||
      eventType === 'onGroupParticipantsUpdate';

    const isReceivedCallbackGroupEvent =
      eventType === 'ReceivedCallback' &&
      (notification === 'GROUP_PARTICIPANT_ADD' ||
       notification === 'GROUP_PARTICIPANT_LEAVE' ||
       notification === 'GROUP_PARTICIPANT_REMOVE' ||
       notification === 'GROUP_PARTICIPANT_INVITE' ||
       notification === 'GROUP_PARTICIPANT_JOIN');

    if (isGroupParticipantsUpdateType || isReceivedCallbackGroupEvent) {
      let normalizedAction: string;
      let groupJid: string;
      let participants: string[];
      const instanceId = payload.instanceId || '';
      const eventTimestamp = payload.momment || payload.timestamp || Date.now();

      if (isReceivedCallbackGroupEvent) {
        // Format 2: ReceivedCallback with notification field
        // notification: GROUP_PARTICIPANT_ADD | GROUP_PARTICIPANT_LEAVE | GROUP_PARTICIPANT_REMOVE
        const notifAction = notification.replace('GROUP_PARTICIPANT_', '').toLowerCase();
        normalizedAction = notifAction;
        groupJid = payload.phone || payload.chatId || '';
        // Participant comes from participantPhone, notificationParameters (strip @lid), or participant
        const rawParticipants: string[] = [];
        if (payload.participantPhone) rawParticipants.push(payload.participantPhone);
        if (payload.notificationParameters && payload.notificationParameters.length > 0) {
          for (const param of payload.notificationParameters) {
            const cleaned = param.replace(/@lid$/i, '').replace(/@s\.whatsapp\.net$/i, '');
            if (cleaned && !rawParticipants.includes(cleaned)) rawParticipants.push(cleaned);
          }
        }
        if (payload.participant && !rawParticipants.includes(payload.participant)) {
          rawParticipants.push(payload.participant);
        }
        participants = rawParticipants.filter(Boolean);
        console.log(`[zapi-webhook] 📥 ReceivedCallback group event: notification=${notification}, group=${groupJid}, participants=${JSON.stringify(participants)}`);
      } else {
        // Format 1: Dedicated GroupParticipantsUpdate type
        const eventPayload = payload.data || payload;
        const action = eventPayload.action || eventPayload.event || '';
        normalizedAction = String(action).toLowerCase();
        groupJid = eventPayload.chatId || eventPayload.groupId || payload.chatId || payload.groupId || '';
        const participantsRaw = eventPayload.participants || payload.participants || [
          eventPayload.participantPhone,
          eventPayload.participant,
          payload.participantPhone,
          payload.participant,
          payload.phone,
        ].filter(Boolean);
        participants = Array.isArray(participantsRaw) ? participantsRaw : [participantsRaw];
      }

      let eventTenantId: string | null = null;
      let zapiCreds: { zapi_instance_id: string | null; zapi_token: string | null; zapi_client_token: string | null } | null = null;

      if (instanceId) {
        const { data: integ } = await supabase
          .from('integration_whatsapp')
          .select('tenant_id, zapi_instance_id, zapi_token, zapi_client_token')
          .eq('zapi_instance_id', instanceId)
          .eq('is_active', true)
          .maybeSingle();
        if (integ) {
          eventTenantId = integ.tenant_id;
          zapiCreds = { zapi_instance_id: integ.zapi_instance_id, zapi_token: integ.zapi_token, zapi_client_token: integ.zapi_client_token };
        }
      }

      const isJoinEvent = ['add', 'join', 'invite', 'introduced'].includes(normalizedAction);
      const isLeaveEvent = ['remove', 'leave', 'left', 'exit'].includes(normalizedAction);

      if (eventTenantId && groupJid && (isJoinEvent || isLeaveEvent)) {
        const feEventType = isJoinEvent ? 'join' : 'leave';

        // ─── LID Resolution: detect if participants are LIDs (not real phones) ───
        // WhatsApp LIDs are internal identifiers (15+ digits), not phone numbers.
        // Brazilian phones max out at 13 digits (55 + 2 DDD + 9 number).
        const isLid = (val: string): boolean => {
          const digits = normalizeDigits(val);
          return digits.length > 13;
        };

        const hasLidOnly = participants.length > 0 && participants.every(p => isLid(p));

        if (hasLidOnly && zapiCreds?.zapi_instance_id && zapiCreds?.zapi_token) {
          console.log(`[zapi-webhook] 🔍 Participants are LIDs, resolving via group-metadata...`);
          const baseUrlMeta = `https://api.z-api.io/instances/${zapiCreds.zapi_instance_id}/token/${zapiCreds.zapi_token}`;
          const headersMeta: Record<string, string> = { 'Content-Type': 'application/json' };
          if (zapiCreds.zapi_client_token) headersMeta['Client-Token'] = zapiCreds.zapi_client_token;

          try {
            const metaRes = await fetch(`${baseUrlMeta}/group-metadata/${groupJid}`, { method: 'GET', headers: headersMeta });
            const metadata = await metaRes.json();
            console.log(`[zapi-webhook] group-metadata response status=${metaRes.status}, participants count=${metadata?.participants?.length || 0}`);

            if (metadata?.participants && Array.isArray(metadata.participants)) {
              // Get all real phone numbers currently in the group
              const currentGroupPhones = metadata.participants
                .map((p: any) => normalizeParticipantPhone(p.phone))
                .filter((p: string) => p && !isLid(p));

              if (isJoinEvent) {
                // For JOIN: find phones in group that DON'T have a recent join event
                const recentWindow = new Date(Date.now() - 10 * 60 * 1000).toISOString();
                const { data: recentJoins } = await supabase
                  .from('fe_group_events')
                  .select('phone')
                  .eq('tenant_id', eventTenantId)
                  .eq('group_jid', groupJid)
                  .eq('event_type', 'join')
                  .gte('created_at', recentWindow);

                const recentJoinPhones = new Set((recentJoins || []).map((e: any) => e.phone));
                // Also check which phones already had a join event ever (to compare)
                const { data: allKnownEvents } = await supabase
                  .from('fe_group_events')
                  .select('phone, event_type')
                  .eq('tenant_id', eventTenantId)
                  .eq('group_jid', groupJid)
                  .order('created_at', { ascending: false });

                // Build a set of phones that are "known members" (last event was join)
                const knownMembers = new Set<string>();
                const seenPhones = new Set<string>();
                for (const ev of (allKnownEvents || [])) {
                  if (!seenPhones.has(ev.phone)) {
                    seenPhones.add(ev.phone);
                    if (ev.event_type === 'join') knownMembers.add(ev.phone);
                  }
                }

                // New participants = in group now but not known members and not recently joined
                const newPhones = currentGroupPhones.filter((p: string) =>
                  !knownMembers.has(p) && !recentJoinPhones.has(p)
                );

                if (newPhones.length > 0) {
                  participants = newPhones;
                  console.log(`[zapi-webhook] ✅ Resolved LID → real phones for JOIN: ${JSON.stringify(newPhones)}`);
                } else {
                  // Fallback: couldn't determine who's new, skip
                  console.warn(`[zapi-webhook] ⚠️ Could not resolve new participants from LID. Group has ${currentGroupPhones.length} members, ${knownMembers.size} known.`);
                  participants = [];
                }
              } else {
                // For LEAVE: find phones we know as members but NOT in current group
                const { data: allKnownEvents } = await supabase
                  .from('fe_group_events')
                  .select('phone, event_type')
                  .eq('tenant_id', eventTenantId)
                  .eq('group_jid', groupJid)
                  .order('created_at', { ascending: false });

                const knownMembers = new Set<string>();
                const seenPhones = new Set<string>();
                for (const ev of (allKnownEvents || [])) {
                  if (!seenPhones.has(ev.phone)) {
                    seenPhones.add(ev.phone);
                    if (ev.event_type === 'join') knownMembers.add(ev.phone);
                  }
                }

                const currentSet = new Set(currentGroupPhones);
                const leftPhones = Array.from(knownMembers).filter(p => !currentSet.has(p));

                if (leftPhones.length > 0) {
                  participants = leftPhones;
                  console.log(`[zapi-webhook] ✅ Resolved LID → real phones for LEAVE: ${JSON.stringify(leftPhones)}`);
                } else {
                  console.warn(`[zapi-webhook] ⚠️ Could not resolve departed participants from LID.`);
                  participants = [];
                }
              }
            }
          } catch (metaErr: any) {
            console.error(`[zapi-webhook] group-metadata call failed: ${metaErr.message}`);
            participants = []; // Don't process with invalid LID phones
          }
        }
        // ─── FIM LID Resolution ───

        const { data: feGroup } = await supabase
          .from('fe_groups')
          .select('id, group_jid, group_name, participant_count')
          .eq('tenant_id', eventTenantId)
          .eq('group_jid', groupJid)
          .maybeSingle();

        for (const rawPhone of participants) {
          const normalizedPhone = normalizeParticipantPhone(rawPhone);
          if (!normalizedPhone || isLid(normalizedPhone)) continue;

          if (normalizedPhone.length < 10 || normalizedPhone.length > 11) {
            console.warn(`[zapi-webhook] Invalid participant phone resolved from ${rawPhone}: ${normalizedPhone}`);
            continue;
          }

          const dedupeKey = `${eventTenantId}:${groupJid}:${normalizedPhone}:${feEventType}:${eventTimestamp}`;
          if (isDuplicateGroupEvent(dedupeKey)) {
            continue;
          }

          const recentThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: existingEvent } = await supabase
            .from('fe_group_events')
            .select('id')
            .eq('tenant_id', eventTenantId)
            .eq('group_jid', groupJid)
            .eq('phone', normalizedPhone)
            .eq('event_type', feEventType)
            .gte('created_at', recentThreshold)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingEvent) {
            console.log(`[zapi-webhook] Recent duplicate group event skipped for ${normalizedPhone} in ${groupJid}`);
            continue;
          }

          await supabase.from('fe_group_events').insert({
            tenant_id: eventTenantId,
            group_id: feGroup?.id || null,
            group_jid: groupJid,
            phone: normalizedPhone,
            event_type: feEventType,
          });

          console.log(`[zapi-webhook] ✅ Group event recorded: ${feEventType} phone=${normalizedPhone} group=${groupJid}`);

          if (feGroup) {
            const newCount = Math.max(0, (feGroup.participant_count || 0) + (feEventType === 'join' ? 1 : -1));
            feGroup.participant_count = newCount;
            await supabase.from('fe_groups').update({ participant_count: newCount }).eq('id', feGroup.id);

            // Find campaigns this group belongs to
            const { data: campaignLinks } = await supabase
              .from('fe_campaign_groups')
              .select('campaign_id')
              .eq('group_id', feGroup.id);
            const campaignIds = (campaignLinks || []).map((cl: any) => cl.campaign_id);

            // Build OR filter: 
            // 1) group_id matches this specific group
            // 2) group_id is null AND campaign_id is null → "all groups" scope
            // 3) campaign_id matches one of the campaigns this group belongs to
            let orFilter = `group_id.eq.${feGroup.id},and(group_id.is.null,campaign_id.is.null)`;
            if (campaignIds.length > 0) {
              orFilter += `,campaign_id.in.(${campaignIds.join(',')})`;
            }

            const { data: autoMsgs } = await supabase
              .from('fe_auto_messages')
              .select('*')
              .eq('tenant_id', eventTenantId)
              .eq('event_type', feEventType)
              .eq('is_active', true)
              .or(orFilter);

            if (autoMsgs && autoMsgs.length > 0) {
              // Use already-fetched creds or fetch if not available
              const creds = zapiCreds;

              if (creds?.zapi_instance_id && creds?.zapi_token) {
                const baseUrl = `https://api.z-api.io/instances/${creds.zapi_instance_id}/token/${creds.zapi_token}`;
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (creds.zapi_client_token) headers['Client-Token'] = creds.zapi_client_token;

                for (const autoMsg of autoMsgs) {
                  try {
                    const phoneForSend = `55${normalizedPhone}`;
                    let text = autoMsg.content_text || '';
                    text = text.replace(/\{\{phone\}\}/g, normalizedPhone).replace(/\{\{group\}\}/g, feGroup.group_name || groupJid);

                    if (autoMsg.content_type === 'text' && text) {
                      const sendResult = await fetch(`${baseUrl}/send-text`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ phone: phoneForSend, message: text }),
                      });
                      const sendBody = await sendResult.text();
                      console.log(`[zapi-webhook] Auto-message text result for ${feEventType} to ${phoneForSend}: status=${sendResult.status} body=${sendBody.substring(0, 300)}`);
                    } else if (autoMsg.content_type === 'image' && autoMsg.media_url) {
                      const sendResult = await fetch(`${baseUrl}/send-image`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ phone: phoneForSend, image: autoMsg.media_url, caption: text }),
                      });
                      const sendBody = await sendResult.text();
                      console.log(`[zapi-webhook] Auto-message image result for ${feEventType} to ${phoneForSend}: status=${sendResult.status} body=${sendBody.substring(0, 300)}`);
                    }
                  } catch (amErr: any) {
                    console.error('[zapi-webhook] Auto-message error:', amErr.message);
                  }
                }
              } else {
                console.warn(`[zapi-webhook] No Z-API credentials found for tenant ${eventTenantId} to send auto-message`);
              }
            }
          } else {
            console.log(`[zapi-webhook] Group ${groupJid} not registered in fe_groups for tenant ${eventTenantId}, event recorded without auto-message`);
          }
        }

        console.log(`[zapi-webhook] Group event processed: ${feEventType} in ${groupJid} (${participants.length} participants)`);
        return new Response(JSON.stringify({ success: true, event: feEventType, group: groupJid }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[zapi-webhook] Group event ignored (tenant=${eventTenantId}, group=${groupJid}, action=${normalizedAction})`);
      return new Response(JSON.stringify({ success: true, skipped: 'group_event_no_tenant_or_action' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // ─── FIM: Captura eventos de grupo ───────────────────────────────────

    // Extract message text
    const messageText = payload.text?.message || payload.message || '';
    const isGroup = payload.isGroup || payload.chatId?.includes('@g.us') || false;
    const fromMe = payload.fromMe || false;
    
    // Skip messages sent by us
    if (fromMe) {
      console.log('[zapi-webhook] Ignoring message sent by us');
      return new Response(JSON.stringify({ success: true, skipped: 'fromMe' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract phone number (participantPhone for groups, phone for direct chat)
    const senderPhone = payload.participantPhone || payload.senderPhone || payload.phone || '';
    const groupName = payload.chatName || '';
    const groupId = payload.chatId || '';

    // Get messageId for deduplication (Z-API may send messageId or zapiMessageId)
    const messageId = payload.messageId || payload.zapiMessageId;

    // Check for duplicate message BEFORE processing (in-memory cache - fast path)
    if (isDuplicateMessage(messageId, senderPhone, messageText)) {
      console.log(`[zapi-webhook] ⏭️ Skipping duplicate message from ${senderPhone} (in-memory)`);
      return new Response(JSON.stringify({ 
        success: true, 
        skipped: 'duplicate_message',
        messageId: messageId || 'no_id'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DATABASE-LEVEL deduplication (handles multiple Edge Function instances)
    // This catches duplicates that in-memory cache misses when Z-API sends
    // the same webhook to different function instances
    if (messageId) {
      // ─── TRAVA DE BANCO: pg_advisory_xact_lock via messageId ────────────────
      // Converte o messageId em um bigint determinístico para usar como lock key.
      // Isso garante que duas instâncias concorrentes da Edge Function com o mesmo
      // messageId não processem o webhook ao mesmo tempo (race condition).
      const { data: lockResult, error: lockError } = await supabase.rpc(
        'acquire_message_advisory_lock',
        { p_message_id: messageId }
      );

      if (lockError) {
        console.warn(`[zapi-webhook] Advisory lock RPC error (non-fatal): ${lockError.message}`);
        // Se a função RPC não existir ainda, continua com verificação simples
      } else if (lockResult === false) {
        // Outra instância já está processando este messageId
        console.log(`[zapi-webhook] 🔒 Advisory lock NEGADO para messageId ${messageId} — descartando duplicata`);
        return new Response(JSON.stringify({
          success: true,
          skipped: 'advisory_lock_denied',
          messageId
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verificação adicional no banco (para casos onde o lock passou mas o registro já existe)
      const { data: existingMsg } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('zapi_message_id', messageId)
        .maybeSingle();
      
      if (existingMsg) {
        console.log(`[zapi-webhook] ⏭️ Skipping duplicate message from ${senderPhone} (DB-level, messageId: ${messageId})`);
        return new Response(JSON.stringify({ 
          success: true, 
          skipped: 'duplicate_message_db',
          messageId
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log(`[zapi-webhook] Message: "${messageText}", From: ${senderPhone}, Group: ${groupName}, IsGroup: ${isGroup}, MessageId: ${messageId || 'N/A'}`);

     // IMPORTANT: Check for confirmation responses (SIM/OK) from PRIVATE messages FIRST
     // This handles the two-step message flow where customer replies to confirm checkout link
    if (!isGroup) {
       const confirmationResult = await handleConfirmationResponse(supabase, senderPhone, messageText, payload.instanceId);
       if (confirmationResult.handled) {
         console.log(`[zapi-webhook] ✅ Confirmation response handled for ${senderPhone}`);
         return new Response(JSON.stringify({ 
           success: true, 
           confirmation_handled: true,
           result: confirmationResult
         }), {
           headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         });
       }
       
       // If not a confirmation response, skip - only group messages create orders
       console.log('[zapi-webhook] ⏭️ Private message not a confirmation - only group messages create orders');
       return new Response(JSON.stringify({ 
         success: true, 
         skipped: 'not_a_group_message',
         reason: 'Orders are only created from WhatsApp group messages'
       }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
    }

    // Recognize product codes with optional quantity:
    // Formats: C76126x2, C76126 x2, 2xC76126, 2x C76126, C76126X2, etc.
    // Also plain: C76126 (qty=1)
    // Supports variants with "/" or "-": C370/24, C014-1
    const productEntries: Array<{ code: string; qty: number }> = [];

    // Code suffix capture: digits, optionally followed by /NN or -NN (variants like /24, -1)
    // Pattern 1: code first, then optional quantity — C76126x2, C014-1x2, C370/24 x2
    const codeFirstRegex = /\b[Cc](\d{1,6}(?:[\/\-]\d{1,3})?)\s*[xX]\s*(\d{1,3})\b/g;
    // Pattern 2: quantity first, then code — 2xC76126, 2xC014-1, 2xC370/24
    const qtyFirstRegex = /\b(\d{1,3})\s*[xX]\s*[Cc](\d{1,6}(?:[\/\-]\d{1,3})?)\b/g;
    // Pattern 3: plain code without quantity — C76126, C014-1, C370/24
    const plainCodeRegex = /\b[Cc](\d{1,6}(?:[\/\-]\d{1,3})?)/g;

    const processedCodes = new Set<string>();
    let match;

    // First pass: "C76126x2" style
    while ((match = codeFirstRegex.exec(messageText)) !== null) {
      const normalized = `C${match[1]}`;
      const qty = Math.max(1, Math.min(parseInt(match[2], 10), 99));
      if (!processedCodes.has(normalized)) {
        processedCodes.add(normalized);
        productEntries.push({ code: normalized, qty });
      }
    }

    // Second pass: "2xC76126" style
    while ((match = qtyFirstRegex.exec(messageText)) !== null) {
      const normalized = `C${match[2]}`;
      const qty = Math.max(1, Math.min(parseInt(match[1], 10), 99));
      if (!processedCodes.has(normalized)) {
        processedCodes.add(normalized);
        productEntries.push({ code: normalized, qty });
      }
    }

    // Third pass: plain "C76126" (only if not already matched with quantity)
    // Prefer the longer/more specific match: if "C370/24" was captured, don't also add "C370".
    const plainMatches: string[] = [];
    while ((match = plainCodeRegex.exec(messageText)) !== null) {
      plainMatches.push(`C${match[1]}`);
    }
    // Sort by length DESC so variants come first (C370/24 before C370)
    plainMatches.sort((a, b) => b.length - a.length);
    for (const normalized of plainMatches) {
      // Skip if a more specific variant of this code was already added
      const hasMoreSpecific = Array.from(processedCodes).some(
        c => c !== normalized && c.startsWith(normalized) && (c[normalized.length] === '/' || c[normalized.length] === '-')
      );
      if (!processedCodes.has(normalized) && !hasMoreSpecific) {
        processedCodes.add(normalized);
        productEntries.push({ code: normalized, qty: 1 });
      }
    }

    const productCodes = productEntries.map(e => e.code);

    if (productEntries.length === 0) {
      console.log('[zapi-webhook] No product codes found in message');
      return new Response(JSON.stringify({ success: true, skipped: 'no_product_codes' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[zapi-webhook] Found product entries: ${productEntries.map(e => `${e.code}x${e.qty}`).join(', ')}`);

    // Normalize phone number (remove country code if present)
    const normalizedPhone = normalizePhone(senderPhone);
    
    if (!normalizedPhone) {
      console.log('[zapi-webhook] Invalid phone number');
      return new Response(JSON.stringify({ success: false, error: 'invalid_phone' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Identify tenant (MUST be tied to the Z-API instance that received the message)
    // Priority:
    // 1) payload.instanceId -> integration_whatsapp.zapi_instance_id (prevents cross-tenant leakage)
    // 2) group mapping (customer_whatsapp_groups)
    // 3) customer phone mapping (customers)
    let tenantId: string | null = null;

    if (payload.instanceId) {
      const { data: integrations, error: instErr } = await supabase
        .from('integration_whatsapp')
        .select('tenant_id')
        .eq('provider', 'zapi')
        .eq('is_active', true)
        .eq('zapi_instance_id', payload.instanceId);

      if (instErr) {
        console.log('[zapi-webhook] Error looking up tenant by instanceId:', instErr);
      } else if ((integrations?.length || 0) === 1) {
        tenantId = integrations![0].tenant_id;
        console.log(`[zapi-webhook] Found tenant by instanceId (${payload.instanceId}): ${tenantId}`);
      } else if ((integrations?.length || 0) > 1) {
        console.log(`[zapi-webhook] ERROR: instanceId ${payload.instanceId} is linked to multiple tenants (${integrations?.length}). Aborting.`);
        return new Response(JSON.stringify({ success: false, error: 'instance_id_conflict' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        console.log(`[zapi-webhook] No active integration found for instanceId ${payload.instanceId}`);
      }
    }

    if (!tenantId && groupName) {
      const { data: groupData } = await supabase
        .from('customer_whatsapp_groups')
        .select('tenant_id')
        .eq('whatsapp_group_name', groupName)
        .limit(1)
        .maybeSingle();

      if (groupData) {
        tenantId = groupData.tenant_id;
        console.log(`[zapi-webhook] Found tenant by group name: ${tenantId}`);
      }
    }

    if (!tenantId) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('tenant_id')
        .eq('phone', normalizedPhone)
        .limit(1)
        .maybeSingle();

      if (customerData) {
        tenantId = customerData.tenant_id;
        console.log(`[zapi-webhook] Found tenant by customer phone: ${tenantId}`);
      }
    }

    if (!tenantId) {
      console.log('[zapi-webhook] Could not identify tenant');
      return new Response(JSON.stringify({ success: false, error: 'tenant_not_found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================
    // AUTO-VINCULAÇÃO DE GRUPO (GROUP OWNERSHIP)
    // Previne vazamento cross-tenant automaticamente.
    // O primeiro tenant a processar um comando válido em um grupo torna-se "dono".
    // Mensagens de outros tenants para o mesmo grupo são descartadas.
    // ==========================================
    if (isGroup && groupId && tenantId) {
      const { data: ownership, error: owErr } = await supabase
        .from('whatsapp_group_ownership')
        .select('owner_tenant_id')
        .eq('group_id', groupId)
        .maybeSingle();

      if (!owErr && ownership) {
        // Grupo já tem dono
        if (ownership.owner_tenant_id !== tenantId) {
          console.log(`[zapi-webhook] ⛔ Group "${groupName}" (${groupId}) pertence ao tenant ${ownership.owner_tenant_id}, mas a instância é do tenant ${tenantId}. DESCARTANDO.`);
          return new Response(JSON.stringify({
            success: true,
            skipped: 'group_owned_by_another_tenant',
            group: groupName,
            owner: ownership.owner_tenant_id,
            requester: tenantId
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        console.log(`[zapi-webhook] ✅ Group "${groupName}" pertence ao tenant ${tenantId} (confirmado)`);
      } else if (!owErr && !ownership) {
        // Grupo novo — registrar ownership para este tenant (first-come-first-served)
        const { error: insertErr } = await supabase
          .from('whatsapp_group_ownership')
          .insert({
            group_id: groupId,
            group_name: groupName || null,
            owner_tenant_id: tenantId,
            instance_id: payload.instanceId || null,
          });

        if (insertErr) {
          // Conflito de UNIQUE = outro tenant registrou primeiro (race condition)
          if (insertErr.code === '23505') {
            console.log(`[zapi-webhook] ⛔ Race condition: group "${groupName}" foi registrado por outro tenant. DESCARTANDO.`);
            return new Response(JSON.stringify({
              success: true,
              skipped: 'group_ownership_race_lost',
              group: groupName
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          console.warn(`[zapi-webhook] Erro ao registrar ownership do grupo: ${insertErr.message}`);
        } else {
          console.log(`[zapi-webhook] 🆕 Group "${groupName}" (${groupId}) registrado como propriedade do tenant ${tenantId}`);
        }
      }
    }

    // ==========================================
    // ALLOWED GROUPS FILTER (complementar ao ownership)
    // Se o tenant configurou grupos permitidos, filtra adicionalmente.
    // ==========================================
    if (isGroup && groupName && tenantId) {
      const { data: allowedGroups, error: agErr } = await supabase
        .from('whatsapp_allowed_groups')
        .select('group_name')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (!agErr && allowedGroups && allowedGroups.length > 0) {
        const isAllowed = allowedGroups.some(
          (ag: { group_name: string }) => groupName.toLowerCase().includes(ag.group_name.toLowerCase()) || ag.group_name.toLowerCase().includes(groupName.toLowerCase())
        );

        if (!isAllowed) {
          console.log(`[zapi-webhook] ℹ️ Group "${groupName}" is NOT in allowed groups for tenant ${tenantId}, but processing anyway (non-blocking).`);
        }
      }
    }

    // EARLY LOG: Insert webhook log BEFORE processing items
    // This ensures deduplication works across multiple Edge Function instances
    // ALWAYS insert - even without messageId - to enable DB-level dedup
    const earlyLogMessage = `[WEBHOOK] Processado: ${messageText}`;
    
    if (messageId) {
      await supabase.from('whatsapp_messages').insert({
        tenant_id: tenantId,
        phone: normalizedPhone,
        message: earlyLogMessage,
        type: 'incoming',
        whatsapp_group_name: groupName || null,
        received_at: new Date().toISOString(),
        zapi_message_id: messageId,
      });
    } else {
      // Without messageId: check DB for recent duplicate (same phone + same message within 15s)
      const fifteenSecondsAgo = new Date(Date.now() - 15000).toISOString();
      const { data: recentDup } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('phone', normalizedPhone)
        .eq('message', earlyLogMessage)
        .gte('created_at', fifteenSecondsAgo)
        .limit(1)
        .maybeSingle();
      
      if (recentDup) {
        console.log(`[zapi-webhook] ⏭️ Skipping duplicate message from ${normalizedPhone} (DB-level, no messageId, matched recent log)`);
        return new Response(JSON.stringify({ 
          success: true, 
          skipped: 'duplicate_message_db_no_id'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Insert early log for future dedup
      await supabase.from('whatsapp_messages').insert({
        tenant_id: tenantId,
        phone: normalizedPhone,
        message: earlyLogMessage,
        type: 'incoming',
        whatsapp_group_name: groupName || null,
        received_at: new Date().toISOString(),
      });
    }

    // Process each product code
    const results = [];
    for (const entry of productEntries) {
      const code = entry.code;
      const requestedQty = entry.qty;
      const codeUpper = code.toUpperCase();
      
      // DEDUPLICATION: Check if this product was already processed for THIS message
      // This prevents duplicates when Z-API sends the same webhook multiple times
      if (isProductAlreadyProcessedForMessage(messageId, senderPhone, messageText, codeUpper)) {
        console.log(`[zapi-webhook] ⏭️ SKIPPING product ${codeUpper} - already processed for this message`);
        results.push({ 
          code: codeUpper, 
          success: true, 
          skipped: 'already_processed_for_message'
        });
        continue;
      }
      
      // Try to find product by exact code first
      let product = null;
      let productError = null;
      
      // IMPROVED: Search using TRIM to handle codes with trailing spaces in DB
      // Uses raw SQL filter to trim whitespace from both sides
      const searchPatterns = [
        codeUpper,                    // Exact: C345
        `${codeUpper} `,              // With trailing space: "C345 "
        ` ${codeUpper}`,              // With leading space
        `${codeUpper}  `,             // With double trailing space
      ];
      
      // Try exact match first (most common case)
      let { data: exactProduct } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .ilike('code', codeUpper)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      
      if (exactProduct) {
        product = exactProduct;
      }
      
      // If not found, try with trailing space (common data entry issue)
      if (!product) {
        const { data: spaceProduct } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .or(`code.ilike.${codeUpper} ,code.ilike.${codeUpper}  `)
          .limit(1)
          .maybeSingle();
        
        if (spaceProduct) {
          product = spaceProduct;
          console.log(`[zapi-webhook] ⚠️ Found product with trailing space in code: "${spaceProduct.code}"`);
        }
      }
      
      // Try with C prefix if not found and code doesn't start with C
      if (!product && !codeUpper.startsWith('C')) {
        const cPrefixCode = 'C' + codeUpper;
        const { data: cPrefixProduct } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .or(`code.ilike.${cPrefixCode},code.ilike.${cPrefixCode} ,code.ilike.${cPrefixCode}  `)
          .limit(1)
          .maybeSingle();
        
        if (cPrefixProduct) {
          product = cPrefixProduct;
        }
      }
      
      // Try without C prefix if code starts with C
      if (!product && codeUpper.startsWith('C')) {
        const withoutC = codeUpper.substring(1);
        const { data: noPrefixProduct } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .or(`code.ilike.${withoutC},code.ilike.${withoutC} ,code.ilike.${withoutC}  `)
          .limit(1)
          .maybeSingle();
        
        if (noPrefixProduct) {
          product = noPrefixProduct;
        }
      }

      if (!product) {
        console.log(`[zapi-webhook] Product not found: ${codeUpper}`);

        // ============================================================
        // AMBIGUITY DETECTION: Log when customer sends a partial code (e.g. "C370")
        // and we have variants like "C370/14", "C370/24" registered.
        // NOTE: Bot does NOT reply in group - admin must handle manually.
        // ============================================================
        if (isGroup && groupId && !codeUpper.includes('/') && !codeUpper.includes('-')) {
          const { data: variants } = await supabase
            .from('products')
            .select('code, name')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .or(`code.ilike.${codeUpper}/%,code.ilike.${codeUpper}-%`)
            .limit(20);

          if (variants && variants.length > 1) {
            console.log(`[zapi-webhook] 🤔 Ambiguous code ${codeUpper}: found ${variants.length} variants - NOT sending group reply per config`);
            results.push({ code: codeUpper, success: false, error: 'ambiguous_code', variants: variants.length });
            continue;
          }
        }

        results.push({ code: codeUpper, success: false, error: 'product_not_found' });
        continue;
      }

      console.log(`[zapi-webhook] Found product: ${product.name} (${product.code}) - R$ ${product.price} - Estoque: ${product.stock}`);

      // Re-read stock fresh from DB to avoid stale data from race conditions
      const { data: freshProduct } = await supabase
        .from('products')
        .select('stock')
        .eq('id', product.id)
        .single();
      
      if (freshProduct) {
        product.stock = freshProduct.stock;
      }

      // STOCK VALIDATION: Block if no stock available
      if (product.stock <= 0) {
        console.log(`[zapi-webhook] ❌ ESTOQUE ESGOTADO para ${product.code}: estoque atual = ${product.stock}`);
        
        // Send out of stock message to customer via Z-API
        try {
          const { data: whatsappConfig } = await supabase
            .from('integration_whatsapp')
            .select('zapi_instance_id, zapi_token, zapi_client_token, is_active, send_out_of_stock_msg')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .maybeSingle();
          
          // Check if out of stock messages are enabled
          if (whatsappConfig?.send_out_of_stock_msg === false) {
            console.log(`[zapi-webhook] ⏭️ Mensagem de estoque esgotado desativada para este tenant`);
          } else if (whatsappConfig?.zapi_instance_id && whatsappConfig?.zapi_token) {
            const baseOutOfStockMessage = `😔 *Produto Esgotado*\n\nO produto *${product.name}* (código *${product.code}*) acabou no momento.💚`;
            const outOfStockMessage = addMessageVariation(baseOutOfStockMessage);
            
            // Format phone for Z-API (needs 55 prefix)
            const phoneForZapi = normalizedPhone.startsWith('55') ? normalizedPhone : `55${normalizedPhone}`;
            
            // Simulate typing indicator before sending
            console.log(`[zapi-webhook] Simulating typing for out-of-stock message to ${phoneForZapi}...`);
            await simulateTyping(
              whatsappConfig.zapi_instance_id,
              whatsappConfig.zapi_token,
              whatsappConfig.zapi_client_token,
              phoneForZapi
            );
            
            // Apply anti-block delay before sending (1-4 seconds)
            const delayMs = await antiBlockDelay(1000, 4000);
            logAntiBlockDelay('zapi-webhook (out-of-stock)', delayMs);
            
            const zapiUrl = `https://api.z-api.io/instances/${whatsappConfig.zapi_instance_id}/token/${whatsappConfig.zapi_token}/send-text`;
            
            const sendResponse = await fetch(zapiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Client-Token': whatsappConfig.zapi_client_token || ''
              },
              body: JSON.stringify({
                phone: phoneForZapi,
                message: outOfStockMessage
              })
            });
            
            const sendResult = await sendResponse.json();
            console.log(`[zapi-webhook] 📤 Mensagem de estoque esgotado enviada para ${phoneForZapi}:`, sendResult);
            
            // Log the outgoing message
            await supabase.from('whatsapp_messages').insert({
              tenant_id: tenantId,
              phone: normalizedPhone,
              message: outOfStockMessage,
              type: 'outgoing',
              product_name: product.name,
              sent_at: new Date().toISOString(),
            });
          } else {
            console.log(`[zapi-webhook] WhatsApp não configurado para enviar mensagem de estoque esgotado`);
          }
        } catch (msgError) {
          console.error(`[zapi-webhook] Erro ao enviar mensagem de estoque esgotado:`, msgError);
        }
        
        results.push({ 
          code: codeUpper, 
          success: false, 
          error: 'out_of_stock',
          product_name: product.name,
          current_stock: product.stock,
          message_sent: true
        });
        continue;
      }

      // Find or create customer
      let customer = await findOrCreateCustomer(supabase, tenantId, normalizedPhone, payload.senderName || '');

      // ===== BLOCKED CUSTOMER CHECK =====
      // Check if this customer is blocked BEFORE processing any cart/order logic
      if (customer?.is_blocked) {
        console.log(`[zapi-webhook] 🚫 BLOCKED customer ${normalizedPhone} tried to order ${codeUpper} in tenant ${tenantId}`);
        
        // Send blocked customer message
        try {
          const { data: whatsappConfig } = await supabase
            .from('integration_whatsapp')
            .select('zapi_instance_id, zapi_token, zapi_client_token, is_active')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .maybeSingle();

          // Try to get custom template from whatsapp_templates
          const { data: blockedTemplate } = await supabase
            .from('whatsapp_templates')
            .select('content')
            .eq('tenant_id', tenantId)
            .eq('type', 'BLOCKED_CUSTOMER')
            .maybeSingle();

          if (whatsappConfig?.zapi_instance_id && whatsappConfig?.zapi_token) {
            const defaultBlockedMsg = 'Olá! Identificamos uma restrição em seu cadastro que impede a realização de novos pedidos no momento. ⛔\n\nPara entender melhor o motivo ou solicitar uma reavaliação, por favor, entre em contato diretamente com o suporte da loja.';
            const blockedMessage = addMessageVariation(blockedTemplate?.content || defaultBlockedMsg);
            
            const phoneForZapi = normalizedPhone.startsWith('55') ? normalizedPhone : `55${normalizedPhone}`;
            
            await simulateTyping(
              whatsappConfig.zapi_instance_id,
              whatsappConfig.zapi_token,
              whatsappConfig.zapi_client_token,
              phoneForZapi
            );
            
            const delayMs = await antiBlockDelay(1000, 4000);
            logAntiBlockDelay('zapi-webhook (blocked-customer)', delayMs);
            
            const zapiUrl = `https://api.z-api.io/instances/${whatsappConfig.zapi_instance_id}/token/${whatsappConfig.zapi_token}/send-text`;
            
            await fetch(zapiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Client-Token': whatsappConfig.zapi_client_token || ''
              },
              body: JSON.stringify({
                phone: phoneForZapi,
                message: blockedMessage
              })
            });
            
            console.log(`[zapi-webhook] 📤 Blocked customer message sent to ${phoneForZapi}`);
            
            await supabase.from('whatsapp_messages').insert({
              tenant_id: tenantId,
              phone: normalizedPhone,
              message: `[BLOQUEADO] ${blockedMessage}`,
              type: 'outgoing',
              product_name: product.name,
              sent_at: new Date().toISOString(),
            });
          }
        } catch (msgError) {
          console.error(`[zapi-webhook] Error sending blocked customer message:`, msgError);
        }
        
        results.push({ 
          code: codeUpper, 
          success: false, 
          error: 'customer_blocked',
          product_name: product.name,
          customer_phone: normalizedPhone
        });
        continue;
      }

      // Determine event type based on product sale_type
      // BAZAR or AMBOS products → BAZAR event type (automatic orders are always BAZAR)
      // LIVE products → LIVE event type
      const eventType = product.sale_type === 'LIVE' ? 'LIVE' : 'BAZAR';

      // Find or create cart for this customer
      let cart = await findOrCreateCart(supabase, tenantId, normalizedPhone, groupName, eventType);

      // Check if this cart belongs to a CANCELLED order - if so, create a NEW cart/order
      const { data: cancelledOrder } = await supabase
        .from('orders')
        .select('id, is_cancelled')
        .eq('tenant_id', tenantId)
        .eq('cart_id', cart.id)
        .eq('is_cancelled', true)
        .maybeSingle();

      if (cancelledOrder) {
        console.log(`[zapi-webhook] ⚠️ Cart ${cart.id} pertence ao pedido cancelado #${cancelledOrder.id}. Criando NOVO carrinho e pedido...`);
        
        // Force create a new cart (bypass the existing one)
        const today = getBrasiliaDateISO();
        const { data: newCart, error: newCartError } = await supabase
          .from('carts')
          .insert({
            tenant_id: tenantId,
            customer_phone: normalizedPhone,
            event_date: today,
            event_type: eventType,
            status: 'OPEN',
            whatsapp_group_name: groupName || null,
          })
          .select()
          .single();

        if (newCartError || !newCart) {
          console.log(`[zapi-webhook] ❌ Erro ao criar novo carrinho: ${newCartError?.message}`);
          results.push({ 
            code: codeUpper, 
            success: false, 
            error: 'cart_creation_error',
            product_name: product.name
          });
          continue;
        }

        console.log(`[zapi-webhook] ✅ Novo carrinho criado: ${newCart.id} (substituindo cart ${cart.id} do pedido cancelado)`);
        cart = newCart;
      }

      // Find or create order for this cart
      const order = await findOrCreateOrder(supabase, tenantId, normalizedPhone, cart.id, groupName, eventType, customer?.name || null);

      // ATOMIC UPSERT: Prevents race conditions when multiple messages arrive simultaneously
      // Uses PostgreSQL's ON CONFLICT to handle concurrent inserts safely
      
      // First, check if product already exists in cart
      // IMPORTANT: Use .order + .limit(1) instead of .maybeSingle() to avoid error
      // when duplicate rows already exist (maybeSingle fails with multiple rows,
      // causing existingItem=null, which creates MORE duplicates — cascading bug)
      const { data: existingItems } = await supabase
        .from('cart_items')
        .select('id, qty, created_at')
        .eq('cart_id', cart.id)
        .eq('product_id', product.id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      const existingItem = existingItems && existingItems.length > 0 ? existingItems[0] : null;

      let cartItem;
      let wasSkipped = false;
      
      if (existingItem) {
      // ─── TRAVA DE TEMPO: só aplica quando qty=1 (sem quantidade explícita) ──────────────
      // Quando o cliente digita "C76126x2" ou "2xC76126", requestedQty > 1 e a trava é ignorada.
      // Isso permite adicionar múltiplas unidades explicitamente sem ser bloqueado pela proteção de duplicidade.
      if (requestedQty === 1) {
        const itemCreatedAt = new Date(existingItem.created_at).getTime();
        const elapsedMs = Date.now() - itemCreatedAt;
        const oneSecondMs = 1 * 1000;
        const thirtySecondsMs = 30 * 1000;
        
        if (elapsedMs < oneSecondMs) {
          console.log(`[zapi-webhook] 🔒 TRAVA 1s: produto ${product.code} adicionado há ${elapsedMs}ms — descartando duplicata de webhook`);
          results.push({ 
            code, 
            success: true, 
            skipped: 'webhook_duplicate_1s',
            product_name: product.name,
            cart_id: cart.id,
            existing_qty: existingItem.qty,
            elapsed_ms: elapsedMs
          });
          continue;
        }

        if (elapsedMs < thirtySecondsMs) {
          console.log(`[zapi-webhook] ⏭️ SKIPPING duplicate product ${product.code} - already added ${Math.round(elapsedMs / 1000)}s ago`);
          results.push({ 
            code, 
            success: true, 
            skipped: 'recent_duplicate',
            product_name: product.name,
            cart_id: cart.id,
            existing_qty: existingItem.qty,
            seconds_ago: Math.round(elapsedMs / 1000)
          });
          continue;
        }
      } else {
        console.log(`[zapi-webhook] 🔢 Quantidade explícita (${requestedQty}x) — ignorando trava de duplicidade para ${product.code}`);
      }
        
        // STOCK VALIDATION: Re-read fresh stock to prevent race condition
        const { data: freshStockCheck } = await supabase
          .from('products')
          .select('stock')
          .eq('id', product.id)
          .single();
        
        const currentStock = freshStockCheck?.stock ?? product.stock;
        const newQty = existingItem.qty + requestedQty;
        if (newQty > currentStock) {
          console.log(`[zapi-webhook] ❌ ESTOQUE INSUFICIENTE para +${requestedQty} ${product.code}: estoque=${currentStock}, qty atual=${existingItem.qty}`);
          results.push({ 
            code, 
            success: false, 
            error: 'insufficient_stock',
            product_name: product.name,
            current_stock: currentStock,
            requested_qty: newQty
          });
          continue;
        }
        
        // Product exists and was added more than 30 seconds ago - customer genuinely wants more
        const { data: updatedItem, error: updateError } = await supabase
          .from('cart_items')
          .update({
            qty: newQty,
            unit_price: (product.promotional_price && product.promotional_price > 0) ? product.promotional_price : product.price,
            product_name: product.name,
            product_code: product.code,
            product_image_url: product.image_url,
          })
          .eq('id', existingItem.id)
          .select()
          .single();

        if (updateError) {
          console.log(`[zapi-webhook] Error updating cart item:`, updateError);
          results.push({ code, success: false, error: 'cart_item_update_error' });
          continue;
        }
        cartItem = updatedItem;
        
        // ATOMIC STOCK DECREMENT: Only decrement by requestedQty
        const { data: stockRows, error: stockError } = await supabase
          .from('products')
          .update({ stock: currentStock - requestedQty })
          .eq('id', product.id)
          .gte('stock', requestedQty)
          .select('stock');
        
        if (stockError || !stockRows || stockRows.length === 0) {
          console.log(`[zapi-webhook] ❌ ATOMIC stock decrement failed for ${product.code}: stock insufficient or error`);
          // Rollback cart item update
          await supabase.from('cart_items').update({ qty: existingItem.qty }).eq('id', existingItem.id);
          results.push({ code, success: false, error: 'stock_race_condition', product_name: product.name });
          continue;
        } else {
          console.log(`[zapi-webhook] ✅ Estoque decrementado atomicamente: ${product.code} -${requestedQty} -> ${stockRows[0].stock}`);
        }
        
        console.log(`[zapi-webhook] Updated existing cart item: ${cartItem.id}, new qty: ${cartItem.qty}`);
      } else {
        // Try to insert new item - use a transaction-safe approach with retry
        // to handle race conditions where another request inserted just before us
        
        // Pre-check: Re-read fresh stock before inserting
        const { data: preCheckStock } = await supabase
          .from('products')
          .select('stock')
          .eq('id', product.id)
          .single();
        
        if (!preCheckStock || preCheckStock.stock < requestedQty) {
          console.log(`[zapi-webhook] ❌ ESTOQUE ESGOTADO (pre-check) para novo item ${product.code}: estoque real=${preCheckStock?.stock}`);
          results.push({ 
            code, 
            success: false, 
            error: 'out_of_stock',
            product_name: product.name,
            current_stock: 0
          });
          
          // Send out of stock message
          if (whatsappConfig?.send_out_of_stock_msg !== false) {
            const outOfStockMsg = `❌ *Produto Esgotado!*\n\nO produto *${product.name}* (${product.code}) está esgotado.\n\nDesculpe pelo inconveniente! 😔`;
            await sendZAPIMessage(supabase, tenantId, senderPhone, outOfStockMsg);
          }
          continue;
        }
        
        // First attempt: try to insert
        const { data: newItem, error: cartItemError } = await supabase
          .from('cart_items')
          .insert({
            cart_id: cart.id,
            product_id: product.id,
            qty: requestedQty,
            unit_price: (product.promotional_price && product.promotional_price > 0) ? product.promotional_price : product.price,
            tenant_id: tenantId,
            product_name: product.name,
            product_code: product.code,
            product_image_url: product.image_url,
          })
          .select()
          .single();

        if (cartItemError) {
          // Check if it's a duplicate key error (race condition)
          if (cartItemError.code === '23505' || cartItemError.message?.includes('duplicate') || cartItemError.message?.includes('unique')) {
            console.log(`[zapi-webhook] 🔄 Race condition detected for ${product.code} - checking existing item`);
            
            // Another request inserted this product - fetch it and check if we should skip
            const { data: raceItem } = await supabase
              .from('cart_items')
              .select('id, qty, created_at')
              .eq('cart_id', cart.id)
              .eq('product_id', product.id)
              .maybeSingle();
            
            if (raceItem) {
              const itemCreatedAt = new Date(raceItem.created_at).getTime();
              const thirtySecondsAgo = Date.now() - (30 * 1000);
              
              if (itemCreatedAt > thirtySecondsAgo) {
                // Item was just created by another request - skip
                console.log(`[zapi-webhook] ⏭️ SKIPPING (race) duplicate product ${product.code} - already added by concurrent request`);
                results.push({ 
                  code, 
                  success: true, 
                  skipped: 'race_condition_duplicate',
                  product_name: product.name,
                  cart_id: cart.id,
                  existing_qty: raceItem.qty
                });
                continue;
              }
            }
          }
          
          console.log(`[zapi-webhook] Error adding cart item:`, cartItemError);
          results.push({ code, success: false, error: 'cart_item_error' });
          continue;
        }
        
        cartItem = newItem;
        
        // ATOMIC STOCK DECREMENT: Re-read fresh stock then decrement only if stock > 0
        const { data: freshStockForNew } = await supabase
          .from('products')
          .select('stock')
          .eq('id', product.id)
          .single();
        const freshStockVal = freshStockForNew?.stock ?? product.stock;
        
        const { data: stockRows, error: stockError } = await supabase
          .from('products')
          .update({ stock: freshStockVal - requestedQty })
          .eq('id', product.id)
          .gte('stock', requestedQty)
          .select('stock');
        
        if (stockError || !stockRows || stockRows.length === 0) {
          console.log(`[zapi-webhook] ❌ ATOMIC stock decrement failed for ${product.code}: stock already 0 or error`);
          // Rollback: delete the cart item we just inserted
          await supabase.from('cart_items').delete().eq('id', cartItem.id);
          results.push({ code, success: false, error: 'stock_race_condition', product_name: product.name });
          continue;
        } else {
          console.log(`[zapi-webhook] ✅ Estoque decrementado atomicamente: ${product.code} -> ${stockRows[0].stock}`);
        }
        
        console.log(`[zapi-webhook] Added new item to cart: ${cartItem.id}`);
      }

      // Update order total
      await updateOrderTotal(supabase, order.id);

      // The trigger on cart_items will automatically send the item added message
      results.push({ 
        code, 
        success: true, 
        product_name: product.name,
        price: product.price,
        cart_id: cart.id,
        order_id: order.id,
        cart_item_id: cartItem.id 
      });
    }

    // Log the webhook processing (only if we didn't already log with messageId above)
    if (!messageId) {
      await supabase.from('whatsapp_messages').insert({
        tenant_id: tenantId,
        phone: normalizedPhone,
        message: `[WEBHOOK] Processado: ${messageText}`,
        type: 'incoming',
        whatsapp_group_name: groupName || null,
        received_at: new Date().toISOString(),
      });
    }

    console.log(`[zapi-webhook] Processing complete. Results:`, results);

    return new Response(JSON.stringify({ 
      success: true, 
      processed: results.length,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[zapi-webhook] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Handle message status callbacks from Z-API
async function handleMessageStatusCallback(supabase: any, payload: ZAPIWebhookPayload) {
  const { status, ids, phone } = payload;
  
  console.log(`[zapi-webhook] Message status callback: ${status} for ${ids?.length || 0} message(s)`);

  if (!ids || ids.length === 0) {
    return new Response(JSON.stringify({ success: true, skipped: 'no_message_ids' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Map Z-API status to our status
  // SENT = enviada, RECEIVED = entregue (✓✓), READ = lida
  const deliveryStatus = status || 'UNKNOWN';
  const isDelivered = ['RECEIVED', 'READ', 'PLAYED'].includes(deliveryStatus);

  // Update all messages with these IDs
  for (const messageId of ids) {
    // Update the whatsapp_messages table
    const { data: messages, error: msgError } = await supabase
      .from('whatsapp_messages')
      .update({ delivery_status: deliveryStatus })
      .eq('zapi_message_id', messageId)
      .select('order_id, type');

    if (msgError) {
      console.log(`[zapi-webhook] Error updating message status for ${messageId}:`, msgError);
      continue;
    }

    console.log(`[zapi-webhook] Updated ${messages?.length || 0} message(s) to status ${deliveryStatus}`);

    // If message was delivered (RECEIVED), update the order delivery flags
    if (isDelivered && messages && messages.length > 0) {
      for (const msg of messages) {
        if (msg.order_id) {
          if (msg.type === 'item_added') {
            await supabase
              .from('orders')
              .update({ item_added_delivered: true })
              .eq('id', msg.order_id);
            console.log(`[zapi-webhook] Updated order ${msg.order_id} item_added_delivered = true`);
          } else if (msg.type === 'outgoing') {
            // This is a paid order confirmation
            await supabase
              .from('orders')
              .update({ payment_confirmation_delivered: true })
              .eq('id', msg.order_id);
            console.log(`[zapi-webhook] Updated order ${msg.order_id} payment_confirmation_delivered = true`);
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ 
    success: true, 
    status: deliveryStatus,
    updated_ids: ids 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(phone: string): string {
  if (!phone) return '';

  // Remove all non-digit characters
  let clean = phone.replace(/\D/g, '');

  // Remove country code 55 if present
  if (clean.startsWith('55') && clean.length > 11) {
    clean = clean.substring(2);
  }

  // Expect DDD + number
  if (clean.length < 10) return '';

  // If WhatsApp sends DDD + 8 digits (10 total), assume mobile and add the 9th digit
  // (landlines typically don't use WhatsApp).
  if (clean.length === 10) {
    clean = clean.substring(0, 2) + '9' + clean.substring(2);
  }

  return clean;
}

async function findOrCreateCustomer(
  supabase: any, 
  tenantId: string, 
  phone: string, 
  name: string
) {
  // Try to find existing customer
  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .limit(1)
    .single();

  if (existing) {
    return existing;
  }

  // Create new customer
  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({
      tenant_id: tenantId,
      phone: phone,
      name: name || `Cliente ${phone.substring(phone.length - 4)}`,
    })
    .select()
    .single();

  if (error) {
    console.log('[zapi-webhook] Error creating customer:', error);
    throw error;
  }

  console.log(`[zapi-webhook] Created new customer: ${newCustomer.id}`);
  return newCustomer;
}

async function findOrCreateCart(
  supabase: any, 
  tenantId: string, 
  phone: string,
  groupName: string,
  eventType: string
) {
  const today = getBrasiliaDateISO();
  
  console.log(`[zapi-webhook] 🔍 findOrCreateCart - tenant: ${tenantId}, phone: ${phone}, eventType: ${eventType}, date: ${today}`);

  // First, check ALL carts for this customer (not just OPEN) to debug
  const { data: allCarts, error: allCartsError } = await supabase
    .from('carts')
    .select('id, status, event_type, event_date, created_at')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(10);

  if (allCartsError) {
    console.log(`[zapi-webhook] ❌ Error fetching all carts: ${allCartsError.message}`);
  } else {
    console.log(`[zapi-webhook] 📋 Found ${allCarts?.length || 0} total carts for this phone:`);
    for (const c of allCarts || []) {
      console.log(`[zapi-webhook]   - Cart ID: ${c.id}, Status: ${c.status}, Type: ${c.event_type}, Date: ${c.event_date}, Created: ${c.created_at}`);
    }
  }

  // Try to find an open cart for this customer with same event type AND today's date
  // IMPORTANT: We only reuse carts from TODAY to prevent adding items to old carts
  const { data: existingCart, error: openCartError } = await supabase
    .from('carts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .eq('event_type', eventType)
    .eq('event_date', today) // CRITICAL: Only match today's date!
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openCartError) {
    console.log(`[zapi-webhook] ❌ Error finding open cart: ${openCartError.message}`);
  }

  if (existingCart) {
    // Double-check: ensure this cart is NOT linked to a cancelled order
    const { data: linkedOrder } = await supabase
      .from('orders')
      .select('id, is_cancelled, is_paid')
      .eq('cart_id', existingCart.id)
      .maybeSingle();

    if (linkedOrder?.is_cancelled === true) {
      console.log(`[zapi-webhook] ⚠️ Found OPEN cart ${existingCart.id} but it's linked to CANCELLED order #${linkedOrder.id} - will create NEW cart`);
      // Don't return this cart - fall through to create a new one
    } else if (linkedOrder?.is_paid === true) {
      console.log(`[zapi-webhook] ⚠️ Found OPEN cart ${existingCart.id} but it's linked to PAID order #${linkedOrder.id} - will create NEW cart`);
      // Don't return this cart - fall through to create a new one
    } else {
      console.log(`[zapi-webhook] ✅ Found existing OPEN cart: ${existingCart.id} (${eventType}, date: ${today})`);
      return existingCart;
    }
  } else {
    console.log(`[zapi-webhook] ℹ️ No OPEN cart found for today (${today}) - will check for other conditions`);
  }

  // Check if there's a CLOSED cart for today - this is the case we want to debug
  const closedCart = allCarts?.find((c: any) => 
    c.status === 'CLOSED' && 
    c.event_type === eventType && 
    c.event_date === today
  );

  if (closedCart) {
    console.log(`[zapi-webhook] ⚠️ Found CLOSED cart for today: ID=${closedCart.id} - Will create a NEW cart`);
  } else {
    console.log(`[zapi-webhook] ℹ️ No existing cart found for this event type/date - Will create a NEW cart`);
  }

  // Create new cart with correct event type
  console.log(`[zapi-webhook] 🆕 Creating new cart - tenant: ${tenantId}, phone: ${phone}, eventType: ${eventType}, date: ${today}, group: ${groupName || 'null'}`);
  
  const { data: newCart, error } = await supabase
    .from('carts')
    .insert({
      tenant_id: tenantId,
      customer_phone: phone,
      event_date: today,
      event_type: eventType,
      status: 'OPEN',
      whatsapp_group_name: groupName || null,
    })
    .select()
    .single();

  if (error) {
    console.log(`[zapi-webhook] ❌ Error creating cart: ${error.message}`);
    console.log(`[zapi-webhook] ❌ Error details:`, JSON.stringify(error));
    throw error;
  }

  console.log(`[zapi-webhook] ✅ Created new cart: ${newCart.id} (${eventType})`);
  return newCart;
}

async function findOrCreateOrder(
  supabase: any,
  tenantId: string,
  phone: string,
  cartId: number,
  groupName: string,
  eventType: string,
  customerName?: string | null
) {
  const today = getBrasiliaDateISO();

  console.log(`[zapi-webhook] 🔍 findOrCreateOrder - tenant: ${tenantId}, phone: ${phone}, cartId: ${cartId}, eventType: ${eventType}, date: ${today}`);

  // First, check ALL orders for this customer to debug
  const { data: allOrders, error: allOrdersError } = await supabase
    .from('orders')
    .select('id, is_paid, is_cancelled, event_type, event_date, cart_id, created_at')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(10);

  if (allOrdersError) {
    console.log(`[zapi-webhook] ❌ Error fetching all orders: ${allOrdersError.message}`);
  } else {
    console.log(`[zapi-webhook] 📋 Found ${allOrders?.length || 0} total orders for this phone:`);
    for (const o of allOrders || []) {
      console.log(`[zapi-webhook]   - Order ID: ${o.id}, Paid: ${o.is_paid}, Cancelled: ${o.is_cancelled}, Type: ${o.event_type}, Date: ${o.event_date}, CartID: ${o.cart_id}, Created: ${o.created_at}`);
    }
  }

  // PRIORITY 1: Find existing order that uses this cart_id (prevents duplicates across days)
  // This handles the case where customer adds items on different days - same cart = same order
  const { data: orderByCart, error: cartOrderError } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('cart_id', cartId)
    .eq('is_paid', false)
    .eq('is_cancelled', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cartOrderError) {
    console.log(`[zapi-webhook] ❌ Error finding order by cart_id: ${cartOrderError.message}`);
  }

  if (orderByCart) {
    console.log(`[zapi-webhook] ✅ Found existing unpaid order by cart_id: ${orderByCart.id} (cart_id: ${cartId})`);
    // Update event_date to today so order appears in today's list
    if (orderByCart.event_date !== today) {
      console.log(`[zapi-webhook] 📅 Updating order ${orderByCart.id} event_date from ${orderByCart.event_date} to ${today}`);
      await supabase
        .from('orders')
        .update({ event_date: today })
        .eq('id', orderByCart.id);
    }
    return orderByCart;
  }

  // PRIORITY 2: Find existing unpaid order for today with same event type
  const { data: existingOrder, error: findError } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .eq('event_type', eventType)
    .eq('event_date', today)
    .eq('is_paid', false)
    .eq('is_cancelled', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    console.log(`[zapi-webhook] ❌ Error finding unpaid order: ${findError.message}`);
  }

  if (existingOrder) {
    console.log(`[zapi-webhook] ✅ Found existing unpaid order for today: ${existingOrder.id} (${eventType}), cart_id: ${existingOrder.cart_id}`);
    // Update cart_id if needed
    if (existingOrder.cart_id !== cartId) {
      console.log(`[zapi-webhook] ⚠️ Updating order ${existingOrder.id} cart_id from ${existingOrder.cart_id} to ${cartId}`);
      await supabase
        .from('orders')
        .update({ cart_id: cartId })
        .eq('id', existingOrder.id);
    }
    return existingOrder;
  }

  // Check if there's a PAID order for today - this would explain why we need new one
  const paidOrder = allOrders?.find((o: any) => 
    o.is_paid === true && 
    o.event_type === eventType && 
    o.event_date === today
  );

  if (paidOrder) {
    console.log(`[zapi-webhook] ℹ️ Found PAID order for today: ID=${paidOrder.id} - Will create a NEW order`);
  } else {
    console.log(`[zapi-webhook] ℹ️ No existing unpaid order found for cart_id=${cartId} or today's date - Will create a NEW order`);
  }

  // Create new order with correct event type
  console.log(`[zapi-webhook] 🆕 Creating new order - tenant: ${tenantId}, phone: ${phone}, cartId: ${cartId}, eventType: ${eventType}`);
  
  // Buscar dados do cliente cadastrado para preencher no pedido
  let customerData: any = null;
  if (customerName) {
    const { data: custData } = await supabase
      .from('customers')
      .select('name, cep, street, number, complement, neighborhood, city, state')
      .eq('tenant_id', tenantId)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    customerData = custData;
  }

  const { data: newOrder, error } = await supabase
    .from('orders')
    .insert({
      tenant_id: tenantId,
      customer_phone: phone,
      customer_name: customerData?.name || customerName || null,
      customer_cep: customerData?.cep || null,
      customer_street: customerData?.street || null,
      customer_number: customerData?.number || null,
      customer_complement: customerData?.complement || null,
      customer_neighborhood: customerData?.neighborhood || null,
      customer_city: customerData?.city || null,
      customer_state: customerData?.state || null,
      event_date: today,
      event_type: eventType,
      total_amount: 0,
      is_paid: false,
      cart_id: cartId,
      whatsapp_group_name: groupName || null,
    })
    .select()
    .single();

  if (error) {
    console.log(`[zapi-webhook] ❌ Error creating order: ${error.message}`);
    console.log(`[zapi-webhook] ❌ Error details:`, JSON.stringify(error));
    throw error;
  }

  console.log(`[zapi-webhook] ✅ Created new order: ${newOrder.id} (${eventType})`);
  return newOrder;
}

async function updateOrderTotal(supabase: any, orderId: number) {
  // Calculate total from cart items + freight from observation
  const { data: order } = await supabase
    .from('orders')
    .select('cart_id, observation')
    .eq('id', orderId)
    .single();

  if (!order?.cart_id) return;

  const { data: items } = await supabase
    .from('cart_items')
    .select('qty, unit_price')
    .eq('cart_id', order.cart_id);

  const productsTotal = items?.reduce((sum: number, item: any) => sum + (item.qty * item.unit_price), 0) || 0;

  // Extract freight value from observation field if present
  let freightValue = 0;
  if (order.observation) {
    const match = order.observation.match(/R\$\s*([\d]+[.,][\d]{2})/i);
    if (match) {
      freightValue = parseFloat(match[1].replace(",", ".")) || 0;
    }
  }

  const total = productsTotal + freightValue;

  await supabase
    .from('orders')
    .update({ total_amount: total })
    .eq('id', orderId);

  console.log(`[zapi-webhook] Updated order ${orderId} total to ${total} (products: ${productsTotal}, freight: ${freightValue})`);
}
 
 // Handle confirmation responses (SIM, OK, sim, ok) for the two-step message flow
 async function handleConfirmationResponse(
   supabase: any, 
   senderPhone: string, 
   messageText: string,
   instanceId?: string
 ): Promise<{ handled: boolean; action?: string; error?: string }> {
   
    // Normalize phone
    let normalizedPhone = senderPhone.replace(/\D/g, '');
    if (normalizedPhone.length >= 10 && !normalizedPhone.startsWith('55')) {
      normalizedPhone = '55' + normalizedPhone;
    }

    // IMPORTANT (BR): Z-API sometimes delivers private-message callbacks without the 9th digit
    // after DDD (e.g. stored: 5531999998888, received: 553199998888). We must match both.
    function buildPhoneVariantsForConfirmation(phone: string): string[] {
      const variants = new Set<string>();
      const p = (phone || '').replace(/\D/g, '');
      if (!p) return [];
      
      console.log(`[zapi-webhook] 📱 buildPhoneVariantsForConfirmation input: ${p} (length: ${p.length})`);

      // Determinar base sem país
      let baseWithoutCountry = p;
      if (p.startsWith('55') && p.length >= 12) {
        baseWithoutCountry = p.substring(2);
      }
      
      // Determinar base com país
      const baseWithCountry = p.startsWith('55') ? p : '55' + p;
      
      // Adicionar variações principais
      variants.add(baseWithoutCountry); // Ex: 31992904210 ou 3192904210
      variants.add(baseWithCountry);     // Ex: 5531992904210 ou 553192904210
      
      console.log(`[zapi-webhook] 📱 Base: withCountry=${baseWithCountry}, without=${baseWithoutCountry}`);
      
      // Variantes com/sem o 9º dígito para BR móveis
      // Telefone COM 9: DDD(2) + 9 + número(8) = 11 dígitos sem país
      // Telefone SEM 9: DDD(2) + número(8) = 10 dígitos sem país
      
      if (baseWithoutCountry.length === 11) {
        // Tem 11 dígitos sem país, assume que TEM o 9 - gerar versão SEM 9
        const ddd = baseWithoutCountry.slice(0, 2);
        const ninthDigit = baseWithoutCountry.charAt(2);
        const rest = baseWithoutCountry.slice(3);
        
        if (ninthDigit === '9' && rest.length === 8) {
          const without9 = ddd + rest;
          variants.add(without9);           // Ex: 3199290421
          variants.add('55' + without9);    // Ex: 553199290421
          console.log(`[zapi-webhook] 📱 Gerado versão SEM 9: ${without9}`);
        }
      } else if (baseWithoutCountry.length === 10) {
        // Tem 10 dígitos sem país, assume que NÃO tem o 9 - gerar versão COM 9
        const ddd = baseWithoutCountry.slice(0, 2);
        const rest = baseWithoutCountry.slice(2);
        
        if (rest.length === 8) {
          const with9 = ddd + '9' + rest;
          variants.add(with9);              // Ex: 31992904210
          variants.add('55' + with9);       // Ex: 5531992904210
          console.log(`[zapi-webhook] 📱 Gerado versão COM 9: ${with9}`);
        }
      }
      
      const result = Array.from(variants);
      console.log(`[zapi-webhook] 📱 Variantes geradas (${result.length}): ${result.join(', ')}`);
      return result;
    }

    const phoneVariants = buildPhoneVariantsForConfirmation(normalizedPhone);
    const phoneVariants55 = phoneVariants.filter((v) => v.startsWith('55'));
   
   // Check if message is a confirmation response
   const cleanMessage = messageText.trim().toLowerCase();
   const isConfirmation = ['sim', 'ok', 'yes', 's', 'simmm', 'simm', 'si', 'okay', 'pode'].includes(cleanMessage);
   
   if (!isConfirmation) {
     console.log(`[zapi-webhook] Message "${cleanMessage}" is not a confirmation response`);
     return { handled: false };
   }
   
   console.log(`[zapi-webhook] 🔔 Detected confirmation response "${cleanMessage}" from ${normalizedPhone}`);
   
   // Find pending confirmation for this phone
   // First, try to find by instanceId to get the correct tenant
   let tenantId: string | null = null;
   
   if (instanceId) {
     const { data: integration } = await supabase
       .from('integration_whatsapp')
       .select('tenant_id, consent_protection_enabled')
       .eq('zapi_instance_id', instanceId)
       .eq('is_active', true)
       .maybeSingle();
     
     if (integration) {
       tenantId = integration.tenant_id;
     }
   }
   
    // Build query for pending confirmations
    let query = supabase
      .from('pending_message_confirmations')
      .select('*')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    // Prefer matching by tenant (derived from instanceId) when possible
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    // Try exact matches for multiple phone variants (with/without 9)
    if (phoneVariants55.length > 0) {
      query = query.in('customer_phone', phoneVariants55);
    } else {
      query = query.eq('customer_phone', normalizedPhone);
    }

    const { data: confirmations, error: confError } = await query.limit(1);
   
   if (confError) {
     console.log(`[zapi-webhook] Error finding confirmation:`, confError);
     return { handled: false, error: confError.message };
   }
   
   if (!confirmations || confirmations.length === 0) {
      // Fallback: match by last digits (helps when provider changes formatting)
      const phoneWithoutCountry = normalizedPhone.replace(/^55/, '');
      const last10 = phoneWithoutCountry.slice(-10);
      const last11 = phoneWithoutCountry.slice(-11);

      let fallbackQuery = supabase
        .from('pending_message_confirmations')
        .select('*')
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (tenantId) fallbackQuery = fallbackQuery.eq('tenant_id', tenantId);

      // Try last 11 first (BR mobile with 9), then last 10
      const { data: confirmations2 } = await fallbackQuery
        .or(`customer_phone.ilike.%${last11},customer_phone.ilike.%${last10}`)
        .limit(1);
     
     if (!confirmations2 || confirmations2.length === 0) {
       console.log(`[zapi-webhook] No pending confirmation found for ${normalizedPhone}`);
       return { handled: false };
     }
     
     // Found confirmation with alternative phone format
      return await processConfirmationResponse(supabase, confirmations2[0], instanceId, normalizedPhone);
   }
   
    return await processConfirmationResponse(supabase, confirmations[0], instanceId, normalizedPhone);
 }

 // Processa a resposta de confirmação - ATUALIZADO para suportar modo de proteção por consentimento
 async function processConfirmationResponse(
   supabase: any, 
   confirmation: any,
   instanceId?: string,
   targetPhoneOverride?: string
 ): Promise<{ handled: boolean; action?: string; error?: string }> {
   
   // Verificar se o modo de proteção por consentimento está ativo
   const consentProtectionEnabled = confirmation.metadata?.consent_protection_enabled === true;
   
   if (consentProtectionEnabled) {
     // ============================================================
     // MODO DE PROTEÇÃO POR CONSENTIMENTO
     // Apenas atualiza o DB, NÃO envia resposta ao cliente
     // ============================================================
       console.log(`[zapi-webhook] 🛡️ Modo de Proteção por Consentimento: apenas atualizando DB`);
       
       // Normaliza telefone para buscar cliente
       // targetPhoneOverride vem do webhook (pode ser 5531992904210)
       // confirmation.customer_phone vem do DB (é 5531992904210)
       const targetPhone = (targetPhoneOverride || confirmation.customer_phone || '').replace(/\D/g, '');
       
       console.log(`[zapi-webhook] 📞 targetPhone: ${targetPhone} (from override: ${targetPhoneOverride}, confirmation: ${confirmation.customer_phone})`);
       
       // Gera TODAS as variantes do telefone brasileiro (com/sem 55, com/sem 9)
       function buildPhoneVariantsForDB(phone: string): string[] {
         const variants = new Set<string>();
         const p = phone.replace(/\D/g, '');
         if (!p) return [];
         
         // Determinar base sem país
         let baseWithoutCountry = p;
         if (p.startsWith('55') && p.length >= 12) {
           baseWithoutCountry = p.substring(2);
         }
         
         // Determinar base com país
         const baseWithCountry = p.startsWith('55') ? p : '55' + p;
         
         // Adicionar variações principais
         variants.add(baseWithoutCountry); // Ex: 31992904210
         variants.add(baseWithCountry);     // Ex: 5531992904210
         
         // Variantes com/sem o 9º dígito para BR móveis
         // Telefone COM 9: DDD(2) + 9 + número(8) = 11 dígitos
         // Telefone SEM 9: DDD(2) + número(8) = 10 dígitos
         
         if (baseWithoutCountry.length === 11) {
           // Tem 11 dígitos, assume que tem o 9 - gerar versão sem 9
           const ddd = baseWithoutCountry.slice(0, 2);
           const ninthDigit = baseWithoutCountry.charAt(2);
           const rest = baseWithoutCountry.slice(3);
           
           if (ninthDigit === '9' && rest.length === 8) {
             const without9 = ddd + rest;
             variants.add(without9);           // Ex: 3199290421
             variants.add('55' + without9);    // Ex: 553199290421
           }
         } else if (baseWithoutCountry.length === 10) {
           // Tem 10 dígitos, assume que NÃO tem o 9 - gerar versão com 9
           const ddd = baseWithoutCountry.slice(0, 2);
           const rest = baseWithoutCountry.slice(2);
           
           if (rest.length === 8) {
             const with9 = ddd + '9' + rest;
             variants.add(with9);              // Ex: 31992904210
             variants.add('55' + with9);       // Ex: 5531992904210
           }
         }
         
         return Array.from(variants);
       }
       
       const phoneVariants = buildPhoneVariantsForDB(targetPhone);
       console.log(`[zapi-webhook] 📞 Variantes geradas (${phoneVariants.length}): ${phoneVariants.join(', ')}`);
      
      // Primeiro, buscar o cliente existente com qualquer variante do telefone
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id, phone, name')
        .eq('tenant_id', confirmation.tenant_id)
        .in('phone', phoneVariants)
        .limit(1)
        .maybeSingle();
      
      if (existingCustomer) {
        // Atualizar consentimento do cliente encontrado
        const { error: updateError } = await supabase
          .from('customers')
          .update({
            consentimento_ativo: true,
            data_permissao: new Date().toISOString()
          })
          .eq('id', existingCustomer.id);
        
        if (updateError) {
          console.error(`[zapi-webhook] Error updating customer consent:`, updateError);
        } else {
          console.log(`[zapi-webhook] ✅ Consentimento atualizado para cliente ${existingCustomer.id} (${existingCustomer.name}) - telefone: ${existingCustomer.phone}`);
        }
      } else {
        // Criar novo cliente com o telefone sem prefixo 55 (padrão do sistema)
        let phoneForDB = targetPhone;
        if (phoneForDB.startsWith('55') && phoneForDB.length > 11) {
          phoneForDB = phoneForDB.substring(2);
        }
        
        const { data: newCustomer, error: createError } = await supabase
          .from('customers')
          .insert({
            tenant_id: confirmation.tenant_id,
            phone: phoneForDB,
            name: `Cliente ${phoneForDB.slice(-4)}`,
            consentimento_ativo: true,
            data_permissao: new Date().toISOString()
          })
          .select('id')
          .single();
        
        if (createError) {
          console.error(`[zapi-webhook] Error creating customer:`, createError);
        } else {
          console.log(`[zapi-webhook] ✅ Criado novo cliente ${newCustomer.id} com consentimento ativo`);
        }
      }
     
     // Marcar confirmação como confirmada
     await supabase
       .from('pending_message_confirmations')
       .update({
         status: 'confirmed',
         confirmed_at: new Date().toISOString()
       })
       .eq('id', confirmation.id);
     
     // Log para auditoria
     await supabase.from('whatsapp_messages').insert({
       tenant_id: confirmation.tenant_id,
       phone: targetPhone,
       message: '[SISTEMA] Cliente confirmou recebimento de mensagens. Consentimento registrado.',
       type: 'system_log',
       sent_at: new Date().toISOString()
     });
     
     console.log(`[zapi-webhook] ✅ Consentimento registrado. Enviando link de checkout imediatamente.`);

     // ============================================================
     // NOVO: Enviar link de checkout imediatamente após consentimento
     // ============================================================
     try {
       // Buscar config Z-API do tenant
       const { data: whatsappConfig } = await supabase
         .from('integration_whatsapp')
         .select('zapi_instance_id, zapi_token, zapi_client_token')
         .eq('tenant_id', confirmation.tenant_id)
         .eq('is_active', true)
         .maybeSingle();

       if (whatsappConfig?.zapi_instance_id && whatsappConfig?.zapi_token) {
         // Buscar slug do tenant
         const { data: tenant } = await supabase
           .from('tenants')
           .select('slug')
           .eq('id', confirmation.tenant_id)
           .maybeSingle();

         // Buscar public_base_url
         const { data: settings } = await supabase
           .from('app_settings')
           .select('public_base_url')
           .limit(1)
           .maybeSingle();

         const baseUrl = settings?.public_base_url || 'https://live-launchpad-79.lovable.app';
         const slug = tenant?.slug || confirmation.tenant_id;
         const checkoutUrl = `${baseUrl}/t/${slug}/checkout`;

         const linkMessage = `Segue o link: ${checkoutUrl} 😘🥰`;

         // Simulate typing
         try {
           const typingUrl = `https://api.z-api.io/instances/${whatsappConfig.zapi_instance_id}/token/${whatsappConfig.zapi_token}/typing`;
           const typingHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
           if (whatsappConfig.zapi_client_token) typingHeaders['Client-Token'] = whatsappConfig.zapi_client_token;
           await fetch(typingUrl, {
             method: 'POST',
             headers: typingHeaders,
             body: JSON.stringify({ phone: targetPhone, duration: 3 })
           });
           const typingDelay = 2000 + Math.random() * 2000;
           await new Promise(resolve => setTimeout(resolve, typingDelay));
         } catch (e) {
           console.log('[zapi-webhook] Typing simulation failed, continuing...');
         }

         // Anti-block delay
         const delayMs = await antiBlockDelayLive();
         logAntiBlockDelay('zapi-webhook (consent-link)', delayMs);

         // Enviar mensagem com link
         const sendUrl = `https://api.z-api.io/instances/${whatsappConfig.zapi_instance_id}/token/${whatsappConfig.zapi_token}/send-text`;
         const sendHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
         if (whatsappConfig.zapi_client_token) sendHeaders['Client-Token'] = whatsappConfig.zapi_client_token;

         const response = await fetch(sendUrl, {
           method: 'POST',
           headers: sendHeaders,
           body: JSON.stringify({ phone: targetPhone, message: linkMessage })
         });

         const responseText = await response.text();
         console.log(`[zapi-webhook] 📤 Checkout link sent after consent: ${response.status} - ${responseText.substring(0, 200)}`);

         // Parse message ID
         let zapiMessageId = null;
         try {
           const responseJson = JSON.parse(responseText);
           zapiMessageId = responseJson.messageId || responseJson.id || null;
         } catch (e) { }

         // Log da mensagem enviada
         await supabase.from('whatsapp_messages').insert({
           tenant_id: confirmation.tenant_id,
           phone: targetPhone,
           message: linkMessage,
           type: 'outgoing',
           sent_at: new Date().toISOString(),
           zapi_message_id: zapiMessageId,
           delivery_status: response.ok ? 'SENT' : 'FAILED'
         });

         console.log(`[zapi-webhook] ✅ Link de checkout enviado após consentimento!`);
       } else {
         console.log(`[zapi-webhook] ⚠️ Config Z-API não encontrada para enviar link após consentimento`);
       }
     } catch (linkError) {
       console.error(`[zapi-webhook] ❌ Erro ao enviar link após consentimento:`, linkError);
     }
     
     return { 
       handled: true, 
       action: 'consent_registered_and_link_sent'
     };
     
   } else {
     // ============================================================
     // MODO LEGADO: Enviar link de checkout como resposta
     // ============================================================
     return await sendConfirmationLink(supabase, confirmation, instanceId, targetPhoneOverride);
   }
 }
 
 // Send the confirmation link (second message with checkout URL)
 async function sendConfirmationLink(
   supabase: any, 
   confirmation: any,
    instanceId?: string,
    targetPhoneOverride?: string
 ): Promise<{ handled: boolean; action?: string; error?: string }> {
   
   console.log(`[zapi-webhook] 📤 Sending confirmation link for ${confirmation.id}`);
   
   // Get tenant's WhatsApp config
   const { data: whatsappConfig } = await supabase
     .from('integration_whatsapp')
     .select('zapi_instance_id, zapi_token, zapi_client_token, item_added_confirmation_template')
     .eq('tenant_id', confirmation.tenant_id)
     .eq('is_active', true)
     .maybeSingle();
   
   if (!whatsappConfig?.zapi_instance_id || !whatsappConfig?.zapi_token) {
     console.log(`[zapi-webhook] No WhatsApp config for tenant ${confirmation.tenant_id}`);
     return { handled: true, error: 'no_whatsapp_config' };
   }
   
   // Build confirmation message
   const defaultTemplate = `Perfeito! 🎉
 
 Aqui está o seu link exclusivo para finalizar a compra:
 
 👉 {{checkout_url}}
 
 Qualquer dúvida estou à disposição! ✨`;
   
    // Extract product info from confirmation metadata to support {{produto}}, {{quantidade}}, {{valor}}, etc.
    const meta = (confirmation.metadata || {}) as Record<string, any>;
    const productName = meta.product_name || '';
    const productCode = meta.product_code || '';
    const quantity = meta.quantity ?? '';
    const unitPriceNum = typeof meta.unit_price === 'number' ? meta.unit_price : Number(meta.unit_price) || 0;
    const originalPriceNum = typeof meta.original_price === 'number' ? meta.original_price : Number(meta.original_price) || 0;
    const unitPriceStr = unitPriceNum ? unitPriceNum.toFixed(2) : '';
    const totalStr = (unitPriceNum && quantity) ? (unitPriceNum * Number(quantity)).toFixed(2) : '';
    const originalPriceStr = originalPriceNum ? originalPriceNum.toFixed(2) : '';
    const promoPriceStr = (originalPriceNum && originalPriceNum > unitPriceNum) ? unitPriceStr : '';

    let message = (whatsappConfig.item_added_confirmation_template || defaultTemplate)
      .replace(/\{\{checkout_url\}\}/g, confirmation.checkout_url || '')
      .replace(/\{\{link\}\}/g, confirmation.checkout_url || '')
      .replace(/\{\{produto\}\}/g, productName ? `${productName}${productCode ? ` (${productCode})` : ''}` : '')
      .replace(/\{\{quantidade\}\}/g, String(quantity))
      .replace(/\{\{valor\}\}/g, unitPriceStr)
      .replace(/\{\{preco\}\}/g, unitPriceStr)
      .replace(/\{\{total\}\}/g, totalStr)
      .replace(/\{\{subtotal\}\}/g, totalStr)
      .replace(/\{\{codigo\}\}/g, productCode)
      .replace(/\{\{valor_original\}\}/g, originalPriceStr)
      .replace(/\{\{valor_promo\}\}/g, promoPriceStr);

    // Remove lines containing unfilled promo placeholders when no promo data
    if (!originalPriceStr || !promoPriceStr) {
      message = message
        .split('\n')
        .filter((line) => {
          if (!originalPriceStr && line.includes('{{valor_original}}')) return false;
          if (!promoPriceStr && line.includes('{{valor_promo}}')) return false;
          return true;
        })
        .join('\n');
    }

    // Add message variation
    message = addMessageVariation(message);
   
    const targetPhone = (targetPhoneOverride || confirmation.customer_phone || '').replace(/\D/g, '') || confirmation.customer_phone;

    // Simulate typing (3-5 seconds)
   try {
     const typingUrl = `https://api.z-api.io/instances/${whatsappConfig.zapi_instance_id}/token/${whatsappConfig.zapi_token}/typing`;
     const headers: Record<string, string> = { 'Content-Type': 'application/json' };
     if (whatsappConfig.zapi_client_token) headers['Client-Token'] = whatsappConfig.zapi_client_token;
     
     await fetch(typingUrl, {
       method: 'POST',
       headers,
        body: JSON.stringify({ phone: targetPhone, duration: 4 })
     });
     
     const typingDelay = 3000 + Math.random() * 2000;
     await new Promise(resolve => setTimeout(resolve, typingDelay));
   } catch (e) {
     console.log('[zapi-webhook] Typing simulation failed, continuing...');
   }
   
   // Apply anti-block delay
   const delayMs = await antiBlockDelayLive();
   logAntiBlockDelay('zapi-webhook (confirmation link)', delayMs);
   
   // Send the message
   const sendUrl = `https://api.z-api.io/instances/${whatsappConfig.zapi_instance_id}/token/${whatsappConfig.zapi_token}/send-text`;
   const headers: Record<string, string> = { 'Content-Type': 'application/json' };
   if (whatsappConfig.zapi_client_token) headers['Client-Token'] = whatsappConfig.zapi_client_token;
   
    console.log(`[zapi-webhook] Sending confirmation link to ${targetPhone}`);
   
   const response = await fetch(sendUrl, {
     method: 'POST',
     headers,
      body: JSON.stringify({ phone: targetPhone, message })
   });
   
   const responseText = await response.text();
   console.log(`[zapi-webhook] Confirmation link response: ${response.status} - ${responseText.substring(0, 200)}`);
   
   // Parse message ID
   let zapiMessageId = null;
   try {
     const responseJson = JSON.parse(responseText);
     zapiMessageId = responseJson.messageId || responseJson.id || null;
   } catch (e) { }
   
   // Update confirmation status
   await supabase
     .from('pending_message_confirmations')
     .update({
       status: 'confirmed',
       confirmed_at: new Date().toISOString()
     })
     .eq('id', confirmation.id);
   
   // Log the message
   await supabase.from('whatsapp_messages').insert({
     tenant_id: confirmation.tenant_id,
      phone: targetPhone,
     message: message.substring(0, 500),
     type: 'outgoing',
     sent_at: new Date().toISOString(),
     zapi_message_id: zapiMessageId,
     delivery_status: response.ok ? 'SENT' : 'FAILED'
   });
   
   console.log(`[zapi-webhook] ✅ Confirmation link sent for ${confirmation.id}`);
   
   return { 
     handled: true, 
     action: 'confirmation_link_sent',
   };
 }
