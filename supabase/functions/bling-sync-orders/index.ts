import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLING_API_URL = 'https://www.bling.com.br/Api/v3';

// Helper to delay between requests (Bling limit: 3 req/second)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isDuplicateNumeroError(payloadText: string): boolean {
  // Bling validation error: code 36 -> duplicate "numero" for sales order
  return (
    payloadText.includes('"code":36') &&
    payloadText.includes('"element":"numero"') &&
    payloadText.includes('VENDAS')
  );
}

async function findExistingBlingSaleOrderIdByNumero(accessToken: string, numero: number | string): Promise<number | null> {
  const res = await fetch(`${BLING_API_URL}/pedidos/vendas?pagina=1&limite=1&numero=${encodeURIComponent(String(numero))}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });

  const text = await res.text();
  if (!res.ok) {
    console.log('[bling-sync-orders] Could not search existing order in Bling:', res.status, text);
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    const first = parsed?.data?.[0] || parsed?.data?.pedidos?.[0] || parsed?.[0];
    const id = first?.id;
    if (typeof id === 'number') return id;
    if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);
    return null;
  } catch {
    return null;
  }
}

// Buscar produto existente no Bling pelo código
async function findBlingProductByCode(accessToken: string, codigo: string): Promise<number | null> {
  try {
    const res = await fetch(`${BLING_API_URL}/produtos?pagina=1&limite=1&codigo=${encodeURIComponent(codigo)}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    const text = await res.text();
    if (!res.ok) {
      console.log(`[bling-sync-orders] Could not search product by code "${codigo}":`, res.status, text);
      return null;
    }

    const parsed = JSON.parse(text);
    const first = parsed?.data?.[0] || parsed?.data?.produtos?.[0] || parsed?.[0];
    const id = first?.id;
    if (typeof id === 'number') return id;
    if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);
    return null;
  } catch (e) {
    console.log(`[bling-sync-orders] Error searching product by code "${codigo}":`, e);
    return null;
  }
}

async function refreshBlingToken(supabase: any, integration: any): Promise<string | null> {
  if (!integration.refresh_token || !integration.client_id || !integration.client_secret) {
    console.error('[bling-sync-orders] Missing credentials for token refresh');
    return null;
  }

  try {
    const credentials = btoa(`${integration.client_id}:${integration.client_secret}`);

    const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[bling-sync-orders] Token refresh failed:', errorText);
      return null;
    }

    const tokenData = await response.json();

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    await supabase
      .from('integration_bling')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', integration.tenant_id);

    console.log('[bling-sync-orders] Token refreshed successfully');
    return tokenData.access_token;
  } catch (error) {
    console.error('[bling-sync-orders] Error refreshing token:', error);
    return null;
  }
}

async function getValidAccessToken(supabase: any, integration: any): Promise<string | null> {
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    const bufferMs = 5 * 60 * 1000;

    if (expiresAt.getTime() - now.getTime() < bufferMs) {
      console.log('[bling-sync-orders] Token expired or expiring soon, refreshing...');
      return await refreshBlingToken(supabase, integration);
    }
  }

  return integration.access_token;
}

