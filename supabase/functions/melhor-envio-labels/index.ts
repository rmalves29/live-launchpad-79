import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-key',
};

// Utils: sanitização e validação
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract tenant key from URL or headers
    const url = new URL(req.url);
    const tenantKey = url.searchParams.get('tenant_key') || req.headers.get('x-tenant-key');
    
    const { action, order_id, tenant_id } = await req.json();
    
    console.log('Labels action:', action, 'order_id:', order_id, 'tenant_id:', tenant_id);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get tenant information and ME integration
    let tenantData = null;
    let meIntegration = null;
    
    if (tenant_id) {
      // First get tenant data
      const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenant_id)
        .eq('is_active', true)
        .single();
      
      if (!tenant) {
        return new Response(
          JSON.stringify({ error: 'Tenant não encontrado ou inativo' }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Then get ME integration for this tenant
      const { data: integration } = await supabase
        .from('integration_me')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)
        .single();
      
      if (integration) {
        tenantData = tenant;
        meIntegration = integration;
        console.log('Found ME integration for tenant:', tenant_id, 'integration ID:', integration.id);
      } else {
        console.log('No active ME integration found for tenant:', tenant_id);
      }
    }

    if (!tenantData || !meIntegration) {
      return new Response(
        JSON.stringify({ error: 'Tenant ou integração Melhor Envio não encontrada' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!meIntegration.access_token) {
      return new Response(
        JSON.stringify({ error: 'Token de acesso Melhor Envio não configurado' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const baseUrl = meIntegration.environment === 'sandbox' 
      ? 'https://sandbox.melhorenvio.com.br/api' 
      : 'https://melhorenvio.com.br/api';
    const accessToken = meIntegration.access_token;

    if (action === 'create_shipment') {
      if (!order_id) {
        return new Response(
          JSON.stringify({ error: 'order_id é obrigatório' }),
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
        .eq('tenant_id', tenantData.id)
        .single();

      if (orderError || !orderData) {
        console.error('Order not found:', orderError);
        return new Response(
          JSON.stringify({ error: 'Pedido não encontrado' }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Get app settings for default dimensions and weight
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      // Validate required order data
      if (!orderData.customer_name || !orderData.customer_cep || !orderData.customer_street || !orderData.customer_city) {
        console.error('Order missing required address data:', orderData);
        return new Response(
          JSON.stringify({ 
            error: 'Dados de endereço do cliente incompletos',
            details: 'Nome, CEP, rua e cidade são obrigatórios'
          }),
          { 
            status: 422, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Prepare sender data (from integration config)
      const fromEntity = {
        name: meIntegration.from_name || "Mania de Mulher",
        phone: onlyDigits(meIntegration.from_phone || '31999999999'),
        email: meIntegration.from_email || "contato@maniadmulher.com",
        document: null as string | null,
        company_document: null as string | null,
        address: meIntegration.from_address || "Rua das Flores",
        complement: meIntegration.from_complement || "Sala 101",
        number: meIntegration.from_number || "123",
        district: meIntegration.from_district || "Centro",
        city: meIntegration.from_city || "Belo Horizonte",
        state_abbr: meIntegration.from_state || "MG",
        postal_code: onlyDigits(meIntegration.from_cep || '30110000')
      };

      // Set sender document (CPF or CNPJ)
      const senderDoc = onlyDigits(meIntegration.from_document || '12345678000199');
      if (senderDoc.length === 14 && isValidCNPJ(senderDoc)) {
        fromEntity.company_document = senderDoc;
      } else if (senderDoc.length === 11 && isValidCPF(senderDoc)) {
        fromEntity.document = senderDoc;
      } else {
        return new Response(
          JSON.stringify({
            error: 'Documento do remetente inválido',
            details: 'Configure um CPF (11 dígitos) ou CNPJ (14 dígitos) válido'
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Prepare recipient data (from order)
      const recipientCep = onlyDigits(orderData.customer_cep);
      
      if (recipientCep.length !== 8) {
        console.error(`Invalid recipient CEP: ${recipientCep}`);
        return new Response(
          JSON.stringify({
            error: 'CEP de destino inválido',
            details: `CEP deve ter 8 dígitos. CEP informado: ${recipientCep}`
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const toEntity = {
        name: orderData.customer_name,
        phone: onlyDigits(orderData.customer_phone),
        email: `${onlyDigits(orderData.customer_phone)}@checkout.com`,
        document: "00000000000", // CPF padrão quando não obrigatório
        address: orderData.customer_street,
        complement: orderData.customer_complement || "Casa",
        number: orderData.customer_number || "S/N",
        district: orderData.customer_neighborhood || "Centro",
        city: orderData.customer_city,
        state_abbr: orderData.customer_state || "MG",
        postal_code: recipientCep
      };

      // Prepare packages (exact format from user example)
      const packages = [
        {
          weight: Math.max((appSettings?.default_weight_kg || 0.3) * 1000, 100), // Convert to grams
          width: appSettings?.default_width_cm || 20,
          height: appSettings?.default_height_cm || 10,
          length: appSettings?.default_length_cm || 30,
          insurance_value: orderData.total_amount || 200.00,
          quantity: 1
        }
      ];

      // STEP 1: Quote services first to find available service
      const quotePayload = {
        from: { postal_code: fromEntity.postal_code },
        to: { postal_code: toEntity.postal_code },
        package: {
          height: packages[0].height,
          width: packages[0].width,
          length: packages[0].length,
          weight: packages[0].weight / 1000 // Convert to kg for quote
        },
        options: {
          insurance_value: packages[0].insurance_value,
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
          'User-Agent': 'Sistema-Multitenant'
        },
        body: JSON.stringify(quotePayload)
      });

      if (!quoteResponse.ok) {
        const errorData = await quoteResponse.text();
        console.error('Quote error:', quoteResponse.status, errorData);
        
        await supabase
          .from('frete_envios')
          .insert({
            pedido_id: order_id,
            status: 'error',
            raw_response: { 
              error: JSON.stringify({
                error: 'Erro na cotação de frete',
                details: errorData 
              })
            }
          });

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

      // Find available service (prefer SEDEX id=2, then PAC id=1, then any available)
      let availableService = quoteData.find((service: any) => !service.error && service.id === 2); // SEDEX
      if (!availableService) {
        availableService = quoteData.find((service: any) => !service.error && service.id === 1); // PAC
      }
      if (!availableService) {
        availableService = quoteData.find((service: any) => !service.error && service.id); // Any available
      }
      
      if (!availableService) {
        const errorDetails = quoteData.map((s: any) => s.error).filter(Boolean).join('; ');
        
        await supabase
          .from('frete_envios')
          .insert({
            pedido_id: order_id,
            status: 'error',
            raw_response: { 
              error: JSON.stringify({
                error: 'Nenhum serviço disponível',
                details: errorDetails || 'Todas as opções retornaram erro'
              })
            }
          });

        return new Response(
          JSON.stringify({ 
            error: 'Nenhum serviço de frete disponível',
            details: errorDetails || 'Todas as opções retornaram erro na cotação'
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Selected service:', availableService.id, availableService.name);

      // STEP 2: Create shipment using the exact payload format from user example
      const shipmentPayload = {
        from: fromEntity,
        to: toEntity,
        packages: packages,
        service: availableService.id,
        agency: null,
        options: {
          receipt: false,
          own_hand: false,
          reverse: false,
          non_commercial: false
        },
        payment: {
          method: "wallet"
        }
      };

      console.log('Step 2: Creating shipment with payload:', JSON.stringify(shipmentPayload, null, 2));

      const shipmentResponse = await fetch(`${baseUrl}/v2/me/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'Sistema-Multitenant'
        },
        body: JSON.stringify(shipmentPayload)
      });

      if (!shipmentResponse.ok) {
        const errorData = await shipmentResponse.text();
        console.error('Shipment creation error:', shipmentResponse.status, errorData);
        
        await supabase
          .from('frete_envios')
          .insert({
            pedido_id: order_id,
            status: 'error',
            raw_response: { 
              error: JSON.stringify({
                error: 'Erro ao adicionar ao carrinho',
                details: errorData 
              })
            }
          });

        return new Response(
          JSON.stringify({ 
            error: 'Erro ao adicionar ao carrinho',
            details: errorData 
          }),
          { status: shipmentResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const shipmentData = await shipmentResponse.json();
      console.log('Shipment created:', JSON.stringify(shipmentData, null, 2));

      // STEP 3: Checkout (compra da etiqueta)
      if (shipmentData.id) {
        console.log('Step 3: Checkout shipment ID:', shipmentData.id);
        
        const checkoutResponse = await fetch(`${baseUrl}/v2/me/shipment/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'Sistema-Multitenant'
          },
          body: JSON.stringify({
            orders: [shipmentData.id]
          })
        });

        if (!checkoutResponse.ok) {
          const checkoutError = await checkoutResponse.text();
          console.error('Checkout error:', checkoutResponse.status, checkoutError);
          
          // Save shipment created but checkout failed
          await supabase
            .from('frete_envios')
            .insert({
              pedido_id: order_id,
              shipment_id: shipmentData.id,
              status: 'created_checkout_failed',
              service_price: availableService.price,
              raw_response: { success: shipmentData, checkout_error: checkoutError }
            });

          return new Response(JSON.stringify({
            success: true,
            shipment: shipmentData,
            service: availableService,
            warning: 'Envio criado mas falhou no checkout: ' + checkoutError
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const checkoutData = await checkoutResponse.json();
        console.log('Checkout response:', JSON.stringify(checkoutData, null, 2));

        // STEP 4: Generate label (só funciona após checkout)
        const generateResponse = await fetch(`${baseUrl}/v2/me/shipment/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'Sistema-Multitenant'
          },
          body: JSON.stringify({
            orders: [shipmentData.id]
          })
        });

        if (!generateResponse.ok) {
          const generateError = await generateResponse.text();
          console.error('Generate error:', generateResponse.status, generateError);
          
          // Save checkout successful but generate failed
          await supabase
            .from('frete_envios')
            .insert({
              pedido_id: order_id,
              shipment_id: shipmentData.id,
              status: 'checkout_success_generate_failed',
              service_price: availableService.price,
              raw_response: { 
                success: shipmentData, 
                checkout: checkoutData, 
                generate_error: generateError 
              }
            });

          return new Response(JSON.stringify({
            success: true,
            shipment: shipmentData,
            checkout: checkoutData,
            service: availableService,
            warning: 'Checkout realizado mas falhou ao gerar etiqueta: ' + generateError
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const generateData = await generateResponse.json();
        console.log('Generate response:', JSON.stringify(generateData, null, 2));

        // STEP 5: Get print URL for label
        const printResponse = await fetch(`${baseUrl}/v2/me/shipment/print`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'Sistema-Multitenant'
          },
          body: JSON.stringify({
            orders: [shipmentData.id]
          })
        });

        let printData = null;
        if (printResponse.ok) {
          printData = await printResponse.json();
          console.log('Print response:', JSON.stringify(printData, null, 2));
        } else {
          const printError = await printResponse.text();
          console.error('Print error:', printResponse.status, printError);
        }
        
        // Save complete successful flow
        await supabase
          .from('frete_envios')
          .insert({
            pedido_id: order_id,
            shipment_id: shipmentData.id,
            status: 'completed',
            service_price: availableService.price,
            label_url: printData?.url || null,
            tracking_code: shipmentData.tracking || null,
            raw_response: { 
              success: shipmentData, 
              checkout: checkoutData,
              generate: generateData,
              print: printData
            }
          });

        return new Response(JSON.stringify({
          success: true,
          shipment: shipmentData,
          checkout: checkoutData,
          generate: generateData,
          print: printData,
          service: availableService
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Save successful shipment creation
      await supabase
        .from('frete_envios')
        .insert({
          pedido_id: order_id,
          shipment_id: shipmentData.id || null,
          status: 'created',
          service_price: availableService.price,
          raw_response: { success: shipmentData }
        });

      return new Response(JSON.stringify({
        success: true,
        shipment: shipmentData,
        service: availableService
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle other actions
    return new Response(JSON.stringify({ error: 'Ação não implementada' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Labels error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});