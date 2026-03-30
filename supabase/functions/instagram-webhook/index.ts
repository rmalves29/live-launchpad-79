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
    const body: InstagramWebhookPayload = await req.json();
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
        const buyerId = value.from.id;
        const buyerUsername = value.from.username || '';
        const commentId = value.id;
        const commentText = value.text;
        const mediaId = value.media?.id;
        const extractedCode = extractProductCode(commentText);
        const earlyProductCode = extractedCode?.normalized ?? null;
        const requestedQty = extractedCode?.qty ?? 1;
        const isLiveComment = change.field === 'live_comments' || value.media?.media_product_type === 'LIVE';

        console.log(`[${timestamp}] [instagram-webhook] Comment from @${buyerUsername} (${buyerId}) [${change.field}]: "${commentText}"`);

        // Insert comment initially with no_code status
        const initialStatus = extractedCode ? 'not_found' : 'no_code';

        await insertLiveComment(supabase, {
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

        if (!extractedCode) {
          console.log(`[${timestamp}] [instagram-webhook] No product code found in comment`);
          continue;
        }

        const productCode = extractedCode.normalized;
        console.log(`[${timestamp}] [instagram-webhook] Extracted product code: ${productCode}`);

        let product = null;

        // Para comentários de live, filtrar apenas produtos com sale_type LIVE ou AMBOS
        const saleTypeFilter = isLiveComment ? ['LIVE', 'AMBOS'] : undefined;

        let exactQuery = supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .ilike('code', productCode);

        if (saleTypeFilter) {
          exactQuery = exactQuery.in('sale_type', saleTypeFilter);
        }

        const { data: exactProduct, error: exactError } = await exactQuery.maybeSingle();

        if (!exactError && exactProduct) {
          product = exactProduct;
        } else {
          let fuzzyQuery = supabase
            .from('products')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .ilike('code', `%${productCode}%`)
            .order('id', { ascending: false })
            .limit(1);

          if (saleTypeFilter) {
            fuzzyQuery = fuzzyQuery.in('sale_type', saleTypeFilter);
          }

          const { data: fuzzyProduct } = await fuzzyQuery.maybeSingle();
          product = fuzzyProduct;
        }

        if (!product) {
          // Check if product exists but is not for LIVE (sale_type mismatch)
          if (isLiveComment) {
            const { data: anyProduct } = await supabase
              .from('products')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('is_active', true)
              .ilike('code', productCode)
              .maybeSingle();

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
          // Não envia DM de estoque esgotado
          continue;
        }

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

        const { data: freshProduct } = await supabase
          .from('products')
          .select('stock')
          .eq('id', product.id)
          .single();

        if (!freshProduct || freshProduct.stock < 1) {
          console.log(`[${timestamp}] [instagram-webhook] ❌ Product ${product.code} out of stock (stock=${freshProduct?.stock || 0})`);
          await updateLiveCommentStatus(supabase, tenantId, commentId, 'out_of_stock', timestamp);
          continue;
        }

        const { data: existingItem } = await supabase
          .from('cart_items')
          .select('*')
          .eq('cart_id', cart.id)
          .eq('product_id', product.id)
          .maybeSingle();

        let itemQty = requestedQty;
        if (existingItem) {
          // Already has this specific product → also repeat
          isRepeatBuyer = true;
          itemQty = existingItem.qty + requestedQty;
          if (itemQty > freshProduct.stock) {
            console.log(`[${timestamp}] [instagram-webhook] ❌ Product ${product.code} insufficient stock for qty=${itemQty} (stock=${freshProduct.stock})`);
            await updateLiveCommentStatus(supabase, tenantId, commentId, 'out_of_stock', timestamp);
            continue;
          }

          await supabase
            .from('cart_items')
            .update({ qty: itemQty })
            .eq('id', existingItem.id);

          console.log(`[${timestamp}] [instagram-webhook] Item quantity updated: ${product.code} qty=${itemQty}`);
        } else {
          if (requestedQty > freshProduct.stock) {
            console.log(`[${timestamp}] [instagram-webhook] ❌ Product ${product.code} insufficient stock for qty=${requestedQty} (stock=${freshProduct.stock})`);
            await updateLiveCommentStatus(supabase, tenantId, commentId, 'out_of_stock', timestamp);
            continue;
          }

          await supabase
            .from('cart_items')
            .insert({
              tenant_id: tenantId,
              cart_id: cart.id,
              product_id: product.id,
              product_code: product.code,
              product_name: product.name,
              product_image_url: product.image_url,
              unit_price: product.price,
              qty: requestedQty,
            });

          console.log(`[${timestamp}] [instagram-webhook] New item added: ${product.code} qty=${requestedQty}`);
        }

        const { error: stockDecErr } = await supabase
          .from('products')
          .update({ stock: freshProduct.stock - itemQty + (existingItem ? existingItem.qty : 0) })
          .eq('id', product.id)
          .gt('stock', 0);

        if (stockDecErr) {
          console.log(`[${timestamp}] [instagram-webhook] ❌ Stock decrement failed for ${product.code}:`, stockDecErr);
          if (existingItem) {
            await supabase.from('cart_items').update({ qty: existingItem.qty }).eq('id', existingItem.id);
          } else {
            await supabase.from('cart_items').delete().eq('cart_id', cart.id).eq('product_id', product.id);
          }
          continue;
        }

        // Mark comment as product found with appropriate status
        const commentStatus = isRepeatBuyer ? 'repeat_added' : 'added';
        await updateLiveCommentStatus(supabase, tenantId, commentId, commentStatus, timestamp, true);

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

        const hasRegistration = !!customerData;
        const hasPhone = !!customerData?.phone;

        if (pageAccessToken) {
          const checkoutUrl = `https://app.orderzaps.com/t/${tenantSlug}/checkout`;
          const cadastroUrl = `https://app.orderzaps.com/t/${tenantSlug}/cadastro-instagram`;
          const priceFormatted = `R$ ${product.price.toFixed(2).replace('.', ',')}`;
          const totalFormatted = `R$ ${total.toFixed(2).replace('.', ',')}`;

          const qtyLabel = requestedQty > 1 ? ` (${requestedQty}x)` : '';

          if ((!hasRegistration || !hasPhone) && integration.send_cadastro_dm) {
            // Sem cadastro OU sem telefone + flag ativo → DM de cadastro
            // Buscar template do banco
            let cadastroDmMessage = '';
            const { data: dmTemplate } = await supabase
              .from('whatsapp_templates')
              .select('content')
              .eq('tenant_id', tenantId)
              .eq('type', 'DM_INSTAGRAM_CADASTRO')
              .maybeSingle();

            if (dmTemplate?.content) {
              cadastroDmMessage = dmTemplate.content
                .replace(/\{\{produto\}\}/g, product.name)
                .replace(/\{\{quantidade\}\}/g, String(requestedQty))
                .replace(/\{\{valor_unitario\}\}/g, priceFormatted)
                .replace(/\{\{total\}\}/g, totalFormatted)
                .replace(/\{\{link_cadastro\}\}/g, cadastroUrl);
            } else {
              // Fallback hardcoded
              cadastroDmMessage =
                `✅ *${product.name}*${qtyLabel} foi adicionado ao seu pedido!\n\n` +
                `💰 Valor: ${priceFormatted}\n` +
                `🛒 Total: ${totalFormatted}\n\n` +
                `📋 Para confirmar seu produto, faça seu cadastro:\n${cadastroUrl}\n\n` +
                `Após o cadastro, você receberá o link para finalizar o pedido. ✨`;
            }

            console.log(`[${timestamp}] [instagram-webhook] Sending DM Cadastro to ${buyerId}, template found: ${!!dmTemplate?.content}`);
            const dmResult = await sendInstagramDM(buyerId, pageAccessToken, cadastroDmMessage);
            if (dmResult.success) {
              console.log(`[${timestamp}] [instagram-webhook] DM Cadastro sent to ${buyerId}`);
            } else {
              console.error(`[${timestamp}] [instagram-webhook] DM Cadastro failed:`, dmResult.error);
            }
          } else if (!hasPhone) {
            // Flag desativado mas sem telefone → DM checkout padrão
            const dmMessage =
              `✅ *${product.name}*${qtyLabel} adicionado!\n\n` +
              `💰 Valor unitário: ${priceFormatted}\n` +
              `🛒 Total do carrinho: ${totalFormatted}\n\n` +
              `Para finalizar seu pedido, acesse:\n${checkoutUrl}`;

            const dmResult = await sendInstagramDM(buyerId, pageAccessToken, dmMessage);
            if (dmResult.success) {
              console.log(`[${timestamp}] [instagram-webhook] DM sent successfully to ${buyerId}`);
            } else {
              console.error(`[${timestamp}] [instagram-webhook] DM failed:`, dmResult.error);
            }
          }
          // Se tem cadastro COM telefone → não envia DM nenhuma
        } else {
          console.log(`[${timestamp}] [instagram-webhook] No page_access_token, skipping DM`);
        }

        // WhatsApp direto se tem telefone
        if (hasPhone && order) {
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
) {
  const { error } = await supabase.from('instagram_live_comments').insert(payload);

  if (error) {
    console.error(`[${timestamp}] [instagram-webhook] Error saving live comment:`, error);
  }
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

async function findIntegrationForEntry(
  supabase: ReturnType<typeof createClient>,
  entry: InstagramWebhookEntry,
  timestamp: string,
): Promise<InstagramIntegrationRecord | null> {
  const { data: integration, error } = await supabase
    .from('integration_instagram')
    .select('*, tenants!inner(id, slug, name)')
    .or(`page_id.eq.${entry.id},instagram_account_id.eq.${entry.id}`)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error(`[${timestamp}] [instagram-webhook] Error fetching integration by source id:`, error);
    return null;
  }

  if (integration) {
    return integration as InstagramIntegrationRecord;
  }

  const ownerComment = (entry.changes || []).find((change) => {
    if (!COMMENT_FIELDS.has(change.field)) return false;
    return change.value?.from?.id === entry.id && !!change.value?.from?.username;
  });

  const ownerUsername = ownerComment?.value?.from?.username;
  if (!ownerUsername) {
    return null;
  }

  const { data: fallbackIntegration, error: fallbackError } = await supabase
    .from('integration_instagram')
    .select('*, tenants!inner(id, slug, name)')
    .eq('instagram_username', ownerUsername)
    .eq('is_active', true)
    .maybeSingle();

  if (fallbackError) {
    console.error(`[${timestamp}] [instagram-webhook] Error fetching integration by username fallback:`, fallbackError);
    return null;
  }

  if (fallbackIntegration) {
    console.log(`[${timestamp}] [instagram-webhook] Fallback match by username @${ownerUsername}`);
    return fallbackIntegration as InstagramIntegrationRecord;
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

async function sendInstagramDM(
  recipientId: string,
  accessToken: string,
  message: string,
  useInstagramApi: boolean = false
): Promise<{ success: boolean; error?: string }> {
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
      return { success: true };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;
    console.error(`[instagram-webhook] DM API error (${useInstagramApi ? 'instagram' : 'facebook'}):`, JSON.stringify(errorData));

    if (errorData?.error?.code === 190) {
      console.error('[instagram-webhook] Token expired or invalid');
      return { success: false, error: 'Token expirado ou inválido' };
    }

    return { success: false, error: errorMsg };
  } catch (error: any) {
    return { success: false, error: error.message };
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
          unit_price: product.price,
        }),
      }
    );

    const responseText = await response.text();
    console.log(`[${timestamp}] [instagram-webhook] WhatsApp item-added sent to ${customerPhone}: status=${response.status}`);
  } catch (e: any) {
    console.error(`[${timestamp}] [instagram-webhook] WhatsApp item-added error:`, e.message);
  }
}