async function getOrCreateBlingContactId(
  order: any, 
  customer: any, 
  accessToken: string,
  supabase: any,
  tenantId: string
): Promise<number> {
  const phone = (order.customer_phone || '').replace(/\D/g, '');
  
  // Priorizar dados do customer, fallback para dados do order
  const customerName = customer?.name || order.customer_name || 'Cliente';
  const customerCpf = (customer?.cpf || '').replace(/\D/g, '');
  const customerCep = (customer?.cep || order.customer_cep || '').replace(/\D/g, '');
  const customerStreet = customer?.street || order.customer_street || '';
  const customerNumber = customer?.number || order.customer_number || 'S/N';
  const customerComplement = customer?.complement || order.customer_complement || '';
  const customerNeighborhood = customer?.neighborhood || '';
  const customerCity = customer?.city || order.customer_city || '';
  const customerState = customer?.state || order.customer_state || '';
  const customerEmail = customer?.email || '';

  // 0) Se o customer já tem bling_contact_id salvo, usar diretamente
  if (customer?.bling_contact_id) {
    console.log(`[bling-sync-orders] Using cached bling_contact_id: ${customer.bling_contact_id}`);
    return customer.bling_contact_id;
  }

  // 1) Try to find an existing contact (best-effort; API may vary by account)
  let foundContactId: number | null = null;
  try {
    const searchRes = await fetch(
      `${BLING_API_URL}/contatos?pagina=1&limite=1&pesquisa=${encodeURIComponent(phone || customerName)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    const searchText = await searchRes.text();
    if (searchRes.ok) {
      const parsed = JSON.parse(searchText);
      const first = parsed?.data?.[0] || parsed?.data?.contatos?.[0] || parsed?.[0];
      const id = first?.id;
      if (typeof id === 'number') foundContactId = id;
      else if (typeof id === 'string' && /^\d+$/.test(id)) foundContactId = Number(id);
    } else {
      // If scope is missing, Bling returns 403 with insufficient_scope
      if (searchText.includes('insufficient_scope')) {
        throw new Error(
          'Token do Bling sem permissão para CONTATOS. No Bling, adicione os escopos de Contatos (leitura/escrita) ao seu aplicativo e autorize novamente.'
        );
      }
    }
  } catch (e: any) {
    // Ignore parse/search errors and try to create the contact below.
    console.log('[bling-sync-orders] Contact search failed (will try create):', String(e?.message || e));
  }

  // Se encontrou, salvar no customer e retornar
  if (foundContactId) {
    console.log(`[bling-sync-orders] Found existing Bling contact: ${foundContactId}`);
    if (customer?.id) {
      await supabase
        .from('customers')
        .update({ bling_contact_id: foundContactId })
        .eq('id', customer.id)
        .eq('tenant_id', tenantId);
      console.log(`[bling-sync-orders] Saved bling_contact_id to customer ${customer.id}`);
    }
    return foundContactId;
  }

  // 2) Create the contact with full data
  const payload: any = {
    nome: customerName,
    tipo: 'F', // Pessoa Física
    situacao: 'A', // Ativo
    telefone: phone || undefined,
    celular: phone || undefined,
    email: customerEmail || undefined,
    endereco: {
      endereco: customerStreet,
      numero: customerNumber,
      complemento: customerComplement,
      bairro: customerNeighborhood,
      cep: customerCep,
      municipio: customerCity,
      uf: customerState,
    },
  };

  // Adicionar CPF/CNPJ se disponível
  if (customerCpf) {
    payload.numeroDocumento = customerCpf;
  }

  console.log('[bling-sync-orders] Creating contact with payload:', JSON.stringify(payload, null, 2));

  const createRes = await fetch(`${BLING_API_URL}/contatos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const createText = await createRes.text();
  console.log('[bling-sync-orders] Bling create contact status:', createRes.status);
  console.log('[bling-sync-orders] Bling create contact response:', createText);

  if (!createRes.ok) {
    if (createText.includes('insufficient_scope')) {
      throw new Error(
        'Token do Bling sem permissão para criar CONTATOS. No Bling, adicione os escopos de Contatos (leitura/escrita) ao seu aplicativo e autorize novamente.'
      );
    }
    throw new Error(`Bling API error creating contact: ${createRes.status} - ${createText}`);
  }

  const created = JSON.parse(createText);
  const id = created?.data?.id ?? created?.id;
  let numericId: number | null = null;
  if (typeof id === 'number') numericId = id;
  else if (typeof id === 'string' && /^\d+$/.test(id)) numericId = Number(id);

  if (!numericId) {
    throw new Error('Contato criado no Bling, mas não foi possível obter o ID do contato na resposta.');
  }

  // Salvar o bling_contact_id no customer para uso futuro
  if (customer?.id) {
    await supabase
      .from('customers')
      .update({ bling_contact_id: numericId })
      .eq('id', customer.id)
      .eq('tenant_id', tenantId);
    console.log(`[bling-sync-orders] Created and saved bling_contact_id ${numericId} to customer ${customer.id}`);
  }

  return numericId;
}

type SendOrderResult =
  | { kind: 'created'; blingOrderId: number; raw: any }
  | { kind: 'already_exists'; blingOrderId: number; raw: any };

async function sendOrderToBling(
  order: any, 
  cartItems: any[], 
  customer: any, 
  accessToken: string, 
  supabase: any,
  tenantId: string,
  storeId?: number,
  fiscalData?: {
    store_state: string | null;
    default_ncm: string | null;
    default_cfop_same_state: string | null;
    default_cfop_other_state: string | null;
    default_ipi: number | null;
    default_icms_situacao: string | null;
    default_icms_origem: string | null;
    default_pis_cofins: string | null;
  }
): Promise<SendOrderResult> {
  if (!cartItems || cartItems.length === 0) {
    throw new Error('O pedido não possui itens para enviar ao Bling');
  }

  const contactId = await getOrCreateBlingContactId(order, customer, accessToken, supabase, tenantId);

  // Priorizar dados do customer, fallback para dados do order
  const customerCep = (customer?.cep || order.customer_cep || '').replace(/\D/g, '');
  const customerStreet = customer?.street || order.customer_street || '';
  const customerNumber = customer?.number || order.customer_number || 'S/N';
  const customerComplement = customer?.complement || order.customer_complement || '';
  const customerNeighborhood = customer?.neighborhood || '';
  const customerCity = customer?.city || order.customer_city || '';
  const customerState = customer?.state || order.customer_state || '';
  const customerName = customer?.name || order.customer_name || 'Cliente';

  // Determinar CFOP com base no estado do cliente vs estado da loja
  let cfop: string | null = null;
  if (fiscalData?.store_state && customerState) {
    const isSameState = customerState.toUpperCase() === fiscalData.store_state.toUpperCase();
    cfop = isSameState ? fiscalData.default_cfop_same_state : fiscalData.default_cfop_other_state;
    console.log(`[bling-sync-orders] CFOP: cliente=${customerState}, loja=${fiscalData.store_state}, mesmo estado=${isSameState}, cfop=${cfop}`);
  }

  // Processar itens - buscar bling_product_id quando necessário
  // Cache local para evitar enviar códigos duplicados no mesmo pedido
  const productCodesSeen = new Map<string, { hasBlindId: boolean; blingProductId?: number }>();
  const processedItems: any[] = [];
  
  for (const item of cartItems) {
    const itemData: any = {
      quantidade: item.qty || 1,
      valor: Number(item.unit_price) || 0,
      unidade: 'UN',
    };

    let blingProductId = item.bling_product_id;
    const productCode = item.product_code || `PROD-${item.id}`;

    // Verificar se já processamos este código neste pedido
    const seenProduct = productCodesSeen.get(productCode);

    // Se não tem bling_product_id, tentar buscar no Bling pelo código
    if (!blingProductId && item.product_id) {
      // Se já vimos este código e encontramos um ID, usar o mesmo
      if (seenProduct?.blingProductId) {
        blingProductId = seenProduct.blingProductId;
        console.log(`[bling-sync-orders] Item "${item.product_name}" usando bling_product_id cacheado: ${blingProductId}`);
      } else if (!seenProduct) {
        // Primeira vez vendo este código - buscar no Bling
        console.log(`[bling-sync-orders] Item "${item.product_name}" sem bling_product_id, buscando no Bling pelo código: ${productCode}`);
        const foundId = await findBlingProductByCode(accessToken, productCode);
        if (foundId) {
          blingProductId = foundId;
          // Salvar no banco para uso futuro
          await supabase
            .from('products')
            .update({ bling_product_id: foundId })
            .eq('id', item.product_id)
            .eq('tenant_id', tenantId);
          console.log(`[bling-sync-orders] Encontrado e salvo bling_product_id ${foundId} para produto ${item.product_id}`);
          productCodesSeen.set(productCode, { hasBlindId: true, blingProductId: foundId });
        } else {
          // Marcar que já vimos mas não encontramos - NÃO enviar duplicado
          productCodesSeen.set(productCode, { hasBlindId: false });
        }
      }
    }

    // Se o produto tem bling_product_id (original ou encontrado), referenciar por ID
    if (blingProductId) {
      itemData.produto = { id: blingProductId };
      console.log(`[bling-sync-orders] Item "${item.product_name}" usando bling_product_id: ${blingProductId}`);
    } else {
      // Fallback: enviar código e descrição apenas se for a PRIMEIRA vez vendo este código
      // Para itens duplicados sem ID, usar referência ao primeiro item
      if (!seenProduct) {
        itemData.codigo = productCode;
        itemData.descricao = item.product_name || 'Produto';
        console.log(`[bling-sync-orders] Item "${item.product_name}" não encontrado no Bling, criando com código: ${productCode}`);
      } else {
        // Item duplicado que não tem ID no Bling - não podemos enviar código duplicado
        // Usar uma referência genérica com sufixo único para evitar conflito
        const uniqueSuffix = `-${processedItems.length + 1}`;
        itemData.codigo = `${productCode}${uniqueSuffix}`;
        itemData.descricao = item.product_name || 'Produto';
        console.log(`[bling-sync-orders] Item duplicado "${item.product_name}" - usando código único: ${itemData.codigo}`);
      }
    }

    // Adicionar dados fiscais ao item se configurados
    if (fiscalData?.default_ncm) {
      itemData.ncm = fiscalData.default_ncm;
    }
    if (cfop) {
      itemData.cfop = cfop;
    }
    if (fiscalData?.default_icms_origem) {
      itemData.origem = fiscalData.default_icms_origem;
    }

    // Adicionar tributos diretamente no item (necessário para nota fiscal)
    if (fiscalData && (fiscalData.default_icms_situacao || fiscalData.default_pis_cofins)) {
      itemData.tributos = {};
      
      if (fiscalData.default_icms_situacao) {
        itemData.tributos.icms = {
          situacao: fiscalData.default_icms_situacao,
          origem: fiscalData.default_icms_origem || '0',
        };
      }
      
      if (fiscalData.default_pis_cofins) {
        itemData.tributos.pis = { situacao: fiscalData.default_pis_cofins };
        itemData.tributos.cofins = { situacao: fiscalData.default_pis_cofins };
      }
    }

    processedItems.push(itemData);
  }

  // Bling v3: situacao do pedido (0=Em aberto, 6=Em andamento, 9=Atendido, 12=Cancelado)
  // numeroLoja é o número visível para busca no painel
  // loja vincula o pedido a um canal de venda específico
  const blingOrder: any = {
    numero: order.id,
    numeroLoja: String(order.id),
    data: new Date(order.created_at).toISOString().split('T')[0],
    dataPrevista: order.event_date,
    situacao: { id: 6 }, // 6 = Em andamento (aparece na listagem padrão)
    contato: { id: contactId },
    itens: processedItems,
    observacoes: order.observation || '',
    observacoesInternas: `Pedido ID: ${order.id} | Evento: ${order.event_type}`,
  };

  // Adicionar tributos do pedido se configurados
  if (fiscalData && (fiscalData.default_icms_situacao || fiscalData.default_pis_cofins || fiscalData.default_ipi !== null)) {
    blingOrder.tributos = {};
    
    if (fiscalData.default_icms_situacao) {
      blingOrder.tributos.icms = {
        situacao: fiscalData.default_icms_situacao,
        origem: fiscalData.default_icms_origem || '0',
      };
    }
    
    if (fiscalData.default_pis_cofins) {
      blingOrder.tributos.pis = { situacao: fiscalData.default_pis_cofins };
      blingOrder.tributos.cofins = { situacao: fiscalData.default_pis_cofins };
    }
    
    if (fiscalData.default_ipi !== null && fiscalData.default_ipi !== undefined) {
      blingOrder.tributos.ipi = { aliquota: fiscalData.default_ipi };
    }

    console.log('[bling-sync-orders] Tributos adicionados:', JSON.stringify(blingOrder.tributos, null, 2));
  }

  // Extrair valor do frete da observação (formato: "Frete: R$ XX,XX" ou "frete de R$ XX,XX")
  let freteValor = 0;
  let freteNome = '';
  const observacao = order.observation || '';
  
  // Função para converter valor monetário brasileiro para número
  // Suporta formatos: "30,41" | "30.41" | "1.234,56" | "1234.56"
  const parseMonetaryValue = (value: string): number => {
    if (!value) return 0;
    const cleaned = value.trim();
    
    // Se tem vírgula como decimal (formato BR: "30,41" ou "1.234,56")
    if (cleaned.includes(',')) {
      // Remove pontos de milhar e troca vírgula por ponto
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
    
    // Formato com ponto como decimal ("30.41")
    // Verificar se é milhar ou decimal baseado na posição
    const dotCount = (cleaned.match(/\./g) || []).length;
    if (dotCount === 1) {
      const parts = cleaned.split('.');
      // Se tem 2 casas decimais após o ponto, é decimal
      if (parts[1] && parts[1].length <= 2) {
        return parseFloat(cleaned) || 0;
      }
      // Senão, pode ser milhar (ex: "1.234" = 1234)
      return parseFloat(cleaned.replace('.', '')) || 0;
    }
    
    // Múltiplos pontos = formato milhar (ex: "1.234.567")
    return parseFloat(cleaned.replace(/\./g, '')) || 0;
  };
  
  // Tentar extrair nome do frete (ex: "PAC", "SEDEX", etc.)
  const freteNomeMatch = observacao.match(/(?:frete|envio|transporte)[:\s]*([A-Za-zÀ-ú\s]+?)(?:\s*[-–]\s*|\s+R\$|\s*:)/i);
  if (freteNomeMatch) {
    freteNome = freteNomeMatch[1].trim();
  }
  
  // Tentar extrair valor do frete
  const freteMatch = observacao.match(/(?:frete|envio|transporte)[^R$]*R\$\s*([\d.,]+)/i);
  if (freteMatch) {
    freteValor = parseMonetaryValue(freteMatch[1]);
  }
  
  // Fallback: buscar qualquer padrão "R$ XX,XX" relacionado a frete
  if (freteValor === 0) {
    const valorMatch = observacao.match(/R\$\s*([\d.,]+)/);
    if (valorMatch && observacao.toLowerCase().includes('frete')) {
      freteValor = parseMonetaryValue(valorMatch[1]);
    }
  }
  
  console.log('[bling-sync-orders] Frete extraído:', { freteNome, freteValor, observacao });

  // Adicionar dados de transporte/entrega se tiver endereço
  if (customerCep && customerStreet) {
    blingOrder.transporte = {
      frete: freteValor,
      fretePorConta: 0, // 0 = Remetente, 1 = Destinatário
      contato: {
        nome: customerName,
        endereco: customerStreet,
        numero: customerNumber,
        complemento: customerComplement,
        bairro: customerNeighborhood,
        cep: customerCep,
        municipio: customerCity,
        uf: customerState,
      },
    };
    
    // Adicionar transportadora se identificada
    if (freteNome) {
      blingOrder.transporte.transportador = freteNome;
    }
    
    console.log('[bling-sync-orders] Adicionando dados de transporte ao pedido:', JSON.stringify(blingOrder.transporte, null, 2));
  } else if (freteValor > 0) {
    // Se não tem endereço mas tem frete, adicionar só o valor
    blingOrder.transporte = {
      frete: freteValor,
      fretePorConta: 0,
    };
    if (freteNome) {
      blingOrder.transporte.transportador = freteNome;
    }
    console.log('[bling-sync-orders] Adicionando apenas valor de frete:', freteValor);
  }

  // Vincular à loja OrderZap se configurado
  if (storeId) {
    blingOrder.loja = { id: storeId };
    console.log(`[bling-sync-orders] Vinculando pedido à loja ID: ${storeId}`);
  }

  console.log('[bling-sync-orders] Sending order to Bling:', JSON.stringify(blingOrder, null, 2));

  const response = await fetch(`${BLING_API_URL}/pedidos/vendas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(blingOrder),
  });

  const responseText = await response.text();
  console.log('[bling-sync-orders] Bling API response status:', response.status);
  console.log('[bling-sync-orders] Bling API response:', responseText);

  if (!response.ok) {
    if (responseText.includes('insufficient_scope')) {
      throw new Error(
        'Token do Bling sem permissão para VENDAS/PEDIDOS. No Bling, adicione os escopos de Vendas/Pedidos (leitura/escrita) ao seu aplicativo e autorize novamente.'
      );
    }

    // Se já existir no Bling, buscamos o ID e marcamos como sincronizado no nosso lado.
    if (response.status === 400 && isDuplicateNumeroError(responseText)) {
      const existingId = await findExistingBlingSaleOrderIdByNumero(accessToken, order.id);
      if (existingId) {
        return { kind: 'already_exists', blingOrderId: existingId, raw: { error: responseText } };
      }
    }

    throw new Error(`Bling API error: ${response.status} - ${responseText}`);
  }

  const parsed = JSON.parse(responseText);
  const createdId = parsed?.data?.id ?? parsed?.id;
  const numericId = typeof createdId === 'number' ? createdId : (typeof createdId === 'string' && /^\d+$/.test(createdId) ? Number(createdId) : null);

  if (!numericId) {
    throw new Error('Pedido criado no Bling, mas não foi possível obter o ID na resposta.');
  }

  return { kind: 'created', blingOrderId: numericId, raw: parsed };
}

async function fetchOrdersFromBling(accessToken: string, page = 1, limit = 100): Promise<any> {
  const response = await fetch(
    `${BLING_API_URL}/pedidos/vendas?pagina=${page}&limite=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bling API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, tenant_id, order_id } = await req.json();

    console.log(`[bling-sync-orders] Action: ${action}, Tenant: ${tenant_id}, Order: ${order_id}`);

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: integration, error: integrationError } = await supabase
      .from('integration_bling')
      .select('*')
      .eq('tenant_id', tenant_id)
      .single();

    if (integrationError || !integration) {
      console.error('[bling-sync-orders] Integration not found:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Bling integration not configured' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.is_active) {
      return new Response(
        JSON.stringify({ error: 'Bling integration is not active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.sync_orders) {
      return new Response(
        JSON.stringify({ error: 'Order sync is not enabled for this tenant' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await getValidAccessToken(supabase, integration);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'Failed to get valid access token. Please reconnect Bling.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result;

    switch (action) {
      case 'send_order': {
        if (!order_id) {
          return new Response(
            JSON.stringify({ error: 'order_id is required for send_order action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('*')
          .eq('id', order_id)
          .eq('tenant_id', tenant_id)
          .single();

        if (orderError || !order) {
          console.error('[bling-sync-orders] Order not found:', orderError);
          return new Response(
            JSON.stringify({ error: 'Order not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Se já temos o ID do Bling salvo, consideramos sincronizado.
        if (order.bling_order_id) {
          result = {
            skipped: true,
            reason: 'order_already_synced',
            order_id: order.id,
            bling_order_id: order.bling_order_id,
          };
          break;
        }

        let cartItems: any[] = [];
        if (order.cart_id) {
          // Buscar cart_items com JOIN em products para pegar código atualizado e bling_product_id
          const { data: items, error: itemsError } = await supabase
            .from('cart_items')
            .select('*, products:product_id(code, name, bling_product_id)')
            .eq('cart_id', order.cart_id);

          if (!itemsError && items) {
            // Mapear para usar código/nome atualizado do produto e bling_product_id quando disponível
            cartItems = items.map((item: any) => ({
              ...item,
              product_code: item.products?.code || item.product_code,
              product_name: item.products?.name || item.product_name,
              bling_product_id: item.products?.bling_product_id || null,
            }));
          }
        }

        // Buscar dados do cliente pelo telefone
        const normalizedPhone = (order.customer_phone || '').replace(/\D/g, '');
        let customer = null;
        if (normalizedPhone) {
          const { data: customerData } = await supabase
            .from('customers')
            .select('*')
            .eq('tenant_id', tenant_id)
            .or(`phone.eq.${normalizedPhone},phone.like.%${normalizedPhone.slice(-9)}%`)
            .limit(1)
            .single();
          customer = customerData;
        }

        console.log('[bling-sync-orders] Customer found:', customer ? customer.name : 'NOT FOUND');

        // Usar loja configurada no banco (se houver)
        const blingStoreId = integration.bling_store_id || null;
        
        // Extrair dados fiscais da integração
        const fiscalData = {
          store_state: integration.store_state || null,
          default_ncm: integration.default_ncm || null,
          default_cfop_same_state: integration.default_cfop_same_state || null,
          default_cfop_other_state: integration.default_cfop_other_state || null,
          default_ipi: integration.default_ipi || null,
          default_icms_situacao: integration.default_icms_situacao || null,
          default_icms_origem: integration.default_icms_origem || null,
          default_pis_cofins: integration.default_pis_cofins || null,
        };
        
        const blingResult = await sendOrderToBling(order, cartItems, customer, accessToken, supabase, tenant_id, blingStoreId, fiscalData);

        // Persistir o ID do pedido no Bling (inclui caso "já existe")
        await supabase
          .from('orders')
          .update({ bling_order_id: blingResult.blingOrderId })
          .eq('id', order.id)
          .eq('tenant_id', tenant_id);

        await supabase
          .from('integration_bling')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('tenant_id', tenant_id);

        result = {
          order_id: order.id,
          bling_order_id: blingResult.blingOrderId,
          status: blingResult.kind,
        };

        break;
      }

      case 'fetch_orders': {
        result = await fetchOrdersFromBling(accessToken);
        break;
      }

      case 'sync_all': {
        // Buscar pedidos pagos que ainda não foram sincronizados
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select('*')
          .eq('tenant_id', tenant_id)
          .eq('is_paid', true)
          .is('bling_order_id', null)
          .order('created_at', { ascending: false })
          .limit(50);

        if (ordersError) {
          throw new Error(`Failed to fetch orders: ${ordersError.message}`);
        }

        const results: any[] = [];
        for (let i = 0; i < (orders || []).length; i++) {
          const order = orders![i];

          // Add delay between requests to respect Bling rate limit (3 req/sec)
          if (i > 0) {
            await delay(400); // 400ms delay = ~2.5 req/sec (safe margin)
          }

          try {
            let cartItems: any[] = [];
            if (order.cart_id) {
              // Buscar cart_items com JOIN em products para pegar código atualizado e bling_product_id
              const { data: items } = await supabase
                .from('cart_items')
                .select('*, products:product_id(code, name, bling_product_id)')
                .eq('cart_id', order.cart_id);
              
              // Mapear para usar código/nome atualizado do produto e bling_product_id quando disponível
              cartItems = (items || []).map((item: any) => ({
                ...item,
                product_code: item.products?.code || item.product_code,
                product_name: item.products?.name || item.product_name,
                bling_product_id: item.products?.bling_product_id || null,
              }));
            }

            // Skip orders without items
            if (cartItems.length === 0) {
              console.log(`[bling-sync-orders] Skipping order ${order.id}: no items`);
              results.push({ order_id: order.id, success: false, error: 'Pedido sem itens' });
              continue;
            }

            // Buscar dados do cliente pelo telefone
            const normalizedPhone = (order.customer_phone || '').replace(/\D/g, '');
            let customer = null;
            if (normalizedPhone) {
              const { data: customerData } = await supabase
                .from('customers')
                .select('*')
                .eq('tenant_id', tenant_id)
                .or(`phone.eq.${normalizedPhone},phone.like.%${normalizedPhone.slice(-9)}%`)
                .limit(1)
                .single();
              customer = customerData;
            }

            console.log(`[bling-sync-orders] Order ${order.id} - Customer found:`, customer ? customer.name : 'NOT FOUND');

            // Usar loja configurada no banco (se houver)
            const blingStoreId = integration.bling_store_id || null;
            
            // Extrair dados fiscais da integração
            const fiscalData = {
              store_state: integration.store_state || null,
              default_ncm: integration.default_ncm || null,
              default_cfop_same_state: integration.default_cfop_same_state || null,
              default_cfop_other_state: integration.default_cfop_other_state || null,
              default_ipi: integration.default_ipi || null,
              default_icms_situacao: integration.default_icms_situacao || null,
              default_icms_origem: integration.default_icms_origem || null,
              default_pis_cofins: integration.default_pis_cofins || null,
            };
            
            const blingResult = await sendOrderToBling(order, cartItems, customer, accessToken, supabase, tenant_id, blingStoreId, fiscalData);

            await supabase
              .from('orders')
              .update({ bling_order_id: blingResult.blingOrderId })
              .eq('id', order.id)
              .eq('tenant_id', tenant_id);

            results.push({
              order_id: order.id,
              success: true,
              bling_order_id: blingResult.blingOrderId,
              status: blingResult.kind,
            });
          } catch (error) {
            console.error(`[bling-sync-orders] Error syncing order ${order.id}:`, error);
            results.push({ order_id: order.id, success: false, error: error.message });
          }
        }

        await supabase
          .from('integration_bling')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('tenant_id', tenant_id);

        result = {
          synced: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          skipped: results.filter(r => r.error === 'Pedido sem itens').length,
          details: results,
        };
        break;
      }

      case 'test_payload': {
        // Ação de teste: gera o payload que seria enviado ao Bling sem criar o pedido
        // Útil para verificar se os dados do cliente estão sendo carregados corretamente
        const { customer_phone } = await req.json().catch(() => ({}));
        
        // Buscar um cliente com dados completos
        const { data: testCustomer, error: customerError } = await supabase
          .from('customers')
          .select('*')
          .eq('tenant_id', tenant_id)
          .not('cpf', 'is', null)
          .not('cep', 'is', null)
          .not('neighborhood', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (customerError || !testCustomer) {
          return new Response(
            JSON.stringify({ 
              error: 'Nenhum cliente com dados completos encontrado',
              hint: 'Cadastre um cliente com CPF, CEP, bairro, rua, número, cidade e estado'
            }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Simular um pedido de teste
        const testOrder = {
          id: 99999,
          customer_phone: testCustomer.phone,
          customer_name: testCustomer.name,
          customer_cep: testCustomer.cep,
          customer_street: testCustomer.street,
          customer_number: testCustomer.number,
          customer_complement: testCustomer.complement,
          customer_city: testCustomer.city,
          customer_state: testCustomer.state,
          created_at: new Date().toISOString(),
          event_date: new Date().toISOString().split('T')[0],
          event_type: 'TESTE',
          observation: 'Pedido de teste para validação da integração Bling',
        };

        const testCartItems = [
          {
            id: 1,
            product_code: 'TESTE-001',
            product_name: 'Produto de Teste',
            qty: 1,
            unit_price: 99.90,
          }
        ];

        // Montar o payload exatamente como seria enviado
        const customerCpf = (testCustomer.cpf || '').replace(/\D/g, '');
        const customerCep = (testCustomer.cep || '').replace(/\D/g, '');

        const contactPayload = {
          nome: testCustomer.name,
          tipo: 'F',
          situacao: 'A',
          telefone: testCustomer.phone?.replace(/\D/g, ''),
          celular: testCustomer.phone?.replace(/\D/g, ''),
          email: testCustomer.email || undefined,
          numeroDocumento: customerCpf || undefined,
          endereco: {
            endereco: testCustomer.street || '',
            numero: testCustomer.number || 'S/N',
            complemento: testCustomer.complement || '',
            bairro: testCustomer.neighborhood || '',
            cep: customerCep,
            municipio: testCustomer.city || '',
            uf: testCustomer.state || '',
          },
        };

        const orderPayload: any = {
          numero: testOrder.id,
          numeroLoja: String(testOrder.id),
          data: new Date().toISOString().split('T')[0],
          dataPrevista: testOrder.event_date,
          situacao: { id: 6 },
          contato: { id: '<<SERIA_CRIADO_OU_BUSCADO>>' },
          itens: testCartItems.map((item) => ({
            codigo: item.product_code,
            descricao: item.product_name,
            quantidade: item.qty,
            valor: item.unit_price,
            unidade: 'UN',
          })),
          observacoes: testOrder.observation,
          observacoesInternas: `Pedido ID: ${testOrder.id} | Evento: ${testOrder.event_type}`,
        };

        // Adicionar transporte
        if (customerCep && testCustomer.street) {
          orderPayload.transporte = {
            contato: {
              nome: testCustomer.name,
              endereco: testCustomer.street,
              numero: testCustomer.number || 'S/N',
              complemento: testCustomer.complement || '',
              bairro: testCustomer.neighborhood || '',
              cep: customerCep,
              municipio: testCustomer.city || '',
              uf: testCustomer.state || '',
            },
          };
        }

        // Adicionar loja se configurada
        const blingStoreId = integration.bling_store_id;
        if (blingStoreId) {
          orderPayload.loja = { id: blingStoreId };
        }

        result = {
          message: 'Payload de teste gerado com sucesso (NÃO foi enviado ao Bling)',
          customer: {
            id: testCustomer.id,
            name: testCustomer.name,
            phone: testCustomer.phone,
            cpf: testCustomer.cpf,
            email: testCustomer.email,
            address: {
              cep: testCustomer.cep,
              street: testCustomer.street,
              number: testCustomer.number,
              complement: testCustomer.complement,
              neighborhood: testCustomer.neighborhood,
              city: testCustomer.city,
              state: testCustomer.state,
            }
          },
          bling_payloads: {
            contato: contactPayload,
            pedido: orderPayload,
          },
          validation: {
            has_cpf: !!customerCpf,
            has_cep: !!customerCep,
            has_neighborhood: !!testCustomer.neighborhood,
            has_street: !!testCustomer.street,
            has_city: !!testCustomer.city,
            has_state: !!testCustomer.state,
            has_transport_data: !!(customerCep && testCustomer.street),
            has_store_linked: !!blingStoreId,
          }
        };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    console.log('[bling-sync-orders] Success:', JSON.stringify(result));

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[bling-sync-orders] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
