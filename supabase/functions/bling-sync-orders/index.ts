import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLING_API_URL = 'https://www.bling.com.br/Api/v3';

// Helper to delay between requests (Bling limit: 3 req/second)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type BlingFetchResult = {
  response: Response;
  text: string;
};

/**
 * Bling has a strict rate limit (commonly 3 req/sec) and may return 429.
 * This helper retries with exponential backoff (and honors Retry-After when present).
 */
async function blingFetchWithRetry(
  url: string,
  options: RequestInit,
  cfg: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {}
): Promise<BlingFetchResult> {
  const maxAttempts = cfg.maxAttempts ?? 5;
  const baseDelayMs = cfg.baseDelayMs ?? 700;
  const label = cfg.label ?? url;

  let lastResponse: Response | null = null;
  let lastText = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, options);
    const text = await res.text();
    lastResponse = res;
    lastText = text;

    if (res.status !== 429 && res.status !== 502 && res.status !== 503) {
      return { response: res, text };
    }

    // Retry
    if (attempt < maxAttempts) {
      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader && !Number.isNaN(Number(retryAfterHeader))
        ? Number(retryAfterHeader) * 1000
        : null;

      const backoffMs = Math.round(baseDelayMs * Math.pow(1.8, attempt - 1));
      const waitMs = retryAfterMs ?? backoffMs;
      console.log(`[bling-sync-orders] Rate/Transient error (${res.status}) on ${label}. Attempt ${attempt}/${maxAttempts}. Waiting ${waitMs}ms...`);
      await delay(waitMs);
      continue;
    }

    return { response: res, text };
  }

  // Shouldn't reach here, but keep types happy
  if (!lastResponse) {
    throw new Error('Failed to call Bling API (no response)');
  }
  return { response: lastResponse, text: lastText };
}

/**
 * Validate CPF using checksum algorithm
 */
function isValidCPF(cpf: string): boolean {
  const cleanCpf = cpf.replace(/\D/g, '');
  
  if (cleanCpf.length !== 11) return false;
  
  // Check for known invalid patterns
  if (/^(\d)\1{10}$/.test(cleanCpf)) return false;
  
  // Validate first check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCpf.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleanCpf.charAt(9))) return false;
  
  // Validate second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCpf.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleanCpf.charAt(10))) return false;
  
  return true;
}

function isDuplicateNumeroError(payloadText: string): boolean {
  // Bling validation error: code 36 -> duplicate "numero" for sales order
  return (
    payloadText.includes('"code":36') &&
    payloadText.includes('"element":"numero"') &&
    payloadText.includes('VENDAS')
  );
}

