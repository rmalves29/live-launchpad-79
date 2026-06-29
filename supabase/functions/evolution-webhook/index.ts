import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

// ─── Evolution API helpers ────────────────────────────────────────────────────

function evoHeaders() {
  return { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY };
}

async function evoSendText(instanceName: string, phone: string, message: string): Promise<boolean> {
  try {
    await fetch(`${EVOLUTION_API_URL}/chat/sendPresence/${instanceName}`, {
      method: "POST", headers: evoHeaders(),
      body: JSON.stringify({ number: phone, options: { presence: "composing", delay: 1500 } }),
    });
    await new Promise((r) => setTimeout(r, 1500));
    const resp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
      method: "POST", headers: evoHeaders(),
      body: JSON.stringify({ number: phone, text: message }),
    });
    return resp.ok;
  } catch (e: any) {
    console.error("[evolution-webhook] evoSendText error:", e.message);
    return false;
  }
}

async function getGroupName(instanceName: string, groupJid: string): Promise<string> {
  try {
    const resp = await fetch(`${EVOLUTION_API_URL}/group/findGroupInfos/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`, {
      method: "GET", headers: evoHeaders(),
    });
    if (resp.ok) {
      const data = await resp.json();
      return data?.subject || data?.name || groupJid.split("@")[0];
    }
  } catch (_) {}
  return groupJid.split("@")[0];
}

// ─── Payload parsing ──────────────────────────────────────────────────────────

function extractText(data: any): string {
  const msg = data?.message;
  if (!msg) return "";
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    msg.listResponseMessage?.title ||
    ""
  ).trim();
}

function phoneFromJid(jid: string): string {
  return (jid || "").split("@")[0];
}

function normalizePhone(raw: string): string {
  let p = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (!p.startsWith("55")) p = "55" + p;
  return p;
}

function addVariation(msg: string): string {
  const invisible = ["​", "‌", "‍", "⁠"];
  return msg + invisible[Math.floor(Math.random() * invisible.length)];
}

// ─── In-memory dedup ──────────────────────────────────────────────────────────
const processedMessages = new Map<string, number>();
function isDuplicate(id: string): boolean {
  const now = Date.now();
  if (processedMessages.has(id) && now - processedMessages.get(id)! < 30000) return true;
  processedMessages.set(id, now);
  if (processedMessages.size > 500) {
    const oldest = [...processedMessages.entries()].sort((a, b) => a[1] - b[1]).slice(0, 100);
    for (const [k] of oldest) processedMessages.delete(k);
  }
  return false;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function getBrasiliaDateISO(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split("T")[0];
}

async function findOrCreateCustomer(supabase: any, tenantId: string, phone: string, name: string) {
  const { data } = await supabase.from("customers").select("*").eq("tenant_id", tenantId).eq("phone", phone).maybeSingle();
  if (data) {
    if (name && !data.name) await supabase.from("customers").update({ name }).eq("id", data.id);
    return data;
  }
  const { data: newC } = await supabase.from("customers").insert({ tenant_id: tenantId, phone, name: name || null }).select().single();
  return newC;
}

async function findOrCreateCart(supabase: any, tenantId: string, phone: string, groupName: string, eventType: string) {
  const today = getBrasiliaDateISO();
  const { data } = await supabase
    .from("carts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("customer_phone", phone)
    .eq("event_type", eventType)
    .eq("event_date", today)
    .eq("status", "OPEN")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) {
    const { data: linkedOrder } = await supabase
      .from("orders")
      .select("id, is_cancelled, is_paid")
      .eq("tenant_id", tenantId)
      .eq("cart_id", data.id)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!linkedOrder?.is_cancelled && !linkedOrder?.is_paid) return data;
  }
  const { data: newC, error } = await supabase.from("carts").insert({ tenant_id: tenantId, customer_phone: phone, event_date: today, event_type: eventType, status: "OPEN", whatsapp_group_name: groupName || null }).select().single();
  if (error) throw new Error(`cart_creation_failed: ${error.message}`);
  return newC;
}

