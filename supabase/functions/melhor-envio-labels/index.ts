import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Utils: sanitização e validação de CPF/CNPJ
function onlyDigits(v: string | number | null | undefined): string {
  return String(v ?? '')
    .normalize('NFKC')
    .replace(/\s/g, '')
    .replace(/\D/g, '');
}

function isValidCPF(cpf: string): boolean {
  const s = onlyDigits(cpf);
  if (s.length !== 11 || /(\d)\1{10}/.test(s)) return false;
  let sum = 0, rest;
  for (let i = 1; i <= 9; i++) sum += parseInt(s.substring(i - 1, i), 10) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(s.substring(9, 10), 10)) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++) sum += parseInt(s.substring(i - 1, i), 10) * (12 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(s.substring(10, 11), 10);
}

function isValidCNPJ(cnpj: string): boolean {
  const s = onlyDigits(cnpj);
  if (s.length !== 14 || /(\d)\1{13}/.test(s)) return false;
  const calc = (base: number) => {
    let pos = base - 7, sum = 0;
    for (let i = 0; i < base; i++) {
      sum += parseInt(s[i], 10) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return (r < 2) ? 0 : 11 - r;
  };
  if (calc(12) !== parseInt(s[12], 10)) return false;
  if (calc(13) !== parseInt(s[13], 10)) return false;
  return true;
}

// Debug helpers and sender document handling (PF/PJ)
function logBytes(label: string, value: any) {
  const raw = String(value ?? '');
  const bytes = new TextEncoder().encode(raw);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
  const digits = onlyDigits(raw);
  console.log(`\n[DEBUG:${label}] raw="${raw}" len=${raw.length}`);
  console.log(`[DEBUG:${label}] bytes(hex)= ${hex}`);
  console.log(`[DEBUG:${label}] digits="${digits}" len=${digits.length}\n`);
}

function setSenderDocument(fromObj: any, rawDoc: any, mode: string = 'AUTO') {
  const digits = onlyDigits(rawDoc);
  delete (fromObj as any).document;
  delete (fromObj as any).company_document;

  const MODE = String(mode || 'AUTO').toUpperCase();
  if (MODE === 'PF' || (MODE === 'AUTO' && digits.length === 11)) {
    if (!isValidCPF(digits)) throw new Error('CPF do remetente inválido');
    (fromObj as any).document = digits;
  } else if (MODE === 'PJ' || (MODE === 'AUTO' && digits.length === 14)) {
    if (!isValidCNPJ(digits)) throw new Error('CNPJ do remetente inválido');
    (fromObj as any).company_document = digits;
  } else {
    throw new Error('Documento do remetente deve ter 11 (CPF) ou 14 (CNPJ) dígitos');
  }
}

function assertSenderDocument(fromObj: any) {
  const cpf  = onlyDigits((fromObj as any).document);
  const cnpj = onlyDigits((fromObj as any).company_document);

  console.log('[DEBUG] FROM.doc raw => document:', (fromObj as any).document,
              ' | company_document:', (fromObj as any).company_document);
  console.log('[DEBUG] FROM.doc sanitized => cpf:', cpf, 'len=', cpf.length,
              ' | cnpj:', cnpj, 'len=', cnpj.length);

  if (cnpj) {
    if (!isValidCNPJ(cnpj)) throw new Error('CNPJ inválido');
    delete (fromObj as any).document;
    (fromObj as any).company_document = cnpj;
    return;
  }
  if (cpf) {
    if (!isValidCPF(cpf)) throw new Error('CPF inválido');
    delete (fromObj as any).company_document;
    (fromObj as any).document = cpf;
    return;
  }
  throw new Error('Documento do remetente ausente');
}

// Existing helper: set CPF ou CNPJ conforme o tamanho
function setDocumentFields(entity: any, raw: any) {
  const digits = onlyDigits(raw);
  delete (entity as any).document;
  delete (entity as any).company_document;

  if (digits.length === 11) {
    if (!isValidCPF(digits)) throw new Error('CPF inválido');
    (entity as any).document = digits;
  } else if (digits.length === 14) {
    if (!isValidCNPJ(digits)) throw new Error('CNPJ inválido');
    (entity as any).company_document = digits;
  } else {
    throw new Error('Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos');
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, order_id, shipment_id, customer_phone } = await req.json();
    
    console.log('Labels action:', action);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get configuration
    const { data: configData, error: configError } = await supabase
      .from('frete_config')
      .select('*')
      .limit(1)
      .single();

    if (configError || !configData) {
      return new Response(
        JSON.stringify({ error: 'Configuração de frete não encontrada' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!configData.access_token) {
      return new Response(
        JSON.stringify({ error: 'Token de acesso não configurado' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const baseUrl = configData.api_base_url;
    const accessToken = configData.access_token;

    if (action === 'create_shipment') {
      if (!order_id || !customer_phone) {
        return new Response(
          JSON.stringify({ error: 'order_id e customer_phone são obrigatórios' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Get order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .single();

      if (orderError || !orderData) {
        return new Response(
          JSON.stringify({ error: 'Pedido não encontrado' }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Get customer details (you might need to adapt this based on your customer data structure)
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', customer_phone)
        .limit(1)
        .single();

      // Get freight quotation or use default values
      const { data: cotacaoData } = await supabase
        .from('frete_cotacoes')
        .select('*')
        .eq('pedido_id', order_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Get app settings for default dimensions and weight
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      // Use cotacao data if available, otherwise use app settings defaults
      const freight = cotacaoData || {
        cep_destino: customerData?.cep || '01000000',
        peso: appSettings?.default_weight_kg || 0.3,
        altura: appSettings?.default_height_cm || 2,
        largura: appSettings?.default_width_cm || 16,
        comprimento: appSettings?.default_length_cm || 20,
        valor_declarado: orderData.total_amount,
        raw_response: { service_id: 1 } // Default PAC service
      };

      // Monta e valida documentos do remetente e destinatário
      const fromEntity: any = {
        name: configData.remetente_nome || "Remetente",
        phone: configData.remetente_telefone || "1199999999",
        email: configData.remetente_email || "contato@empresa.com",
        address: configData.remetente_endereco_rua || "Rua do Remetente",
        number: configData.remetente_endereco_numero || "123",
        complement: configData.remetente_endereco_comp || "",
        district: configData.remetente_bairro || "Centro",
        city: configData.remetente_cidade || "Belo Horizonte",
        state_abbr: configData.remetente_uf || "MG",
        country_id: "BR",
        postal_code: configData.cep_origem || "31575060"
      };

      // Sanitize sender critical fields
      fromEntity.phone = onlyDigits(fromEntity.phone);
      fromEntity.postal_code = onlyDigits(fromEntity.postal_code);

      // Additional diagnostics for sender document
      console.log('[DEBUG] remetente_documento RAW:', configData.remetente_documento);
      const senderDigits = onlyDigits(configData.remetente_documento || '');
      console.log('[DEBUG] remetente_documento DIGITS:', senderDigits);

      // Simple guard: ensure 11 or 14 digits and prefill fromEntity
      if (senderDigits.length === 14) {
        fromEntity.company_document = senderDigits; // PJ
      } else if (senderDigits.length === 11) {
        fromEntity.document = senderDigits; // PF
      } else {
        return new Response(
          JSON.stringify({
            error: 'Documento do remetente inválido',
            field: 'from',
            details: 'Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos'
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const rawToDoc = (customerData?.cpf ?? (customerData as any)?.cnpj ?? (customerData as any)?.document ?? null);
      if (!rawToDoc) {
        return new Response(
          JSON.stringify({ error: 'Documento do destinatário ausente', field: 'to' }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const toEntity: any = {
        name: customerData?.name || "Cliente",
        phone: customer_phone,
        email: (customerData as any)?.email || "cliente@email.com",
        address: customerData?.street || "Rua do Cliente",
        number: customerData?.number || "123",
        complement: customerData?.complement || "",
        district: (customerData as any)?.neighborhood || "Centro",
        city: customerData?.city || "São Paulo",
        state_abbr: customerData?.state || "SP",
        country_id: "BR",
        postal_code: freight.cep_destino || customerData?.cep || "01000000"
      };

      // Sanitize recipient critical fields
      toEntity.phone = onlyDigits(toEntity.phone);
      toEntity.postal_code = onlyDigits(toEntity.postal_code);

      try {
        setDocumentFields(toEntity, rawToDoc);
      } catch (e) {
        return new Response(
          JSON.stringify({ error: 'Documento do destinatário inválido', field: 'to', details: (e as Error).message }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

// Create cart payload following Melhor Envio documentation
      const cartPayload = {
        service: freight.raw_response?.service_id || 1,
        from: fromEntity,
        to: toEntity,
        volumes: [
          {
            height: freight.altura || 4,
            width: freight.largura || 12,
            length: freight.comprimento || 17,
            weight: freight.peso || 0.3
          }
        ],
        options: {
          insurance_value: freight.valor_declarado || orderData.total_amount,
          receipt: false,
          own_hand: false,
          non_commercial: true, // evita exigir chave NFe
          platform: "SeuSistema",
          tags: [
            { 
              tag: `PEDIDO-${orderData.id}`, 
              url: `https://app/pedido/${orderData.id}` 
            }
          ]
        }
      } as any;

      // Documento remetente: PF/PJ com logs e modo opcional via env
      const FROM_MODE = (Deno.env.get('ME_FROM_TYPE') || 'AUTO').toUpperCase();
      console.log('[DEBUG] FROM_MODE =', FROM_MODE);
      logBytes('FROM_DOC_RAW', configData.remetente_documento);
      try {
        setSenderDocument(cartPayload.from, configData.remetente_documento, FROM_MODE);
        assertSenderDocument(cartPayload.from);
      } catch (e) {
        return new Response(
          JSON.stringify({ 
            error: 'Documento do remetente inválido', 
            field: 'from', 
            details: (e as Error).message,
            debug_from: cartPayload.from
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('[FINAL] from.document =', cartPayload.from.document ?? null);
      console.log('[FINAL] from.company_document =', cartPayload.from.company_document ?? null);
      console.log('Adding to cart with payload (sanitized):', JSON.stringify(cartPayload, null, 2));

      // Step 1: Add to cart
      const cartResponse = await fetch(`${baseUrl}/v2/me/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'FreteApp (contato@empresa.com)'
        },
        body: JSON.stringify(cartPayload)
      });

      if (!cartResponse.ok) {
        const errorData = await cartResponse.text();
        console.error('Cart creation error:', cartResponse.status, errorData);
        
        return new Response(
          JSON.stringify({ 
            error: 'Erro ao adicionar ao carrinho',
            details: errorData 
          }),
          { 
            status: cartResponse.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const cartData = await cartResponse.json();
      console.log('Added to cart successfully:', cartData);
      
      const cartId = cartData.id;
      
      // Step 2: Checkout (purchase)
      console.log('Processing checkout for cart ID:', cartId);
      
      const checkoutResponse = await fetch(`${baseUrl}/v2/me/shipment/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'FreteApp (contato@empresa.com)'
        },
        body: JSON.stringify({ orders: [cartId] })
      });

      if (!checkoutResponse.ok) {
        const errorData = await checkoutResponse.text();
        console.error('Checkout error:', checkoutResponse.status, errorData);
        
        return new Response(
          JSON.stringify({ 
            error: 'Erro no checkout',
            details: errorData 
          }),
          { 
            status: checkoutResponse.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const checkoutData = await checkoutResponse.json();
      console.log('Checkout completed successfully:', checkoutData);
      
      const shipmentId = checkoutData.purchase?.id;
      
      // Step 3: Generate label
      if (shipmentId) {
        console.log('Generating label for shipment ID:', shipmentId);
        
        const generateResponse = await fetch(`${baseUrl}/v2/me/shipment/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'FreteApp (contato@empresa.com)'
          },
          body: JSON.stringify({ orders: [shipmentId] })
        });

        if (!generateResponse.ok) {
          console.error('Label generation error:', generateResponse.status, await generateResponse.text());
        } else {
          const generateData = await generateResponse.json();
          console.log('Label generated successfully:', generateData);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          cart_id: cartId,
          shipment_id: shipmentId,
          data: {
            cart: cartData,
            checkout: checkoutData
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'pay_shipment') {
      if (!shipment_id) {
        return new Response(
          JSON.stringify({ error: 'shipment_id é obrigatório' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      console.log('Paying shipment:', shipment_id);

      const response = await fetch(`${baseUrl}/v2/me/shipment/${shipment_id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'FreteApp (contato@empresa.com)'
        }
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Shipment payment error:', response.status, errorData);
        
        return new Response(
          JSON.stringify({ 
            error: 'Erro ao pagar envio',
            details: errorData 
          }),
          { 
            status: response.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const responseData = await response.json();
      console.log('Shipment paid successfully:', responseData);

      return new Response(
        JSON.stringify({ 
          success: true,
          data: responseData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'download_label') {
      if (!shipment_id) {
        return new Response(
          JSON.stringify({ error: 'shipment_id é obrigatório' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      console.log('Getting label for shipment:', shipment_id);

      const response = await fetch(`${baseUrl}/v2/me/shipment/${shipment_id}/print`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'FreteApp (contato@empresa.com)'
        }
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Label download error:', response.status, errorData);
        
        return new Response(
          JSON.stringify({ 
            error: 'Erro ao obter etiqueta',
            details: errorData 
          }),
          { 
            status: response.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const responseData = await response.json();
      console.log('Label URL obtained:', responseData);

      return new Response(
        JSON.stringify({ 
          success: true,
          label_url: responseData.url,
          data: responseData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação não reconhecida' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in melhor-envio-labels function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});