async function findExistingBlingSaleOrderIdByNumero(accessToken: string, numero: number | string, storeId?: number): Promise<number | null> {
  // Primeira busca: tentar com a loja específica se configurada
  if (storeId) {
    const { response: resWithStore, text: textWithStore } = await blingFetchWithRetry(
      `${BLING_API_URL}/pedidos/vendas?pagina=1&limite=1&numero=${encodeURIComponent(String(numero))}&idLoja=${storeId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      },
      { label: 'search-order-by-numero(store)' }
    );

    if (resWithStore.ok) {
      try {
        const parsed = JSON.parse(textWithStore);
        const first = parsed?.data?.[0] || parsed?.data?.pedidos?.[0] || parsed?.[0];
        const id = first?.id;
        if (typeof id === 'number') return id;
        if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);
      } catch {
        // Continuar para busca geral
      }
    }
    console.log('[bling-sync-orders] Order not found in store, trying general search...');
  }

  // Busca geral (sem filtro de loja)
  const { response: res, text } = await blingFetchWithRetry(
    `${BLING_API_URL}/pedidos/vendas?pagina=1&limite=1&numero=${encodeURIComponent(String(numero))}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    },
    { label: 'search-order-by-numero' }
  );
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
    const { response: res, text } = await blingFetchWithRetry(
      `${BLING_API_URL}/produtos?pagina=1&limite=1&codigo=${encodeURIComponent(codigo)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      },
      { label: 'search-product-by-code' }
    );
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

/**
 * Update an existing Bling contact's address data
 */
async function updateBlingContactAddress(
  contactId: number,
  accessToken: string,
  addressData: {
    nome: string;
    telefone: string;
    celular: string;
    email?: string;
    endereco: string;
    numero: string;
    complemento: string;
    bairro: string;
    cep: string;
    municipio: string;
    uf: string;
  }
): Promise<boolean> {
  try {
    // Bling API V3 requires "geral" wrapper for address data
    const payload = {
      nome: addressData.nome,
      telefone: addressData.telefone || undefined,
      celular: addressData.celular || undefined,
      email: addressData.email || undefined,
      endereco: {
        geral: {
          endereco: addressData.endereco,
          numero: addressData.numero,
          complemento: addressData.complemento,
          bairro: addressData.bairro,
          cep: addressData.cep,
          municipio: addressData.municipio,
          uf: addressData.uf,
        },
      },
    };

    console.log(`[bling-sync-orders] Updating contact ${contactId} address:`, JSON.stringify(payload, null, 2));

    const { response: updateRes, text: updateText } = await blingFetchWithRetry(
      `${BLING_API_URL}/contatos/${contactId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      { label: 'update-contact-address' }
    );

    if (!updateRes.ok) {
      console.log(`[bling-sync-orders] Failed to update contact ${contactId}: ${updateRes.status} - ${updateText}`);
      return false;
    }

    console.log(`[bling-sync-orders] Contact ${contactId} address updated successfully`);
    return true;
  } catch (e: any) {
    console.log(`[bling-sync-orders] Error updating contact ${contactId}:`, String(e?.message || e));
    return false;
  }
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
  const customerNeighborhood = customer?.neighborhood || order.customer_neighborhood || '';
  const customerCity = customer?.city || order.customer_city || '';
  const customerState = customer?.state || order.customer_state || '';
  const customerEmail = customer?.email || '';

  // Helper to build address data for updates
  const buildAddressData = () => ({
    nome: customerName,
    telefone: phone,
    celular: phone,
    email: customerEmail,
    endereco: customerStreet,
    numero: customerNumber,
    complemento: customerComplement,
    bairro: customerNeighborhood,
    cep: customerCep,
    municipio: customerCity,
    uf: customerState,
  });

  // 0) Se o customer já tem bling_contact_id salvo, usar E ATUALIZAR o endereço
  if (customer?.bling_contact_id) {
    console.log(`[bling-sync-orders] Using cached bling_contact_id: ${customer.bling_contact_id}`);
    
    // Atualizar o endereço no Bling para garantir dados atualizados
    await updateBlingContactAddress(customer.bling_contact_id, accessToken, buildAddressData());
    
    return customer.bling_contact_id;
  }

  // 1) Try to find an existing contact by CPF/CNPJ FIRST (most reliable)
  let foundContactId: number | null = null;
  
  // 1.1) Buscar por numeroDocumento (CPF/CNPJ) - mais confiável
  if (customerCpf && isValidCPF(customerCpf)) {
    try {
      console.log(`[bling-sync-orders] Searching contact by CPF: ${customerCpf}`);
      const { response: cpfSearchRes, text: cpfSearchText } = await blingFetchWithRetry(
        `${BLING_API_URL}/contatos?pagina=1&limite=5&numeroDocumento=${encodeURIComponent(customerCpf)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        },
        { label: 'search-contact-by-cpf' }
      );
      if (cpfSearchRes.ok) {
        const parsed = JSON.parse(cpfSearchText);
        const contacts = parsed?.data || [];
        console.log(`[bling-sync-orders] Found ${contacts.length} contacts by CPF`);
        
        if (contacts.length > 0) {
          const contact = contacts[0];
          foundContactId = typeof contact.id === 'number' ? contact.id : 
                          (typeof contact.id === 'string' && /^\d+$/.test(contact.id)) ? Number(contact.id) : null;
          console.log(`[bling-sync-orders] Found contact by CPF: ${foundContactId} - ${contact.nome}`);
        }
      } else {
        console.log(`[bling-sync-orders] CPF search failed: ${cpfSearchRes.status} - ${cpfSearchText}`);
      }
    } catch (e: any) {
      console.log('[bling-sync-orders] Error searching by CPF:', String(e?.message || e));
    }
  }
  
  // 1.2) Se não encontrou por CPF, buscar por telefone ou nome
  if (!foundContactId) {
    try {
      const { response: searchRes, text: searchText } = await blingFetchWithRetry(
        `${BLING_API_URL}/contatos?pagina=1&limite=1&pesquisa=${encodeURIComponent(phone || customerName)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        },
        { label: 'search-contact-by-pesquisa' }
      );
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
  }

  // Se encontrou, ATUALIZAR endereço, salvar no customer e retornar
  if (foundContactId) {
    console.log(`[bling-sync-orders] Found existing Bling contact: ${foundContactId}`);
    
    // Atualizar o endereço no Bling para garantir dados atualizados
    await updateBlingContactAddress(foundContactId, accessToken, buildAddressData());
    
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
  // Bling API V3 requires "geral" wrapper for address data
  const payload: any = {
    nome: customerName,
    tipo: 'F', // Pessoa Física
    situacao: 'A', // Ativo
    telefone: phone || undefined,
    celular: phone || undefined,
    email: customerEmail || undefined,
    endereco: {
      geral: {
        endereco: customerStreet,
        numero: customerNumber,
        complemento: customerComplement,
        bairro: customerNeighborhood,
        cep: customerCep,
        municipio: customerCity,
        uf: customerState,
      },
    },
  };

  // Validar e adicionar CPF/CNPJ se disponível e válido
  if (customerCpf && isValidCPF(customerCpf)) {
    payload.numeroDocumento = customerCpf;
    console.log(`[bling-sync-orders] CPF válido: ${customerCpf}`);
  } else if (customerCpf) {
    console.log(`[bling-sync-orders] CPF inválido ignorado: ${customerCpf}`);
  }

  console.log('[bling-sync-orders] Creating contact with payload:', JSON.stringify(payload, null, 2));

  const { response: createRes, text: createText } = await blingFetchWithRetry(
    `${BLING_API_URL}/contatos`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    { label: 'create-contact' }
  );
  console.log('[bling-sync-orders] Bling create contact status:', createRes.status);
  console.log('[bling-sync-orders] Bling create contact response:', createText);

  if (!createRes.ok) {
    if (createText.includes('insufficient_scope')) {
      throw new Error(
        'Token do Bling sem permissão para criar CONTATOS. No Bling, adicione os escopos de Contatos (leitura/escrita) ao seu aplicativo e autorize novamente.'
      );
    }
    
    // Se o erro é CPF já cadastrado, tentar buscar o contato existente pelo nome no erro
    if (createText.includes('já está cadastrado no contato')) {
      console.log('[bling-sync-orders] CPF already registered, trying to find existing contact...');
      
      // Extrair o nome do contato existente da mensagem de erro
      const nameMatch = createText.match(/cadastrado no contato ([^"]+)"/);
      const existingName = nameMatch ? nameMatch[1].trim() : null;
      
      if (existingName) {
        console.log(`[bling-sync-orders] Searching for existing contact: ${existingName}`);
        try {
            const { response: searchByNameRes, text: searchByNameText } = await blingFetchWithRetry(
              `${BLING_API_URL}/contatos?pagina=1&limite=5&pesquisa=${encodeURIComponent(existingName)}`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Accept': 'application/json',
                },
              },
              { label: 'search-contact-by-name-after-duplicate-cpf' }
            );
          
          if (searchByNameRes.ok) {
              const searchData = JSON.parse(searchByNameText);
            const contacts = searchData?.data || [];
            console.log(`[bling-sync-orders] Found ${contacts.length} contacts matching "${existingName}"`);
            
            // Procurar contato com nome exato ou muito similar
            for (const contact of contacts) {
              const contactName = (contact.nome || '').toUpperCase().trim();
              const searchName = existingName.toUpperCase().trim();
              
              if (contactName === searchName || contactName.includes(searchName) || searchName.includes(contactName)) {
                console.log(`[bling-sync-orders] Found matching contact: ${contact.id} - ${contact.nome}`);
                
                // Salvar o bling_contact_id no customer
                if (customer?.id) {
                  await supabase
                    .from('customers')
                    .update({ bling_contact_id: contact.id })
                    .eq('id', customer.id)
                    .eq('tenant_id', tenantId);
                  console.log(`[bling-sync-orders] Saved existing bling_contact_id ${contact.id} to customer ${customer.id}`);
                }
                
                return contact.id;
              }
            }
          }
        } catch (searchError) {
          console.log('[bling-sync-orders] Error searching for existing contact:', searchError);
        }
      }
      
      // Se não encontrou, tentar buscar pelo CPF diretamente
      if (customerCpf) {
        console.log(`[bling-sync-orders] Trying to search by CPF: ${customerCpf}`);
        try {
          const { response: searchByCpfRes, text: searchByCpfText } = await blingFetchWithRetry(
            `${BLING_API_URL}/contatos?pagina=1&limite=1&pesquisa=${encodeURIComponent(customerCpf)}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
              },
            },
            { label: 'search-contact-by-cpf-after-duplicate' }
          );
          
          if (searchByCpfRes.ok) {
            const cpfData = JSON.parse(searchByCpfText);
            const contact = cpfData?.data?.[0];
            if (contact?.id) {
              console.log(`[bling-sync-orders] Found contact by CPF: ${contact.id} - ${contact.nome}`);
              
              if (customer?.id) {
                await supabase
                  .from('customers')
                  .update({ bling_contact_id: contact.id })
                  .eq('id', customer.id)
                  .eq('tenant_id', tenantId);
              }
              
              return contact.id;
            }
          }
        } catch (cpfSearchError) {
          console.log('[bling-sync-orders] Error searching by CPF:', cpfSearchError);
        }
      }
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

// Interface for custom shipping option with carrier mapping
interface CustomShippingOption {
  id: string;
  name: string;
  carrier_service_id: number | null;
  carrier_service_name: string | null;
  price: number;
  delivery_days: number;
}

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
  },
  activeShippingProvider?: string | null,
  customShippingOptions?: CustomShippingOption[]
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
  const customerNeighborhood = customer?.neighborhood || order.customer_neighborhood || '';
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
  // IMPORTANTE: Usamos prefixo "OZ-" para evitar conflito com pedidos de outros canais (Shopee, ML, etc)
  const orderNumber = `OZ-${order.id}`;
  const blingOrder: any = {
    numero: orderNumber,
    numeroLoja: orderNumber,
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
  
  // Padrões comuns de frete na observação:
  // "[FRETE] Melhor Envio - SEDEX | R$ 12.03 | Prazo: 2 dias úteis"
  // "[FRETE] Correios - PAC | R$ 30,41 | Prazo: 6 dias úteis"
  // "[FRETE] Mandae Econômico | R$ 22,50 | Prazo: 5 dias úteis"
  // "[FRETE] Retirada"
  // "Frete: PAC R$ 30,41 (6 dias úteis)"
  
  // Primeiro padrão: [FRETE] Nome - Serviço | R$ XX,XX | Prazo: X dias
  const freteNovoFormatoMatch = observacao.match(/\[FRETE\]\s*([^|]+?)\s*\|\s*R\$\s*([\d.,]+)/i);
  if (freteNovoFormatoMatch) {
    freteNome = freteNovoFormatoMatch[1].trim();
    freteValor = parseMonetaryValue(freteNovoFormatoMatch[2]);
  }
  
  // Segundo padrão: [FRETE] Retirada (sem valor)
  if (!freteNome && observacao.match(/\[FRETE\]\s*Retirada/i)) {
    freteNome = 'Retirada';
    freteValor = 0;
  }
  
  // Terceiro padrão: [FRETE] Frete Grátis (sem valor ou R$ 0,00)
  if (!freteNome && observacao.match(/\[FRETE\]\s*Frete\s*Gr[áa]tis/i)) {
    freteNome = 'Frete Grátis';
    freteValor = 0;
  }
  
  // Padrão legado: "Frete: XXX R$ YY,ZZ"
  if (!freteNome && !freteValor) {
    const freteLinhaMatch = observacao.match(/[Ff]rete[:\s]+([^R$\n]+?)(?:\s*[-–]?\s*R\$\s*([\d.,]+))/);
    if (freteLinhaMatch) {
      freteNome = freteLinhaMatch[1].trim().replace(/[-–]\s*$/, '').trim();
      freteValor = parseMonetaryValue(freteLinhaMatch[2]);
    }
  }
  
  // Padrão alternativo: "Transporte: XXX R$ YY,ZZ"
  if (!freteNome && !freteValor) {
    const altMatch = observacao.match(/(?:transporte|envio)[:\s]+([^R$\n]+?)(?:\s*[-–]?\s*R\$\s*([\d.,]+))/i);
    if (altMatch) {
      freteNome = altMatch[1].trim().replace(/[-–]\s*$/, '').trim();
      freteValor = parseMonetaryValue(altMatch[2]);
    }
  }
  
  // Fallback: buscar qualquer padrão "R$ XX,XX" se houver palavra "frete"
  if (freteValor === 0 && observacao.toLowerCase().includes('frete') && !observacao.toLowerCase().includes('grátis') && !observacao.toLowerCase().includes('retirada')) {
    const valorMatch = observacao.match(/R\$\s*([\d.,]+)/);
    if (valorMatch) {
      freteValor = parseMonetaryValue(valorMatch[1]);
    }
  }
  
  // Limpar nome do frete - remover caracteres extras como "|", "-" no início/fim, prazos, etc.
  if (freteNome) {
    // Remover prazos entre parênteses
    freteNome = freteNome.replace(/\s*\([^)]*\)\s*/g, '').trim();
    // Remover | e - no início e fim
    freteNome = freteNome.replace(/^[\s|\-–]+|[\s|\-–]+$/g, '').trim();
    // Remover "Melhor Envio - " ou "Correios - " do início para deixar só o serviço
    freteNome = freteNome.replace(/^(Melhor\s*Envio|Correios)\s*[-–]\s*/i, '').trim();
    // Limitar tamanho para o Bling aceitar
    if (freteNome.length > 50) {
      freteNome = freteNome.substring(0, 50);
    }
  }
  
  // Identificar qual integração de logística usar
  // PRIORIDADE 1: Verificar se o frete é uma opção customizada com carrier_service_name mapeado
  // PRIORIDADE 2: Usar a integração de frete ativa do tenant
  let logisticaIntegracao = '';
  let servicoFrete = '';
  let customShippingMatch: CustomShippingOption | undefined;
  
  // Buscar opção customizada pelo nome do frete (ex: "Frete Fixo - Envio" na observação)
  if (customShippingOptions && customShippingOptions.length > 0) {
    // Extrair nome da opção customizada da observação
    // Formato: "[FRETE] Envio - Frete Fixo - Envio | R$ 15.90 | Prazo: ..."
    // Queremos encontrar "Frete Fixo - Envio" 
    const observacaoLower = observacao.toLowerCase();
    
    for (const option of customShippingOptions) {
      const optionNameLower = option.name.toLowerCase();
      // Verificar se o nome da opção está na observação
      if (observacaoLower.includes(optionNameLower)) {
        customShippingMatch = option;
        console.log(`[bling-sync-orders] Custom shipping option matched: "${option.name}" -> carrier: ${option.carrier_service_name || 'none'}`);
        break;
      }
    }
    
    // Se encontrou opção customizada com carrier mapeado
    if (customShippingMatch?.carrier_service_name) {
      // Extrair provider e serviço do carrier_service_name (ex: "Mandae - Econômico")
      const carrierParts = customShippingMatch.carrier_service_name.split(' - ');
      if (carrierParts.length >= 2) {
        // Primeira parte é o provider (Mandae, Melhor Envio, Correios)
        logisticaIntegracao = carrierParts[0].trim();
        // Segunda parte é o serviço (Econômico, SEDEX, PAC, etc)
        servicoFrete = carrierParts.slice(1).join(' - ').trim();
        console.log(`[bling-sync-orders] Custom shipping carrier mapped: logistica="${logisticaIntegracao}", servico="${servicoFrete}"`);
      } else {
        // Se não tem separador, usar o nome completo como logística
        logisticaIntegracao = customShippingMatch.carrier_service_name.trim();
        console.log(`[bling-sync-orders] Custom shipping carrier (single part): logistica="${logisticaIntegracao}"`);
      }
    }
  }
  
  // FALLBACK: Se não encontrou opção customizada, usar provider ativo
  if (!logisticaIntegracao && activeShippingProvider) {
    // Mapear provider do banco para nome do Bling
    const providerMapping: Record<string, string> = {
      'melhor_envio': 'Melhor Envio',
      'mandae': 'Mandae',
      'correios': 'Correios',
    };
    
    logisticaIntegracao = providerMapping[activeShippingProvider] || '';
    console.log(`[bling-sync-orders] Logística definida pela integração ativa: ${activeShippingProvider} -> ${logisticaIntegracao}`);
  }
  
  if (!logisticaIntegracao && !activeShippingProvider) {
    console.log('[bling-sync-orders] Nenhuma integração de frete ativa encontrada para o tenant');
  }
  
  // Se ainda não tem serviço definido, extrair do nome do frete
  if (!servicoFrete) {
    const servicoMatch = freteNome.match(/(?:[-–]\s*)?(SEDEX|PAC|Mini\s*Envios?|Pac\s*Mini|Econômico|Express|Standard|Rápido)/i);
    if (servicoMatch) {
      servicoFrete = servicoMatch[1].toUpperCase().replace('ECONOMICO', 'Econômico').replace('MINIENVIO', 'Mini Envios').replace('RAPIDO', 'Rápido');
    }
  }
  
  console.log('[bling-sync-orders] Frete extraído:', { freteNome, freteValor, logisticaIntegracao, servicoFrete, activeShippingProvider, customShippingMatch: customShippingMatch?.name || null });

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
    
    // Adicionar integração de logística se identificada
    // O Bling espera o nome da integração, não o ID
    if (logisticaIntegracao) {
      blingOrder.transporte.logistica = logisticaIntegracao;
      console.log(`[bling-sync-orders] Logística identificada: ${logisticaIntegracao}`);
    }
    
    // Adicionar serviço de frete nos volumes se identificado
    if (servicoFrete) {
      blingOrder.transporte.volumes = [{
        servico: servicoFrete,
      }];
      console.log(`[bling-sync-orders] Serviço de frete: ${servicoFrete}`);
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
    if (logisticaIntegracao) {
      blingOrder.transporte.logistica = logisticaIntegracao;
    }
    if (servicoFrete) {
      blingOrder.transporte.volumes = [{
        servico: servicoFrete,
      }];
    }
    console.log('[bling-sync-orders] Adicionando apenas valor de frete:', freteValor);
  }

  // Vincular à loja OrderZap se configurado
  if (storeId) {
    blingOrder.loja = { id: storeId };
    console.log(`[bling-sync-orders] Vinculando pedido à loja ID: ${storeId}`);
  }

  console.log('[bling-sync-orders] Sending order to Bling:', JSON.stringify(blingOrder, null, 2));

  const { response, text: responseText } = await blingFetchWithRetry(
    `${BLING_API_URL}/pedidos/vendas`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(blingOrder),
    },
    { label: 'create-sale-order' }
  );
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
      const existingId = await findExistingBlingSaleOrderIdByNumero(accessToken, order.id, storeId);
      if (existingId) {
        return { kind: 'already_exists', blingOrderId: existingId, raw: { error: responseText } };
      }
    }

    // Alguns casos o Bling devolve erro de validação "A venda possui a mesma situação".
    // Isso costuma ocorrer quando o número já existe e a API não aceita reprocessar.
    // Tratamos como "já existe" para não bloquear o batch.
    if (
      response.status === 400 &&
      (responseText.includes('A venda possui a mesma situa') || responseText.includes('"code":50'))
    ) {
      const existingId = await findExistingBlingSaleOrderIdByNumero(accessToken, order.id, storeId);
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
  const { response, text } = await blingFetchWithRetry(
    `${BLING_API_URL}/pedidos/vendas?pagina=${page}&limite=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    },
    { label: 'fetch-orders' }
  );

  if (!response.ok) {
    throw new Error(`Bling API error: ${response.status} - ${text}`);
  }

  return JSON.parse(text);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, tenant_id, order_id, start_date, end_date } = await req.json();

    console.log(`[bling-sync-orders] ========================================`);
    console.log(`[bling-sync-orders] Action: ${action}, Tenant: ${tenant_id}, Order: ${order_id}`);
    console.log(`[bling-sync-orders] Date range: ${start_date} to ${end_date}`);

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

        // Buscar integração de frete ativa do tenant para definir a logística
        const { data: shippingIntegration } = await supabase
          .from('shipping_integrations')
          .select('provider')
          .eq('tenant_id', tenant_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        
        const activeShippingProvider = shippingIntegration?.provider || null;
        console.log('[bling-sync-orders] Active shipping provider:', activeShippingProvider);

        // Buscar opções de frete customizadas do tenant para mapeamento de carrier
        const { data: customShippingOptionsData } = await supabase
          .from('custom_shipping_options')
          .select('id, name, carrier_service_id, carrier_service_name, price, delivery_days')
          .eq('tenant_id', tenant_id)
          .eq('is_active', true);
        
        const customShippingOptions: CustomShippingOption[] = customShippingOptionsData || [];
        console.log('[bling-sync-orders] Custom shipping options loaded:', customShippingOptions.length);

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
        
        console.log(`[bling-sync-orders] FISCAL DATA FOR TENANT ${tenant_id}:`, JSON.stringify(fiscalData, null, 2));
        
        const blingResult = await sendOrderToBling(order, cartItems, customer, accessToken, supabase, tenant_id, blingStoreId, fiscalData, activeShippingProvider, customShippingOptions);

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
        let ordersQuery = supabase
          .from('orders')
          .select('*')
          .eq('tenant_id', tenant_id)
          .eq('is_paid', true)
          .is('bling_order_id', null);
        
        // Aplicar filtro de data se fornecido
        if (start_date) {
          ordersQuery = ordersQuery.gte('created_at', start_date);
          console.log(`[bling-sync-orders] Filtering orders from: ${start_date}`);
        }
        if (end_date) {
          // Adicionar 1 dia para incluir o dia final completo
          const endDateObj = new Date(end_date);
          endDateObj.setDate(endDateObj.getDate() + 1);
          ordersQuery = ordersQuery.lt('created_at', endDateObj.toISOString().split('T')[0]);
          console.log(`[bling-sync-orders] Filtering orders until: ${end_date}`);
        }
        
        const { data: orders, error: ordersError } = await ordersQuery
          .order('created_at', { ascending: false })
          .limit(50);

        if (ordersError) {
          throw new Error(`Failed to fetch orders: ${ordersError.message}`);
        }

        // Buscar integração de frete ativa do tenant UMA VEZ antes do loop
        const { data: shippingIntegrationBulk } = await supabase
          .from('shipping_integrations')
          .select('provider')
          .eq('tenant_id', tenant_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        
        const activeShippingProviderBulk = shippingIntegrationBulk?.provider || null;
        console.log('[bling-sync-orders] Bulk sync - Active shipping provider:', activeShippingProviderBulk);

        // Buscar opções de frete customizadas do tenant UMA VEZ antes do loop
        const { data: customShippingOptionsDataBulk } = await supabase
          .from('custom_shipping_options')
          .select('id, name, carrier_service_id, carrier_service_name, price, delivery_days')
          .eq('tenant_id', tenant_id)
          .eq('is_active', true);
        
        const customShippingOptionsBulk: CustomShippingOption[] = customShippingOptionsDataBulk || [];
        console.log('[bling-sync-orders] Bulk sync - Custom shipping options loaded:', customShippingOptionsBulk.length);

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

            // Buscar integração de frete ativa do tenant para definir a logística (apenas uma vez no início do loop)
            // Movido para fora do loop para melhor performance
            
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
            
            console.log(`[bling-sync-orders] SYNC_ALL - FISCAL DATA FOR ORDER ${order.id}:`, JSON.stringify(fiscalData, null, 2));
            
            const blingResult = await sendOrderToBling(order, cartItems, customer, accessToken, supabase, tenant_id, blingStoreId, fiscalData, activeShippingProviderBulk, customShippingOptionsBulk);

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