async function findOrCreateOrder(supabase: any, tenantId: string, phone: string, cartId: number, groupName: string, eventType: string, customerName: string | null) {
  const today = getBrasiliaDateISO();
  const { data: orderByCart, error: cartOrderError } = await supabase
    .from("orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("cart_id", cartId)
    .eq("is_paid", false)
    .eq("is_cancelled", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cartOrderError) console.warn(`[evolution-webhook] order_by_cart error: ${cartOrderError.message}`);
  if (orderByCart) {
    if (orderByCart.event_date !== today) await supabase.from("orders").update({ event_date: today }).eq("id", orderByCart.id);
    return orderByCart;
  }

  const { data: existingOrder, error: existingOrderError } = await supabase
    .from("orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("customer_phone", phone)
    .eq("event_type", eventType)
    .eq("event_date", today)
    .eq("is_paid", false)
    .eq("is_cancelled", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingOrderError) console.warn(`[evolution-webhook] existing_order error: ${existingOrderError.message}`);
  if (existingOrder) {
    if (existingOrder.cart_id !== cartId) await supabase.from("orders").update({ cart_id: cartId }).eq("id", existingOrder.id);
    return { ...existingOrder, cart_id: cartId };
  }

  const { data: customerData } = await supabase
    .from("customers")
    .select("name, cep, street, number, complement, neighborhood, city, state")
    .eq("tenant_id", tenantId)
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();

  const { data: newO, error } = await supabase.from("orders").insert({
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
    source: "whatsapp",
  }).select().single();
  if (error) throw new Error(`order_creation_failed: ${error.message}`);
  return newO;
}

async function updateOrderTotal(supabase: any, orderId: number) {
  const { data: order } = await supabase.from("orders").select("cart_id, observation").eq("id", orderId).single();
  if (!order) return;
  const { data: items } = await supabase.from("cart_items").select("qty, unit_price").eq("cart_id", order.cart_id);
  const productsTotal = (items || []).reduce((s: number, i: any) => s + Number(i.qty) * Number(i.unit_price), 0);
  let freightValue = 0;
  const match = String(order.observation || "").match(/R\$\s*([\d]+[.,][\d]{2})/i);
  if (match) freightValue = Number(match[1].replace(",", ".")) || 0;
  await supabase.from("orders").update({ total_amount: productsTotal + freightValue }).eq("id", orderId);
}

// ─── Consent helpers (same logic as zapi-webhook) ────────────────────────────

function buildPhoneVariants(phone: string): string[] {
  const variants = new Set<string>();
  let p = phone.replace(/\D/g, "");
  if (!p) return [];
  let base = p.startsWith("55") && p.length >= 12 ? p.slice(2) : p;
  const with55 = "55" + base;
  variants.add(base);
  variants.add(with55);
  if (base.length === 11 && base[2] === "9") {
    const w9 = base.slice(0, 2) + base.slice(3);
    variants.add(w9);
    variants.add("55" + w9);
  } else if (base.length === 10) {
    const wo9 = base.slice(0, 2) + "9" + base.slice(2);
    variants.add(wo9);
    variants.add("55" + wo9);
  }
  return Array.from(variants);
}

async function handleConsentResponse(supabase: any, tenantId: string, instanceName: string, senderPhone: string, messageText: string) {
  const clean = messageText.trim().toLowerCase();
  const isConfirmation = ["sim", "ok", "yes", "s", "simmm", "simm", "si", "okay", "pode"].includes(clean);
  const isDecline = ["nao", "não", "no", "n", "naum", "nope", "pare", "parar", "sair", "cancela", "cancelar", "stop"].includes(clean);
  if (!isConfirmation && !isDecline) return false;

  const variants = buildPhoneVariants(senderPhone);
  const { data: stateRows } = await supabase.from("whatsapp_consent_state").select("id, status").eq("tenant_id", tenantId).in("customer_phone", variants).order("updated_at", { ascending: false }).limit(1);
  const state = stateRows && stateRows[0];
  if (!state) return false;

  const now = new Date();

  if (isConfirmation) {
    const expires = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    await supabase.from("whatsapp_consent_state").update({ status: "active", consent_granted_at: now.toISOString(), consent_expires_at: expires.toISOString() }).eq("id", state.id);
    console.log(`[evolution-webhook] ✅ Consentimento ATIVO por 3 dias (state ${state.id})`);

    // Send Template B with checkout link
    try {
      const { data: integ } = await supabase.from("integration_whatsapp").select("template_com_link, item_added_button_enabled, item_added_button_url, item_added_button_label, is_active").eq("tenant_id", tenantId).eq("is_active", true).maybeSingle();
      const tplB = (integ?.template_com_link || "").trim();
      if (tplB) {
        const { data: tenantRow } = await supabase.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
        const { data: settings } = await supabase.from("app_settings").select("public_base_url").limit(1).maybeSingle();
        const baseUrl = settings?.public_base_url || "https://live-launchpad-79.lovable.app";
        const checkoutUrl = `${baseUrl}/t/${tenantRow?.slug || tenantId}/checkout`;
        let body = tplB.replace(/\{\{link_checkout\}\}/g, checkoutUrl).replace(/\{\{checkout_url\}\}/g, checkoutUrl);
        body = body.split("\n").filter((l: string) => !/\{\{(produto|quantidade|valor|preco|total|subtotal|codigo)\}\}/.test(l)).join("\n").trim();
        if (body) {
          const phone55 = senderPhone.startsWith("55") ? senderPhone : "55" + senderPhone;
          await evoSendText(instanceName, phone55, addVariation(body));
          await supabase.from("whatsapp_messages").insert({ tenant_id: tenantId, phone: senderPhone, message: body.substring(0, 500), type: "consent_link", sent_at: new Date().toISOString(), delivery_status: "SENT" });
        }
      }
    } catch (e: any) { console.error("[evolution-webhook] Erro ao enviar Template B pós-SIM:", e.message); }
  } else {
    const expires = new Date(now.getTime() + 60 * 60 * 1000);
    await supabase.from("whatsapp_consent_state").update({ status: "declined", request_expires_at: expires.toISOString() }).eq("id", state.id);
    console.log(`[evolution-webhook] 🚫 Consentimento recusado. Silenciado por 1h.`);
  }

  await supabase.from("whatsapp_messages").insert({ tenant_id: tenantId, phone: senderPhone, message: `[SISTEMA] Cliente respondeu ${isConfirmation ? "SIM" : "NÃO"}.`, type: "system_log", sent_at: now.toISOString() });
  return true;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const event = payload.event || payload.type || "";
    const instanceName: string = payload.instance || payload.destination || "";

    // Only handle message events
    if (event !== "messages.upsert" && event !== "MESSAGES_UPSERT") {
      return new Response(JSON.stringify({ skipped: "non_message_event", event }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = payload.data || {};
    const key = data.key || {};
    const remoteJid: string = key.remoteJid || "";
    const fromMe: boolean = key.fromMe === true;
    const messageId: string = key.id || "";
    const isGroup = remoteJid.includes("@g.us");
    const senderJid: string = isGroup ? (key.participant || "") : remoteJid;
    const senderRaw = phoneFromJid(senderJid);
    const messageText = extractText(data);
    const pushName: string = data.pushName || "";

    // Skip empty messages
    if (!messageText) {
      return new Response(JSON.stringify({ skipped: "no_text" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Product code quick check
    const hasProductCode = /\b[Cc]\d{1,6}([\/\-]\d{1,3})?\b/.test(messageText);

    // Skip fromMe messages that are not group+product (API loop protection)
    if (fromMe) {
      if (!isGroup || !hasProductCode) {
        return new Response(JSON.stringify({ skipped: "fromMe" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // In-memory dedup
    if (messageId && isDuplicate(messageId)) {
      return new Response(JSON.stringify({ skipped: "duplicate", messageId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Find tenant by evolution_instance_name
    const { data: integration } = await supabase.from("integration_whatsapp").select("tenant_id, is_active").eq("evolution_instance_name", instanceName).eq("is_active", true).maybeSingle();
    if (!integration) {
      console.warn(`[evolution-webhook] Tenant not found for instance: ${instanceName}`);
      return new Response(JSON.stringify({ skipped: "tenant_not_found", instance: instanceName }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const tenantId: string = integration.tenant_id;
    const senderPhone = normalizePhone(senderRaw);

    // ─── Private message: consent handling ───────────────────────────────────
    if (!isGroup) {
      const handled = await handleConsentResponse(supabase, tenantId, instanceName, senderPhone, messageText);
      return new Response(JSON.stringify({ success: true, consent_handled: handled }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── Group message: product code processing ───────────────────────────────
    if (!hasProductCode) {
      return new Response(JSON.stringify({ skipped: "no_product_codes" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const groupJid = remoteJid;
    const groupName = await getGroupName(instanceName, groupJid);

    // DB-level dedup
    if (messageId) {
      const { data: existing } = await supabase.from("whatsapp_messages").select("id").eq("tenant_id", tenantId).eq("zapi_message_id", messageId).limit(1).maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ skipped: "duplicate_db", messageId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Group ownership check
    if (groupJid) {
      const { data: ownership } = await supabase.from("whatsapp_group_ownership").select("owner_tenant_id").eq("group_id", groupJid).maybeSingle();
      if (ownership) {
        if (ownership.owner_tenant_id !== tenantId) {
          return new Response(JSON.stringify({ skipped: "group_owned_by_another_tenant" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } else {
        const { error: insErr } = await supabase.from("whatsapp_group_ownership").insert({ group_id: groupJid, group_name: groupName || null, owner_tenant_id: tenantId, instance_id: instanceName });
        if (insErr?.code === "23505") {
          return new Response(JSON.stringify({ skipped: "group_ownership_race_lost" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    // Early log for dedup
    const earlyLog = `[WEBHOOK] Processado: ${messageText}`;
    await supabase.from("whatsapp_messages").insert({ tenant_id: tenantId, phone: senderPhone, message: earlyLog, type: "incoming", whatsapp_group_name: groupName || null, received_at: new Date().toISOString(), zapi_message_id: messageId || null });

    // ─── Parse product codes ──────────────────────────────────────────────────
    const productEntries: Array<{ code: string; qty: number }> = [];
    const processedCodes = new Set<string>();
    let match: RegExpExecArray | null;

    const codeFirstRegex = /\b[Cc](\d{1,6}(?:[\/\-]\d{1,3})?)\s*[xX]\s*(\d{1,3})\b/g;
    const qtyFirstRegex = /\b(\d{1,3})\s*[xX]\s*[Cc](\d{1,6}(?:[\/\-]\d{1,3})?)\b/g;
    const plainCodeRegex = /\b[Cc](\d{1,6}(?:[\/\-]\d{1,3})?)/g;

    while ((match = codeFirstRegex.exec(messageText)) !== null) {
      const n = `C${match[1]}`; const q = Math.max(1, Math.min(parseInt(match[2], 10), 99));
      if (!processedCodes.has(n)) { processedCodes.add(n); productEntries.push({ code: n, qty: q }); }
    }
    while ((match = qtyFirstRegex.exec(messageText)) !== null) {
      const n = `C${match[2]}`; const q = Math.max(1, Math.min(parseInt(match[1], 10), 99));
      if (!processedCodes.has(n)) { processedCodes.add(n); productEntries.push({ code: n, qty: q }); }
    }
    const plainMatches: string[] = [];
    while ((match = plainCodeRegex.exec(messageText)) !== null) plainMatches.push(`C${match[1]}`);
    plainMatches.sort((a, b) => b.length - a.length);
    for (const n of plainMatches) {
      const hasMoreSpecific = [...processedCodes].some(c => c !== n && c.startsWith(n) && (c[n.length] === "/" || c[n.length] === "-"));
      if (!processedCodes.has(n) && !hasMoreSpecific) { processedCodes.add(n); productEntries.push({ code: n, qty: 1 }); }
    }

    if (productEntries.length === 0) {
      return new Response(JSON.stringify({ skipped: "no_product_codes_parsed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const phone55 = senderPhone.startsWith("55") ? senderPhone : "55" + senderPhone;
    const results = [];

    for (const entry of productEntries) {
      const { code, qty: requestedQty } = entry;
      const codeUpper = code.toUpperCase();

      // Product lookup (same multi-strategy as zapi-webhook)
      let product: any = null;
      const { data: p1 } = await supabase.from("products").select("*").eq("tenant_id", tenantId).ilike("code", codeUpper).eq("is_active", true).limit(1).maybeSingle();
      if (p1) product = p1;

      if (!product) {
        const { data: p2 } = await supabase.from("products").select("*").eq("tenant_id", tenantId).eq("is_active", true).or(`code.ilike.${codeUpper} ,code.ilike.${codeUpper}  `).limit(1).maybeSingle();
        if (p2) product = p2;
      }
      if (!product && !codeUpper.startsWith("C")) {
        const cp = "C" + codeUpper;
        const { data: p3 } = await supabase.from("products").select("*").eq("tenant_id", tenantId).eq("is_active", true).ilike("code", cp).limit(1).maybeSingle();
        if (p3) product = p3;
      }
      if (!product && codeUpper.startsWith("C")) {
        const wc = codeUpper.slice(1);
        const { data: p4 } = await supabase.from("products").select("*").eq("tenant_id", tenantId).eq("is_active", true).ilike("code", wc).limit(1).maybeSingle();
        if (p4) product = p4;
      }

      if (!product) {
        console.log(`[evolution-webhook] Product not found: ${codeUpper}`);
        results.push({ code: codeUpper, success: false, error: "product_not_found" });
        continue;
      }

      // Fresh stock check
      const { data: fresh } = await supabase.from("products").select("stock").eq("id", product.id).single();
      if (fresh) product.stock = fresh.stock;

      if (product.stock <= 0) {
        console.log(`[evolution-webhook] ❌ Estoque esgotado: ${product.code}`);
        let waitlistPosition: number | null = null;
        try {
          const { data: wl } = await supabase.functions.invoke("waitlist-enqueue", { body: { tenant_id: tenantId, product_id: product.id, qty: 1, customer_phone: senderPhone, source: "whatsapp" } });
          if (wl?.success) waitlistPosition = wl.position;
        } catch (_) {}

        const { data: cfg } = await supabase.from("integration_whatsapp").select("send_out_of_stock_msg").eq("tenant_id", tenantId).maybeSingle();
        if (cfg?.send_out_of_stock_msg !== false) {
          const msg = waitlistPosition
            ? `😔 *Produto Esgotado*\n\nO produto *${product.name}* (código *${product.code}*) acabou no momento.\n\n🎯 Te coloquei na *fila de espera*! Você é a *${waitlistPosition}ª* da fila. 💚`
            : `😔 *Produto Esgotado*\n\nO produto *${product.name}* (código *${product.code}*) acabou no momento. 💚`;
          await evoSendText(instanceName, phone55, addVariation(msg));
          await supabase.from("whatsapp_messages").insert({ tenant_id: tenantId, phone: senderPhone, message: msg, type: "outgoing", product_name: product.name, sent_at: new Date().toISOString() });
        }
        results.push({ code: codeUpper, success: false, error: "out_of_stock" });
        continue;
      }

      // Customer
      const customer = await findOrCreateCustomer(supabase, tenantId, senderPhone, pushName);

      if (customer?.is_blocked) {
        console.log(`[evolution-webhook] 🚫 Cliente bloqueado: ${senderPhone}`);
        const { data: blockedTpl } = await supabase.from("whatsapp_templates").select("content").eq("tenant_id", tenantId).eq("type", "BLOCKED_CUSTOMER").maybeSingle();
        const defaultMsg = "Olá! Identificamos uma restrição em seu cadastro que impede novos pedidos. Entre em contato com o suporte. ⛔";
        await evoSendText(instanceName, phone55, addVariation(blockedTpl?.content || defaultMsg));
        results.push({ code: codeUpper, success: false, error: "customer_blocked" });
        continue;
      }

      const eventType = product.sale_type === "LIVE" ? "LIVE" : "BAZAR";

      // Cart
      let cart = await findOrCreateCart(supabase, tenantId, senderPhone, groupName, eventType);

      // Check if cart belongs to a cancelled order
      const { data: cancelledOrder } = await supabase.from("orders").select("id").eq("tenant_id", tenantId).eq("cart_id", cart.id).eq("is_cancelled", true).maybeSingle();
      if (cancelledOrder) {
        const { data: newCart } = await supabase.from("carts").insert({ tenant_id: tenantId, customer_phone: senderPhone, event_date: getBrasiliaDateISO(), event_type: eventType, status: "OPEN", whatsapp_group_name: groupName || null }).select().single();
        if (!newCart) { results.push({ code: codeUpper, success: false, error: "cart_creation_error" }); continue; }
        cart = newCart;
      }

      const order = await findOrCreateOrder(supabase, tenantId, senderPhone, cart.id, groupName, eventType, customer?.name || null);

      // Cart item upsert (same 10-second lock logic as zapi-webhook)
      const { data: existingItems } = await supabase.from("cart_items").select("id, qty, created_at").eq("cart_id", cart.id).eq("product_id", product.id).order("created_at", { ascending: false }).limit(1);
      const existingItem = existingItems && existingItems[0];

      let cartItem: any;
      let sendConfirmation = false;

      if (existingItem) {
        if (requestedQty === 1) {
          const age = Date.now() - new Date(existingItem.created_at).getTime();
          if (age < 10000) {
            console.log(`[evolution-webhook] ⏱️ Dedup: ${codeUpper} já adicionado há ${(age / 1000).toFixed(1)}s`);
            results.push({ code: codeUpper, success: true, skipped: "time_lock" });
            continue;
          }
        }
        const newQty = existingItem.qty + requestedQty;
        const { data: updated } = await supabase.from("cart_items").update({ qty: newQty, unit_price: product.price }).eq("id", existingItem.id).select().single();
        cartItem = updated;
        sendConfirmation = true;
      } else {
        const { data: inserted } = await supabase.from("cart_items").insert({ cart_id: cart.id, product_id: product.id, product_name: product.name, product_code: product.code, qty: requestedQty, unit_price: product.price, tenant_id: tenantId }).select().single();
        cartItem = inserted;
        sendConfirmation = true;
      }

      if (!cartItem) { results.push({ code: codeUpper, success: false, error: "cart_item_error" }); continue; }

      // Update stock atomically; rollback cart item if stock changed concurrently
      const { data: stockRows, error: stockError } = await supabase
        .from("products")
        .update({ stock: product.stock - requestedQty })
        .eq("id", product.id)
        .gte("stock", requestedQty)
        .select("stock");
      if (stockError || !stockRows || stockRows.length === 0) {
        if (existingItem) {
          await supabase.from("cart_items").update({ qty: existingItem.qty }).eq("id", existingItem.id);
        } else {
          await supabase.from("cart_items").delete().eq("id", cartItem.id);
        }
        results.push({ code: codeUpper, success: false, error: "stock_race_condition", product: product.name });
        continue;
      }

      // Update order total
      if (order?.id) await updateOrderTotal(supabase, order.id);

      // Customer notification follows the same template flow used by Z-API.
      // Do not send ad-hoc confirmation in the group: only ITEM_ADDED / PAID_ORDER / TRACKING templates are sent privately.
      if (sendConfirmation) {
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          await fetch(`${supabaseUrl}/functions/v1/zapi-send-item-added`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` },
            body: JSON.stringify({
              tenant_id: tenantId,
              customer_phone: senderPhone,
              product_name: product.name,
              product_code: product.code,
              quantity: requestedQty,
              unit_price: Number(cartItem.unit_price || product.promotional_price || product.price),
              original_price: Number(product.price),
              order_id: order?.id || null,
              cart_id: cart.id,
            }),
          }).then(async (response) => {
            const text = await response.text();
            console.log(`[evolution-webhook] item-added dispatch status=${response.status} body=${text.substring(0, 200)}`);
          });
        } catch (e: any) { console.error("[evolution-webhook] Erro ao invocar zapi-send-item-added:", e.message); }

        // Log system entry only; actual outgoing template is logged by zapi-send-item-added.
        await supabase.from("whatsapp_messages").insert({
          tenant_id: tenantId,
          phone: senderPhone,
          message: `[SISTEMA] Produto ${product.code} adicionado ao pedido${order?.id ? ` #${order.id}` : ""}; template ITEM_ADDED enfileirado.`,
          type: "system_log",
          product_name: product.name,
          sent_at: new Date().toISOString(),
          order_id: order?.id || null,
          delivery_status: "QUEUED",
        });
      }

      results.push({ code: codeUpper, success: true, product: product.name, qty: cartItem.qty, order_id: order?.id });
    }

    return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("[evolution-webhook] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
