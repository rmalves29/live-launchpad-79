/**
 * Instagram Graph API Webhook Handler
 *
 * Recebe notificações oficiais do Instagram para Live Commerce multitenant.
 *
 * Fluxo:
 * 1. GET: Validação do webhook pela Meta (hub.mode, hub.verify_token, hub.challenge)
 * 2. POST: Processa comentários de lives
 *    - Identifica tenant pelo page_id
 *    - Busca produto pelo código no comentário
 *    - Cria/atualiza carrinho e pedido
 *    - Envia DM de confirmação via Graph API
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Segredos usados pela Meta para assinar o corpo do webhook (X-Hub-Signature-256).
const SIGNATURE_SECRETS = [Deno.env.get('INSTAGRAM_APP_SECRET'), Deno.env.get('FACEBOOK_APP_SECRET')].filter(Boolean) as string[];
// Com INSTAGRAM_WEBHOOK_ENFORCE_SIGNATURE=true, chamadas sem assinatura válida são rejeitadas (401).
// Sem isso fica em modo "só registra" (aviso no log) para não derrubar entregas reais da Meta.
const ENFORCE_SIGNATURE = Deno.env.get('INSTAGRAM_WEBHOOK_ENFORCE_SIGNATURE') === 'true';

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyMetaSignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!header || !header.startsWith('sha256=')) return false;
  const received = header.slice('sha256='.length).toLowerCase();
  for (const secret of SIGNATURE_SECRETS) {
    if (safeEqual(received, await hmacHex(secret, rawBody))) return true;
  }
  return false;
}

const WEBHOOK_VERIFY_TOKEN = Deno.env.get('INSTAGRAM_WEBHOOK_VERIFY_TOKEN') || 'orderzap_instagram_verify';

// Regex para capturar código do produto com quantidade opcional
// Formatos: "C517 2x", "2x C517", "C5172x", "2xC517", "C517" (default qty=1)
const PRODUCT_WITH_QTY_REGEX = /\b(\d{1,3})\s*[xX]\s*([A-Za-z]{1,4}[-]?[0-9]{1,6})\b|\b([A-Za-z]{1,4}[-]?[0-9]{1,6})\s*(\d{1,3})\s*[xX]\b|\b([A-Za-z]{1,4}[-]?[0-9]{1,6})\b/i;
const COMMENT_FIELDS = new Set(['comments', 'live_comments']);

interface InstagramWebhookEntry {
  id: string;
  time: number;
  changes?: Array<{
    field: string;
    value: {
      from: {
        id: string;
        username?: string;
        self_ig_scoped_id?: string;
      };
      media?: {
        id: string;
        media_product_type?: string;
      };
      id: string;
      text: string;
      timestamp?: string;
    };
  }>;
}

interface InstagramWebhookPayload {
  object: string;
  entry: InstagramWebhookEntry[];
}

interface InstagramIntegrationRecord {
  id: string;
  tenant_id: string;
  instagram_account_id: string | null;
  instagram_username: string | null;
  access_token: string | null;
  page_access_token: string | null;
  page_id: string | null;
  send_cadastro_dm: boolean;
  tenants?: { slug?: string | null; name?: string | null } | Array<{ slug?: string | null; name?: string | null }>;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const timestamp = new Date().toISOString();

  if (req.method === 'GET') {
    const hubMode = url.searchParams.get('hub.mode');
    const hubVerifyToken = url.searchParams.get('hub.verify_token');
    const hubChallenge = url.searchParams.get('hub.challenge');

    console.log(`[${timestamp}] [instagram-webhook] GET validation request`);
    console.log(`[${timestamp}] [instagram-webhook] hub.mode: ${hubMode}`);
    console.log(`[${timestamp}] [instagram-webhook] hub.verify_token: ${hubVerifyToken ? '***' : 'missing'}`);

    if (hubMode === 'subscribe' && hubVerifyToken === WEBHOOK_VERIFY_TOKEN) {
      console.log(`[${timestamp}] [instagram-webhook] ✅ Validation successful, returning challenge`);
      return new Response(hubChallenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    console.log(`[${timestamp}] [instagram-webhook] ❌ Validation failed`);
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();

    // Origem: chamada interna (sincronização por minuto / ensaio) ou assinatura da Meta.
    const isInternal = req.headers.get('x-internal-key') === supabaseServiceKey;
    if (!isInternal) {
      const signatureOk = await verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256'));
      if (!signatureOk) {
        console.warn(`[${timestamp}] [instagram-webhook] ⚠️ Assinatura da Meta ausente/inválida (enforce=${ENFORCE_SIGNATURE})`);
        if (ENFORCE_SIGNATURE) {
          return new Response(JSON.stringify({ error: 'invalid signature' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        console.log(`[${timestamp}] [instagram-webhook] ✅ Assinatura da Meta válida`);
      }
    }

    const body: InstagramWebhookPayload = JSON.parse(rawBody);
    console.log(`[${timestamp}] [instagram-webhook] POST received:`, JSON.stringify(body, null, 2));

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    await insertWebhookLog(supabase, body, timestamp);

    if (body.object !== 'instagram') {
      console.log(`[${timestamp}] [instagram-webhook] Ignoring non-instagram object: ${body.object}`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (const entry of body.entry) {
      const sourceId = entry.id;
      console.log(`[${timestamp}] [instagram-webhook] Processing entry for source: ${sourceId}`);

      const integration = await findIntegrationForEntry(supabase, entry, timestamp);
      if (!integration) {
        console.log(`[${timestamp}] [instagram-webhook] No active integration found for source: ${sourceId}`);
        continue;
      }

      await syncWebhookSourceId(supabase, integration, sourceId, timestamp);

      const tenantId = integration.tenant_id;
      const tenantSlug = getTenantSlug(integration.tenants);
      // Use page_access_token if available, otherwise fall back to Instagram access_token
      const pageAccessToken = integration.page_access_token || integration.access_token;
      const useInstagramApi = !integration.page_access_token && !!integration.access_token;

      console.log(`[${timestamp}] [instagram-webhook] Found tenant: ${tenantId} (${tenantSlug})`);

      if (!entry.changes) continue;

      for (const change of entry.changes) {
        if (!COMMENT_FIELDS.has(change.field)) {
          console.log(`[${timestamp}] [instagram-webhook] Ignoring field: ${change.field}`);
          continue;
        }

        const { value } = change;
        const buyerIgId = value.from.id;
        // For DMs, use the Instagram-Scoped ID (IGSID) if available
        const buyerIgsid = value.from.self_ig_scoped_id || null;
        const buyerId = buyerIgId; // Keep for cart/order logic
        const buyerUsername = value.from.username || '';
        const commentId = value.id;
        const commentText = value.text;
        const mediaId = value.media?.id;
        const extractedCode = extractProductCode(commentText);
        const earlyProductCode = extractedCode?.normalized ?? null;
        const requestedQty = extractedCode?.qty ?? 1;
        const isLiveComment = change.field === 'live_comments' || value.media?.media_product_type === 'LIVE';
        // Comentário de ensaio (modo simulação): cria a venda de verdade, mas não envia DM nem resposta.
        const isSimulated = typeof commentId === 'string' && commentId.startsWith('sim_');

        // Resposta pública automática (opcional, por loja). Nunca bloqueia a venda.
        const autoReply = async (kind: 'added' | 'out_of_stock', productName?: string) => {
          try {
            if (isSimulated || !pageAccessToken || !commentId) return;
            if (buyerIgId === integration.instagram_account_id || buyerIgId === integration.page_id) return;
            const cfg = integration as any;
            const enabled = kind === 'added' ? cfg.auto_reply_added : cfg.auto_reply_out_of_stock;
            if (!enabled) return;
            const template: string = (kind === 'added' ? cfg.auto_reply_added_text : cfg.auto_reply_out_of_stock_text)
              || (kind === 'added'
                ? '✅ {{produto}} anotado, @{{usuario}}! Te enviei os detalhes por DM.'
                : '😕 Essa peça esgotou, @{{usuario}}. Fique de olho nas próximas!');
            const message = template
              .replace(/\{\{\s*produto\s*\}\}/g, productName || '')
              .replace(/\{\{\s*usuario\s*\}\}/g, buyerUsername)
              .slice(0, 300);
            const base = useInstagramApi ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v19.0';
            const res = await fetch(`${base}/${commentId}/replies`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message, access_token: pageAccessToken }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              console.warn(`[${timestamp}] [instagram-webhook] Public reply (${kind}) failed:`, err?.error?.message || res.status);
            }
          } catch (e: any) {
            console.warn(`[${timestamp}] [instagram-webhook] Public reply (${kind}) error:`, e?.message);
          }
        };

        console.log(`[${timestamp}] [instagram-webhook] Comment from @${buyerUsername} (${buyerId}) [${change.field}]: "${commentText}"`);

        if (commentId) {
          const { data: existingComment, error: existingCommentError } = await supabase
            .from('instagram_live_comments')
            .select('id, comment_status')
            .eq('tenant_id', tenantId)
            .eq('comment_id', commentId)
            .maybeSingle();

          if (existingCommentError) {
            console.warn(`[${timestamp}] [instagram-webhook] Could not check duplicate comment ${commentId}:`, existingCommentError.message);
          } else if (existingComment) {
            console.log(`[${timestamp}] [instagram-webhook] Duplicate comment ignored: ${commentId} (${existingComment.comment_status})`);
            continue;
          }
        }

        // Insert comment initially with no_code status
        const initialStatus = extractedCode ? 'not_found' : 'no_code';

        // O INSERT é o "lock" de idempotência: o índice único (tenant_id, comment_id) garante
        // que, mesmo com webhook + sincronização rodando juntos, só um processa o comentário.
        const insertResult = await insertLiveComment(supabase, {
          tenant_id: tenantId,
          instagram_user_id: buyerId,
          username: buyerUsername || null,
          comment_text: commentText,
          comment_id: commentId,
          media_id: mediaId || null,
          is_live: isLiveComment,
          product_code: earlyProductCode,
          product_found: false,
          comment_status: initialStatus,
        }, timestamp);

        if (insertResult === 'duplicate') {
          console.log(`[${timestamp}] [instagram-webhook] Duplicate comment ignored (unique index): ${commentId}`);
          continue;
        }

        if (!extractedCode) {
          console.log(`[${timestamp}] [instagram-webhook] No product code found in comment`);
          continue;
        }

        const productCode = extractedCode.normalized;
        console.log(`[${timestamp}] [instagram-webhook] Extracted product code: ${productCode}`);

        let product = null;

        // Para comentários de live, filtrar apenas produtos com sale_type LIVE ou AMBOS
        const saleTypeFilter = isLiveComment ? ['LIVE', 'AMBOS'] : undefined;

        // Somente código EXATO (sem busca aproximada): "C51" nunca pode virar "C517".
        // Se houver mais de um produto com o mesmo código, prefere o que tem estoque (e o mais recente).
        let exactQuery = supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .ilike('code', escapeLikeExact(productCode))
          .order('id', { ascending: false })
          .limit(10);

        if (saleTypeFilter) {
          exactQuery = exactQuery.in('sale_type', saleTypeFilter);
        }

        const { data: exactProducts, error: exactError } = await exactQuery;

        if (exactError) {
          console.error(`[${timestamp}] [instagram-webhook] Product lookup error:`, exactError.message);
        } else if (exactProducts && exactProducts.length > 0) {
          if (exactProducts.length > 1) {
            console.warn(`[${timestamp}] [instagram-webhook] ⚠️ ${exactProducts.length} produtos com o código ${productCode}; escolhendo o com estoque`);
          }
          product = exactProducts.find((p: any) => Number(p.stock) > 0) || exactProducts[0];
        }

        if (!product) {
          // Check if product exists but is not for LIVE (sale_type mismatch)
          if (isLiveComment) {
            const { data: anyProducts } = await supabase
              .from('products')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('is_active', true)
              .ilike('code', escapeLikeExact(productCode))
              .limit(1);
            const anyProduct = anyProducts && anyProducts.length > 0 ? anyProducts[0] : null;

            if (anyProduct) {
              // Product exists but not registered for LIVE → lilás
              console.log(`[${timestamp}] [instagram-webhook] Product ${productCode} exists but not for LIVE`);
              await updateLiveCommentStatus(supabase, tenantId, commentId, 'not_for_live', timestamp);
              continue;
            }
          }

          console.log(`[${timestamp}] [instagram-webhook] Product not found: ${productCode}`);
          // Status stays 'not_found' (already set on insert)
          continue;
        }

        console.log(`[${timestamp}] [instagram-webhook] Product found: ${product.name} (${product.code})`);

        if (product.stock <= 0) {
          console.log(`[${timestamp}] [instagram-webhook] Product out of stock: ${product.code}`);
          await updateLiveCommentStatus(supabase, tenantId, commentId, 'out_of_stock', timestamp);
          await autoReply('out_of_stock');
          // Não envia DM de estoque esgotado
          continue;
        }

        // Reserva ATÔMICA do estoque: o primeiro comentário a chegar leva a peça.
        // Se dois comentários disputam a última unidade, o banco serializa e só um recebe sucesso.
        const { data: reservedStock, error: reserveError } = await supabase.rpc('reserve_product_stock', {
          p_product_id: product.id,
          p_qty: requestedQty,
        });

        if (reserveError) {
          console.error(`[${timestamp}] [instagram-webhook] ❌ Stock reservation error for ${product.code}:`, reserveError.message);
          await updateLiveCommentStatus(supabase, tenantId, commentId, 'out_of_stock', timestamp);
          await autoReply('out_of_stock');
          continue;
        }

        if (reservedStock === null || reservedStock === undefined) {
          console.log(`[${timestamp}] [instagram-webhook] ❌ Product ${product.code} insufficient stock for qty=${requestedQty}`);
          await updateLiveCommentStatus(supabase, tenantId, commentId, 'out_of_stock', timestamp);
          await autoReply('out_of_stock');
          continue;
        }

        console.log(`[${timestamp}] [instagram-webhook] Stock reserved: ${product.code} -${requestedQty} (restante=${reservedStock})`);
        const releaseReservedStock = async (reason: string) => {
          const { error: releaseError } = await supabase.rpc('release_product_stock', {
            p_product_id: product.id,
            p_qty: requestedQty,
          });
          console.warn(`[${timestamp}] [instagram-webhook] Stock released (${reason}): ${product.code} +${requestedQty}${releaseError ? ` — ERRO: ${releaseError.message}` : ''}`);
        };

        // Usar horário de Brasília (UTC-3) para a data do evento
        const brasiliaOffset = -3;
        const nowUtc = new Date();
        const brasiliaTime = new Date(nowUtc.getTime() + brasiliaOffset * 60 * 60 * 1000);
        const today = brasiliaTime.toISOString().split('T')[0];

        // Buscar cliente cadastrado pelo @instagram
        const customerData = await resolveCustomerByInstagram(supabase, tenantId, buyerUsername, timestamp);
        const customerPhone = customerData?.phone || `@${buyerUsername || buyerId}`;
        const customerName = customerData?.name || (buyerUsername ? `@${buyerUsername}` : 'Instagram');
        const customerCartPhone = customerData?.phone || `@${buyerUsername || buyerId}`;

        console.log(`[${timestamp}] [instagram-webhook] Customer resolved: phone=${customerPhone}, name=${customerName}, registered=${!!customerData}`);

        let { data: cart } = await supabase
          .from('carts')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('customer_instagram', buyerId)
          .eq('status', 'OPEN')
          .maybeSingle();

        // Check if customer already has items (for "repeat_added" status)
        let isRepeatBuyer = false;

        if (!cart) {
          const { data: newCart, error: cartError } = await supabase
            .from('carts')
            .insert({
              tenant_id: tenantId,
              customer_phone: customerCartPhone,
              customer_instagram: buyerId,
              event_date: today,
              event_type: isLiveComment ? 'INSTAGRAM_LIVE' : 'INSTAGRAM_COMMENT',
              status: 'OPEN',
            })
            .select()
            .single();

          if (cartError) {
            console.error(`[${timestamp}] [instagram-webhook] Cart creation error:`, cartError);
            await releaseReservedStock('cart_error');
            continue;
          }

          cart = newCart;
          console.log(`[${timestamp}] [instagram-webhook] New cart created: ${cart.id}`);
        } else {
          // Cart already exists → customer already has items
          const { data: existingItems } = await supabase
            .from('cart_items')
            .select('id')
            .eq('cart_id', cart.id)
            .limit(1);
          if (existingItems && existingItems.length > 0) {
            isRepeatBuyer = true;
          }
        }

        const { data: existingItem } = await supabase
          .from('cart_items')
          .select('*')
          .eq('cart_id', cart.id)
          .eq('product_id', product.id)
          .maybeSingle();

        const effectiveUnitPrice = (product.promotional_price && product.promotional_price > 0)
          ? product.promotional_price
          : product.price;

        if (existingItem) {
          // Already has this specific product → also repeat
          isRepeatBuyer = true;
          const itemQty = existingItem.qty + requestedQty;

          const { error: updateItemError } = await supabase
            .from('cart_items')
            .update({ qty: itemQty, unit_price: effectiveUnitPrice })
            .eq('id', existingItem.id);

          if (updateItemError) {
            console.error(`[${timestamp}] [instagram-webhook] ❌ Cart item update failed for ${product.code}:`, updateItemError.message);
            await releaseReservedStock('cart_item_update_error');
            continue;
          }

          console.log(`[${timestamp}] [instagram-webhook] Item quantity updated: ${product.code} qty=${itemQty}`);
        } else {
          const { error: insertItemError } = await supabase
            .from('cart_items')
            .insert({
              tenant_id: tenantId,
              cart_id: cart.id,
              product_id: product.id,
              product_code: product.code,
              product_name: product.name,
              product_image_url: product.image_url,
              unit_price: effectiveUnitPrice,
              qty: requestedQty,
            });

          if (insertItemError) {
            console.error(`[${timestamp}] [instagram-webhook] ❌ Cart item insert failed for ${product.code}:`, insertItemError.message);
            await releaseReservedStock('cart_item_insert_error');
            continue;
          }

          console.log(`[${timestamp}] [instagram-webhook] New item added: ${product.code} qty=${requestedQty}`);
        }

        // Mark comment as product found with appropriate status
        const commentStatus = isRepeatBuyer ? 'repeat_added' : 'added';
        await updateLiveCommentStatus(supabase, tenantId, commentId, commentStatus, timestamp, true);
        await autoReply('added', product.name);

        const { data: cartItems } = await supabase
          .from('cart_items')
          .select('unit_price, qty, product_name')
          .eq('cart_id', cart.id);

        const total = cartItems?.reduce((sum, item) => sum + (item.unit_price * item.qty), 0) || 0;

        const { data: existingOrder } = await supabase
          .from('orders')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('cart_id', cart.id)
          .maybeSingle();

        let order = existingOrder;

        if (existingOrder) {
          const { data: updatedOrder, error: updateError } = await supabase
            .from('orders')
            .update({ total_amount: total })
            .eq('id', existingOrder.id)
            .select()
            .single();

          if (!updateError) {
            order = updatedOrder;
            console.log(`[${timestamp}] [instagram-webhook] Order updated: ${order.id}, total: ${total}`);
          }
        } else {
          const { data: newOrder, error: orderError } = await supabase
            .from('orders')
            .insert({
              tenant_id: tenantId,
              cart_id: cart.id,
              customer_phone: customerPhone,
              customer_name: customerName,
              event_date: today,
              event_type: isLiveComment ? 'INSTAGRAM_LIVE' : 'INSTAGRAM_COMMENT',
              total_amount: total,
              is_paid: false,
              printed: false,
              item_added_message_sent: false,
              payment_confirmation_sent: false,
              is_cancelled: false,
              source: 'instagram',
              ...(customerData ? {
                customer_cep: customerData.cep || null,
                customer_street: customerData.street || null,
                customer_number: customerData.number || null,
                customer_neighborhood: customerData.neighborhood || null,
                customer_city: customerData.city || null,
                customer_state: customerData.state || null,
                customer_complement: customerData.complement || null,
              } : {}),
            })
            .select()
            .single();

          if (!orderError) {
            order = newOrder;
            console.log(`[${timestamp}] [instagram-webhook] New order created: ${order.id}, total: ${total}`);
          }
        }

        if (order?.id && commentId) {
          const { error: linkError } = await supabase
            .from('instagram_live_comments')
            .update({ order_id: order.id, matched_qty: requestedQty })
            .eq('tenant_id', tenantId)
            .eq('comment_id', commentId);
          if (linkError) {
            console.warn(`[${timestamp}] [instagram-webhook] Could not link comment to order:`, linkError.message);
          }
        }

        const hasRegistration = !!customerData;
        const hasPhone = !!customerData?.phone;


        if (isSimulated) {
          console.log(`[${timestamp}] [instagram-webhook] Ensaio: DM/WhatsApp não enviados para ${commentId}`);
        } else if (pageAccessToken) {
          // Determine the DM recipient ID: use IGSID for messaging, skip if commenting on own account
          const dmRecipientId = buyerIgsid || buyerIgId;
          const isOwnerCommenting = buyerIgId === integration.instagram_account_id || buyerIgId === integration.page_id;

          if (isOwnerCommenting) {
            console.log(`[${timestamp}] [instagram-webhook] Skipping DM: comment is from account owner (@${buyerUsername})`);
          } else {
            const checkoutUrl = `https://app.orderzaps.com/t/${tenantSlug}/checkout`;
            const cadastroUrl = `https://app.orderzaps.com/t/${tenantSlug}/cadastro-instagram`;
            const priceFormatted = `R$ ${product.price.toFixed(2).replace('.', ',')}`;
            const totalFormatted = `R$ ${total.toFixed(2).replace('.', ',')}`;
            const qtyLabel = requestedQty > 1 ? ` (${requestedQty}x)` : '';

            console.log(`[${timestamp}] [instagram-webhook] DM recipient: ${dmRecipientId} (IGSID: ${buyerIgsid || 'N/A'}, IG ID: ${buyerIgId})`);

            const { data: dmTemplate } = await supabase
              .from('whatsapp_templates')
              .select('content, is_active')
              .eq('tenant_id', tenantId)
              .eq('type', 'DM_INSTAGRAM_CADASTRO')
              .maybeSingle();
            const dmCadastroDisabled = dmTemplate ? dmTemplate.is_active === false : false;

            // A Meta permite UMA private reply por comentário. Se a DM de cadastro (que já traz produto,
            // valor e total) sair com sucesso, não enviamos a de "item adicionado" para o mesmo comentário.
            let cadastroDmSent = false;

            if ((!hasRegistration || !hasPhone) && integration.send_cadastro_dm && !dmCadastroDisabled) {
              let cadastroDmMessage = '';
              if (dmTemplate?.content) {
                cadastroDmMessage = dmTemplate.content
                  .replace(/\{\{produto\}\}/g, product.name)
                  .replace(/\{\{quantidade\}\}/g, String(requestedQty))
                  .replace(/\{\{valor_unitario\}\}/g, priceFormatted)
                  .replace(/\{\{total\}\}/g, totalFormatted)
                  .replace(/\{\{link_cadastro\}\}/g, cadastroUrl);

                // Como esta é a ÚNICA DM enviada nesse comentário, ela precisa confirmar o produto.
                // Templates personalizados sem {{produto}} ganham um resumo no início.
                if (!/\{\{\s*produto\s*\}\}/.test(dmTemplate.content)) {
                  cadastroDmMessage =
                    `✅ *${product.name}*${qtyLabel} foi adicionado ao seu pedido!\n` +
                    `💰 Valor: ${priceFormatted} · 🛒 Total: ${totalFormatted}\n\n` +
                    cadastroDmMessage;
                }
              } else {
                cadastroDmMessage =
                  `✅ *${product.name}*${qtyLabel} foi adicionado ao seu pedido!\n\n` +
                  `💰 Valor: ${priceFormatted}\n` +
                  `🛒 Total: ${totalFormatted}\n\n` +
                  `📋 Para continuar comprando e finalizar seu pedido, você precisa fazer seu cadastro (leva 1 minuto):\n${cadastroUrl}\n\n` +
                  `Seu produto já está reservado no seu pedido. Depois do cadastro, é só seguir com o pagamento. ✨`;
              }

              console.log(`[${timestamp}] [instagram-webhook] Sending DM Cadastro to ${dmRecipientId}, template found: ${!!dmTemplate?.content}`);
              const dmResult = await sendInstagramDM(dmRecipientId, pageAccessToken, cadastroDmMessage, useInstagramApi, commentId);
              await logInstagramDm(supabase, {
                tenant_id: tenantId, comment_id: commentId, order_id: order?.id ?? null,
                instagram_user_id: buyerIgId, username: buyerUsername || null,
                dm_type: 'cadastro', message: cadastroDmMessage, result: dmResult,
              });
              if (dmResult.success) {
                cadastroDmSent = true;
                console.log(`[${timestamp}] [instagram-webhook] DM Cadastro sent to ${dmRecipientId}`);
              } else {
                console.error(`[${timestamp}] [instagram-webhook] DM Cadastro failed:`, dmResult.error);
              }
            }

            // Sempre envia DM de "item adicionado" (mesmo se o cliente já tem telefone cadastrado),
            // a menos que o template ITEM_ADDED esteja desativado na tela de Templates.
            const { data: itemAddedTemplate } = await supabase
              .from('whatsapp_templates')
              .select('content, is_active')
              .eq('tenant_id', tenantId)
              .eq('type', 'ITEM_ADDED')
              .order('updated_at', { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle();

            if (cadastroDmSent) {
              console.log(`[${timestamp}] [instagram-webhook] SKIPPED: DM de cadastro já enviada para o comentário ${commentId} (limite de 1 private reply)`);
            } else if (itemAddedTemplate && itemAddedTemplate.is_active === false) {
              console.log(`[${timestamp}] [instagram-webhook] SKIPPED: template ITEM_ADDED está desativado para o tenant ${tenantId}`);
            } else {
              const effectivePrice = (product.promotional_price && product.promotional_price > 0)
                ? product.promotional_price
                : product.price;

              const itensPedidoLines = (cartItems || [])
                .map((item) => `${item.qty}x ${item.product_name} — R$ ${(item.unit_price * item.qty).toFixed(2).replace('.', ',')}`)
                .join('\n');

              const dmMessage = itemAddedTemplate?.content
                ? renderItemAddedTemplate(itemAddedTemplate.content, {
                    productName: product.name,
                    productCode: product.code,
                    quantity: requestedQty,
                    unitPrice: effectivePrice,
                    cartTotal: total,
                    checkoutUrl,
                    orderNumber: order?.id ? String(order.id) : '',
                    itemsList: itensPedidoLines,
                  })
                : `✅ *${product.name}*${qtyLabel} adicionado!\n\n` +
                  `💰 Valor unitário: ${priceFormatted}\n` +
                  `🛒 Total do carrinho: ${totalFormatted}\n\n` +
                  `Para finalizar seu pedido, acesse:\n${checkoutUrl}`;

              console.log(`[${timestamp}] [instagram-webhook] Sending DM ITEM_ADDED to ${dmRecipientId}, template found: ${!!itemAddedTemplate?.content}`);
              const dmResult = await sendInstagramDM(dmRecipientId, pageAccessToken, dmMessage, useInstagramApi, commentId);
              await logInstagramDm(supabase, {
                tenant_id: tenantId, comment_id: commentId, order_id: order?.id ?? null,
                instagram_user_id: buyerIgId, username: buyerUsername || null,
                dm_type: 'item_added', message: dmMessage, result: dmResult,
              });
              if (dmResult.success) {
                console.log(`[${timestamp}] [instagram-webhook] DM sent successfully to ${dmRecipientId}`);
              } else {
                console.error(`[${timestamp}] [instagram-webhook] DM failed:`, dmResult.error);
              }
            }
          }
          // DM é sempre enviada (cadastro ou item adicionado)
        } else {
          console.log(`[${timestamp}] [instagram-webhook] No page_access_token, skipping DM`);
        }

        // WhatsApp direto se tem telefone
        if (hasPhone && order && !isSimulated) {
          await triggerWhatsAppItemAdded(supabase, tenantId, customerData.phone, product, order, timestamp, requestedQty);
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error(`[${timestamp}] [instagram-webhook] Error:`, error.message || error);

    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Escapa curingas do LIKE/ILIKE para que a busca seja por igualdade exata (sem %, _ ou \ interpretados).
function escapeLikeExact(value: string) {
  return value.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

function extractProductCode(commentText: string) {
  const match = commentText.match(PRODUCT_WITH_QTY_REGEX);
  if (!match) return null;

  const rawCode = match[2] || match[3] || match[5];
  const rawQty = match[1] || match[4];
  const qty = rawQty ? Math.min(parseInt(rawQty, 10), 99) : 1;

  if (!rawCode) return null;

  return {
    raw: rawCode,
    normalized: rawCode.toUpperCase().replace(/-/g, ''),
    qty: qty < 1 ? 1 : qty,
  };
}

function getTenantSlug(tenants: InstagramIntegrationRecord['tenants']) {
  if (!tenants) return '';
  if (Array.isArray(tenants)) return tenants[0]?.slug || '';
  return tenants.slug || '';
}

async function insertWebhookLog(supabase: ReturnType<typeof createClient>, body: InstagramWebhookPayload, timestamp: string) {
  try {
    const { error } = await supabase.from('webhook_logs').insert({
      webhook_type: 'instagram_graph_api',
      payload: body,
      status_code: 200,
    });

    if (error) {
      console.warn(`[${timestamp}] [instagram-webhook] webhook_logs insert skipped: ${error.message}`);
    }
  } catch (error: any) {
    console.warn(`[${timestamp}] [instagram-webhook] webhook_logs unavailable: ${error.message || error}`);
  }
}

async function insertLiveComment(
  supabase: ReturnType<typeof createClient>,
  payload: {
    tenant_id: string;
    instagram_user_id: string;
    username: string | null;
    comment_text: string;
    comment_id: string;
    media_id: string | null;
    is_live: boolean;
    product_code: string | null;
    product_found: boolean;
    comment_status: string;
  },
  timestamp: string,
): Promise<'inserted' | 'duplicate' | 'error'> {
  const { error } = await supabase.from('instagram_live_comments').insert(payload);

  if (error) {
    if (error.code === '23505') return 'duplicate';
    console.error(`[${timestamp}] [instagram-webhook] Error saving live comment:`, error);
    return 'error';
  }
  return 'inserted';
}

async function updateLiveCommentStatus(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  commentId: string,
  status: string,
  timestamp: string,
  productFound: boolean = false,
) {
  const { error } = await supabase
    .from('instagram_live_comments')
    .update({ comment_status: status, product_found: productFound })
    .eq('tenant_id', tenantId)
    .eq('comment_id', commentId);

  if (error) {
    console.warn(`[${timestamp}] [instagram-webhook] Error updating comment_status:`, error);
  }
}

function pickBestIntegration(
  rows: any[],
  sourceId: string,
): InstagramIntegrationRecord | null {
  if (!rows || rows.length === 0) return null;
  const score = (r: any) => {
    let s = 0;
    if (r.page_id === sourceId) s += 8;
    if (r.page_access_token) s += 4;
    if (r.access_token) s += 2;
    return s;
  };
  const sorted = [...rows].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
  });
  return sorted[0] as InstagramIntegrationRecord;
}

async function findIntegrationForEntry(
  supabase: ReturnType<typeof createClient>,
  entry: InstagramWebhookEntry,
  timestamp: string,
): Promise<InstagramIntegrationRecord | null> {
  // NOTE: the same instagram_account_id can be linked to more than one tenant,
  // so we must NOT use maybeSingle() here (it errors with multiple rows).
  const { data: rows, error } = await supabase
    .from('integration_instagram')
    .select('*, tenants!inner(id, slug, name)')
    .or(`page_id.eq.${entry.id},instagram_account_id.eq.${entry.id}`)
    .eq('is_active', true);

  if (error) {
    console.error(`[${timestamp}] [instagram-webhook] Error fetching integration by source id:`, error);
    return null;
  }

  const integration = pickBestIntegration(rows || [], entry.id);
  if (integration) {
    if ((rows || []).length > 1) {
      console.warn(`[${timestamp}] [instagram-webhook] ⚠️ ${rows!.length} integrations match source ${entry.id}; selected tenant ${integration.tenant_id}`);
    }
    return integration;
  }

  const ownerComment = (entry.changes || []).find((change) => {
    if (!COMMENT_FIELDS.has(change.field)) return false;
    return change.value?.from?.id === entry.id && !!change.value?.from?.username;
  });

  const ownerUsername = ownerComment?.value?.from?.username;
  if (!ownerUsername) {
    return null;
  }

  const { data: fallbackRows, error: fallbackError } = await supabase
    .from('integration_instagram')
    .select('*, tenants!inner(id, slug, name)')
    .eq('instagram_username', ownerUsername)
    .eq('is_active', true);

  if (fallbackError) {
    console.error(`[${timestamp}] [instagram-webhook] Error fetching integration by username fallback:`, fallbackError);
    return null;
  }

  const fallbackIntegration = pickBestIntegration(fallbackRows || [], entry.id);
  if (fallbackIntegration) {
    console.log(`[${timestamp}] [instagram-webhook] Fallback match by username @${ownerUsername} → tenant ${fallbackIntegration.tenant_id}`);
    return fallbackIntegration;
  }

  return null;
}


async function syncWebhookSourceId(
  supabase: ReturnType<typeof createClient>,
  integration: InstagramIntegrationRecord,
  sourceId: string,
  timestamp: string,
) {
  if (integration.page_id === sourceId) return;

  const { error } = await supabase
    .from('integration_instagram')
    .update({
      page_id: sourceId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id);

  if (error) {
    console.warn(`[${timestamp}] [instagram-webhook] Could not persist webhook source id ${sourceId}: ${error.message}`);
    return;
  }

  console.log(`[${timestamp}] [instagram-webhook] Synced webhook source id ${sourceId} to integration ${integration.id}`);
}

async function sendInstagramPrivateReply(
  commentId: string,
  accessToken: string,
  message: string,
  useInstagramApi: boolean = false
): Promise<{ success: boolean; error?: string; channel?: string }> {
  try {
    const base = useInstagramApi
      ? `https://graph.instagram.com/v21.0/me/messages`
      : `https://graph.facebook.com/v19.0/me/messages`;

    const response = await fetch(`${base}?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text: message },
      }),
    });

    if (response.ok) return { success: true, channel: 'private_reply' };

    const errorData = await response.json().catch(() => ({}));
    console.error('[instagram-webhook] Private reply error:', JSON.stringify(errorData));
    return { success: false, error: errorData?.error?.message || `HTTP ${response.status}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Registro de auditoria das DMs (best-effort: nunca pode quebrar o fluxo da venda).
async function logInstagramDm(
  supabase: ReturnType<typeof createClient>,
  entry: {
    tenant_id: string;
    comment_id?: string | null;
    order_id?: number | null;
    instagram_user_id?: string | null;
    username?: string | null;
    dm_type: 'cadastro' | 'item_added';
    message: string;
    result: { success: boolean; error?: string; channel?: string };
  },
): Promise<void> {
  try {
    const { error } = await supabase.from('instagram_dm_log').insert({
      tenant_id: entry.tenant_id,
      comment_id: entry.comment_id ?? null,
      order_id: entry.order_id ?? null,
      instagram_user_id: entry.instagram_user_id ?? null,
      username: entry.username ?? null,
      dm_type: entry.dm_type,
      message: entry.message.slice(0, 2000),
      status: entry.result.success ? 'sent' : 'failed',
      channel: entry.result.channel ?? null,
      error: entry.result.success ? null : (entry.result.error ?? 'unknown').slice(0, 500),
    });
    if (error) console.warn('[instagram-webhook] Could not log DM:', error.message);
  } catch (e: any) {
    console.warn('[instagram-webhook] Could not log DM:', e?.message);
  }
}

async function sendInstagramDM(
  recipientId: string,
  accessToken: string,
  message: string,
  useInstagramApi: boolean = false,
  commentId?: string | null
): Promise<{ success: boolean; error?: string; channel?: string }> {
  // Comentários de live/post: a private reply é o canal permitido (janela de 7 dias),
  // enquanto /messages exige janela de 24h de interação prévia.
  let privateReplyError: string | undefined;
  if (commentId) {
    const reply = await sendInstagramPrivateReply(commentId, accessToken, message, useInstagramApi);
    if (reply.success) return reply;
    privateReplyError = reply.error;
    console.warn('[instagram-webhook] Private reply falhou, tentando DM padrão:', reply.error);
  }

  try {
    // If using Instagram access_token (not Facebook Page token), use Instagram Graph API
    const apiUrl = useInstagramApi
      ? `https://graph.instagram.com/v21.0/me/messages`
      : `https://graph.facebook.com/v19.0/me/messages`;

    const response = await fetch(
      `${apiUrl}?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
        }),
      }
    );

    if (response.ok) {
      return { success: true, channel: 'dm' };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;
    console.error(`[instagram-webhook] DM API error (${useInstagramApi ? 'instagram' : 'facebook'}):`, JSON.stringify(errorData));

    if (errorData?.error?.code === 190) {
      console.error('[instagram-webhook] Token expired or invalid');
      return { success: false, error: 'Token expirado ou inválido', channel: 'dm' };
    }

    // Registra as duas falhas (private reply + DM padrão) para o log mostrar o motivo real.
    const combined = privateReplyError ? `private_reply: ${privateReplyError} | dm: ${errorMsg}` : errorMsg;
    return { success: false, error: combined, channel: 'dm' };
  } catch (error: any) {
    return { success: false, error: error.message, channel: 'dm' };
  }
}


interface ResolvedCustomer {
  phone: string;
  name: string;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  complement?: string | null;
}

async function resolveCustomerByInstagram(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  username: string,
  timestamp: string,
): Promise<ResolvedCustomer | null> {
  if (!username) return null;

  const cleanUsername = username.replace(/^@/, '');

  const { data: customer, error } = await supabase
    .from('customers')
    .select('name, phone, cep, street, number, neighborhood, city, state, complement')
    .eq('tenant_id', tenantId)
    .ilike('instagram', cleanUsername)
    .maybeSingle();

  if (error) {
    console.warn(`[${timestamp}] [instagram-webhook] Error looking up customer by instagram @${cleanUsername}:`, error);
    return null;
  }

  if (!customer) {
    console.log(`[${timestamp}] [instagram-webhook] No registered customer found for @${cleanUsername}`);
    return null;
  }

  console.log(`[${timestamp}] [instagram-webhook] Found registered customer: ${customer.name} (${customer.phone}) for @${cleanUsername}`);
  return customer as ResolvedCustomer;
}

async function triggerWhatsAppItemAdded(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  customerPhone: string,
  product: any,
  order: any,
  timestamp: string,
  qty: number = 1,
) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const response = await fetch(
      `${supabaseUrl}/functions/v1/zapi-send-item-added`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          customer_phone: customerPhone,
          product_name: product.name,
          product_code: product.code,
          quantity: qty,
          unit_price: (product.promotional_price && product.promotional_price > 0) ? product.promotional_price : product.price,
        }),
      }
    );

    const responseText = await response.text();
    console.log(`[${timestamp}] [instagram-webhook] WhatsApp item-added sent to ${customerPhone}: status=${response.status}`);
  } catch (e: any) {
    console.error(`[${timestamp}] [instagram-webhook] WhatsApp item-added error:`, e.message);
  }
}

function renderItemAddedTemplate(
  template: string,
  data: {
    productName: string;
    productCode: string;
    quantity: number;
    unitPrice: number;
    cartTotal: number;
    checkoutUrl: string;
    orderNumber: string;
    itemsList: string;
  },
): string {
  const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const v = (name: string) => new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}|\\{\\s*${name}\\s*\\}`, 'g');
  const lineTotal = data.unitPrice * data.quantity;

  let result = template
    .replace(v('produto'), `${data.productName} (${data.productCode})`)
    .replace(v('nome_produto'), data.productName)
    .replace(v('codigo'), data.productCode)
    .replace(v('quantidade'), String(data.quantity))
    .replace(v('qtd_aleatoria'), String(data.quantity))
    .replace(v('qtd'), String(data.quantity))
    .replace(v('valor_unitario'), money(data.unitPrice))
    .replace(v('valor'), money(data.unitPrice))
    .replace(v('preco'), money(data.unitPrice))
    .replace(v('subtotal'), money(lineTotal))
    .replace(v('total'), money(data.cartTotal))
    .replace(v('total_pedido'), money(data.cartTotal))
    .replace(v('numero_pedido'), data.orderNumber)
    .replace(v('itens_pedido'), data.itemsList)
    .replace(v('link_checkout'), data.checkoutUrl)
    .replace(v('checkout_url'), data.checkoutUrl)
    .replace(v('link_cadastro'), data.checkoutUrl);

  // Remove variáveis não suportadas remanescentes (formato {{dupla}} ou {simples})
  result = result.replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}|\{\s*[a-zA-Z0-9_]+\s*\}/g, '').trim();

  return result;
}
