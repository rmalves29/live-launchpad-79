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

      // 1) Normaliza telefone recebido
      const phoneDigits = onlyDigits(customer_phone);

      // 2) Busca cliente tentando variações
      let { data: customerData } = await supabase
        .from('customers')
        .select('*')
        .or(`phone.eq.${customer_phone},phone.eq.${phoneDigits},phone.ilike.%${phoneDigits}%`)
        .eq('tenant_id', orderData.tenant_id)
        .limit(1)
        .maybeSingle();

      // Fallbacks de busca por ID/email do pedido, se existir
      if (!customerData && orderData?.customer_id) {
        const { data } = await supabase.from('customers').select('*').eq('id', orderData.customer_id).eq('tenant_id', orderData.tenant_id).maybeSingle();
        customerData = data || customerData;
      }
      if (!customerData && orderData?.customer_email) {
        const { data } = await supabase.from('customers').select('*').eq('email', orderData.customer_email).eq('tenant_id', orderData.tenant_id).maybeSingle();
        customerData = data || customerData;
      }

      // If still no customer data or incomplete address, use order data or defaults
      console.log('Customer data found:', customerData ? 'Yes' : 'No');
      if (customerData) {
        console.log('Customer address complete:', !!(customerData.cep && customerData.street && customerData.city));
      }

      // Get app settings for default dimensions and weight
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      // Prepare package dimensions and weight
      const packageData = {
        peso: appSettings?.default_weight_kg || 0.3,
        altura: appSettings?.default_height_cm || 2,
        largura: appSettings?.default_width_cm || 16,
        comprimento: appSettings?.default_length_cm || 20,
        valor_declarado: orderData.total_amount
      };

      // Check if there's a saved quotation for this order
      const { data: cotacaoData } = await supabase
        .from('frete_cotacoes')
        .select('*')
        .eq('pedido_id', order_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cotacaoData) {
        packageData.peso = cotacaoData.peso;
        packageData.altura = cotacaoData.altura;
        packageData.largura = cotacaoData.largura;
        packageData.comprimento = cotacaoData.comprimento;
        packageData.valor_declarado = cotacaoData.valor_declarado;
      }

      // Prepare sender and recipient entities
      const fromEntity: any = {
        name: configData.remetente_nome || "Remetente",
        phone: onlyDigits(configData.remetente_telefone || '1199999999'),
        email: configData.remetente_email || "contato@empresa.com",
        address: configData.remetente_endereco_rua || "Rua do Remetente",
        number: configData.remetente_endereco_numero || "123",
        complement: configData.remetente_endereco_comp || "",
        district: configData.remetente_bairro || "Centro",
        city: configData.remetente_cidade || "Belo Horizonte",
        state_abbr: configData.remetente_uf || "MG",
        country_id: "BR",
        postal_code: onlyDigits(configData.cep_origem || '31575060')
      };

      // Validate and set sender document
      console.log('[DEBUG] remetente_documento RAW:', configData.remetente_documento);
      const senderDigits = onlyDigits(configData.remetente_documento || '');
      console.log('[DEBUG] remetente_documento DIGITS:', senderDigits);

      if (senderDigits.length === 14) {
        fromEntity.company_document = senderDigits;
      } else if (senderDigits.length === 11) {
        fromEntity.document = senderDigits;
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

      // Get recipient document candidates - make it optional
      const docCandidatesRaw = [
        customerData?.cpf,
        customerData?.cnpj,
        (customerData as any)?.cpf_cnpj,
        (customerData as any)?.document,
        (customerData as any)?.tax_id,
        (customerData as any)?.doc,
        orderData?.cpf,
        orderData?.cnpj,
        (orderData as any)?.cpf_cnpj,
        (orderData as any)?.customer_tax_id,
        (orderData as any)?.tax_id,
        (orderData as any)?.destinatario_documento
      ];

      const rawToDoc = docCandidatesRaw
        .map(v => onlyDigits(v || ''))
        .find(d => d.length === 11 || d.length === 14) || null;

      console.log('[DEBUG] chosen recipient doc:', rawToDoc);

      // Continue without recipient document if not found - some services don't require it
      if (!rawToDoc) {
        console.log('[DEBUG] No recipient document found, continuing without it (some shipping services allow this)');
      }

      // Prepare recipient entity with better fallbacks
      const recipientCep = onlyDigits(
        customerData?.cep || 
        (orderData as any)?.shipping_zip || 
        (orderData as any)?.customer_cep ||
        configData.cep_origem || // Use sender's CEP as fallback
        '01000000'
      );
      
      // Validate CEP format
      if (recipientCep.length !== 8) {
        console.error(`Invalid recipient CEP: ${recipientCep} (length: ${recipientCep.length})`);
        return new Response(
          JSON.stringify({
            error: 'CEP de destino inválido',
            details: `CEP deve ter 8 dígitos. Encontrado: ${recipientCep}`
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const toEntity: any = {
        name: customerData?.name || (orderData as any)?.customer_name || "Cliente",
        phone: phoneDigits,
        email: (customerData as any)?.email || (orderData as any)?.customer_email || "cliente@email.com",
        address: customerData?.street || (orderData as any)?.shipping_street || "Rua do Cliente",
        number: customerData?.number || (orderData as any)?.shipping_number || "100",
        complement: customerData?.complement || (orderData as any)?.shipping_complement || "",
        district: (customerData as any)?.neighborhood || (orderData as any)?.shipping_district || "Centro",
        city: customerData?.city || (orderData as any)?.shipping_city || "São Paulo",
        state_abbr: customerData?.state || (orderData as any)?.shipping_state || "SP",
        country_id: "BR",
        postal_code: recipientCep
      };

      console.log('Recipient address prepared:', JSON.stringify(toEntity, null, 2));

      // Set recipient document if available
      if (rawToDoc) {
        try {
          setDocumentFields(toEntity, rawToDoc);
        } catch (e) {
          console.log(`[DEBUG] Warning: Invalid recipient document ${rawToDoc}, continuing without it: ${(e as Error).message}`);
          // Continue without document - many shipping services work without recipient document
        }
      }

      // Check if sender and recipient addresses are the same
      const sameAddress = (
        fromEntity.address === toEntity.address &&
        fromEntity.number === toEntity.number &&
        fromEntity.postal_code === toEntity.postal_code &&
        fromEntity.city === toEntity.city
      );

      if (sameAddress) {
        toEntity.complement = (toEntity.complement || '') + ' - DESTINATARIO';
        console.log('[DEBUG] Same addresses detected, added differentiator to recipient complement');
      }

      // STEP 1: Quote services (calculate shipping)
      const quotePayload = {
        from: { postal_code: fromEntity.postal_code },
        to: { postal_code: toEntity.postal_code },
        package: {
          height: packageData.altura,
          width: packageData.largura,
          length: packageData.comprimento,
          weight: packageData.peso
        },
        options: {
          insurance_value: packageData.valor_declarado,
          receipt: false,
          own_hand: false
        }
      };

      console.log('Step 1: Quoting services with payload:', JSON.stringify(quotePayload, null, 2));

      const quoteResponse = await fetch(`${baseUrl}/v2/me/shipment/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'ManiaDeMulher-Sistema'
        },
        body: JSON.stringify(quotePayload)
      });

      if (!quoteResponse.ok) {
        const errorData = await quoteResponse.text();
        console.error('Quote error:', quoteResponse.status, errorData);
        return new Response(
          JSON.stringify({ 
            error: 'Erro na cotação de frete',
            details: errorData 
          }),
          { status: quoteResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const quoteData = await quoteResponse.json();
      console.log('Quote response:', JSON.stringify(quoteData, null, 2));

      // Find the first available service without errors
      const availableService = quoteData.find((service: any) => !service.error && service.id);
      
      if (!availableService) {
        return new Response(
          JSON.stringify({ 
            error: 'Nenhum serviço de frete disponível',
            details: 'Todas as opções retornaram erro na cotação'
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Selected service:', availableService.id, availableService.name);

      // Get order products for declaration - try by cart_id first, then by order directly
      let cartItems = null;
      let cartError = null;
      
      if (orderData.cart_id) {
        const { data, error } = await supabase
          .from('cart_items')
          .select(`
            qty,
            unit_price,
            product_id,
            products (
              name,
              code
            )
          `)
          .eq('cart_id', orderData.cart_id);
        cartItems = data;
        cartError = error;
      }
      
      // If no cart_id or no items found, try to find cart items by order relationship
      if (!cartItems || cartItems.length === 0) {
        console.log('No cart items found by cart_id, trying alternative methods...');
        
        // Try to find a cart related to this order and get its items
        const { data: orderCart } = await supabase
          .from('carts')
          .select('id')
          .eq('customer_phone', orderData.customer_phone)
          .eq('event_date', orderData.event_date)
          .eq('event_type', orderData.event_type)
          .eq('tenant_id', orderData.tenant_id)
          .maybeSingle();
          
        if (orderCart?.id) {
          const { data } = await supabase
            .from('cart_items')
            .select(`
              qty,
              unit_price,
              product_id,
              products (
                name,
                code
              )
            `)
            .eq('cart_id', orderCart.id);
          cartItems = data;
        }
      }

      if (cartError) {
        console.error('Error fetching cart items:', cartError);
      }

      // Prepare products for Melhor Envio
      const products = (cartItems || []).map(item => ({
        name: item.products?.name || 'Produto',
        quantity: item.qty,
        unitary_value: parseFloat(item.unit_price?.toString() || '0')
      }));

      // STEP 2: Add to cart with the quoted service ID
      const cartPayload = {
        service: availableService.id,
        from: fromEntity,
        to: toEntity,
        products: products.length > 0 ? products : [
          {
            name: 'Produto do pedido',
            quantity: 1,
            unitary_value: parseFloat(orderData.total_amount?.toString() || '0')
          }
        ],
        volumes: [
          {
            height: packageData.altura,
            width: packageData.largura,
            length: packageData.comprimento,
            weight: packageData.peso
          }
        ],
        options: {
          insurance_value: packageData.valor_declarado,
          receipt: false,
          own_hand: false,
          non_commercial: true,
          platform: "ManiaDeMulher-Sistema",
          tags: [
            { 
              tag: `PEDIDO-${orderData.id}`, 
              url: `https://seusite/pedido/${orderData.id}` 
            }
          ]
        }
      };

      console.log('Step 2: Adding to cart with payload:', JSON.stringify(cartPayload, null, 2));

      const cartResponse = await fetch(`${baseUrl}/v2/me/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'ManiaDeMulher-Sistema'
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
      
      // Return cart info for payment processing
      // Don't checkout immediately - wait for payment via Mercado Pago
      console.log('Cart created successfully. Shipment will be purchased after payment confirmation.');
      
      return new Response(
        JSON.stringify({
          success: true,
          cart_id: cartId,
          service_name: availableService.name,
          service_price: availableService.price,
          message: 'Etiqueta criada. Aguardando pagamento.',
          requires_payment: true
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
      
      const shipmentId = checkoutData.purchase?.id;
      
      // STEP 4: Generate label
      if (shipmentId) {
        console.log('Step 4: Generating label for shipment ID:', shipmentId);
        
        const generateResponse = await fetch(`${baseUrl}/v2/me/shipment/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'ManiaDeMulher-Sistema'
          },
          body: JSON.stringify({ orders: [shipmentId] })
        });

        if (!generateResponse.ok) {
          const errorData = await generateResponse.text();
          console.error('Label generation error:', generateResponse.status, errorData);
          // Continue even if generation fails - can be done later
        } else {
          const generateData = await generateResponse.json();
          console.log('Step 4: Label generated successfully:', generateData);
        }

        // STEP 5: Get label URL for printing
        console.log('Step 5: Getting label URL for shipment ID:', shipmentId);
        
        const printResponse = await fetch(`${baseUrl}/v2/me/shipment/${shipmentId}/print`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'ManiaDeMulher-Sistema'
          },
          body: JSON.stringify({})
        });

        let labelUrl = null;
        if (printResponse.ok) {
          const printData = await printResponse.json();
          labelUrl = printData.url;
          console.log('Step 5: Label URL obtained:', labelUrl);
        } else {
          console.error('Print URL error:', printResponse.status, await printResponse.text());
        }

        // Save shipping info to database
        await supabase
          .from('frete_envios')
          .upsert({
            pedido_id: order_id,
            cart_id: cartId,
            shipment_id: shipmentId,
            service_id: availableService.id,
            service_name: availableService.name,
            price: availableService.price,
            delivery_time: availableService.delivery_time,
            label_url: labelUrl,
            status: labelUrl ? 'ready' : 'generated',
            raw_response: {
              quote: availableService,
              cart: cartData,
              checkout: checkoutData
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Etiqueta criada com sucesso!',
            cart_id: cartId,
            shipment_id: shipmentId,
            label_url: labelUrl,
            service: {
              id: availableService.id,
              name: availableService.name,
              price: availableService.price,
              delivery_time: availableService.delivery_time
            },
            data: {
              quote: availableService,
              cart: cartData,
              checkout: checkoutData
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({ 
            error: 'ID do envio não encontrado após checkout',
            details: 'Checkout realizado mas shipment_id não retornado'
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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