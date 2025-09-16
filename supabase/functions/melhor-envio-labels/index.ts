import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-key',
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

    // Get tenant information
    let tenantData = null;
    if (tenantKey) {
      const { data } = await supabase
        .from('tenants')
        .select('*')
        .eq('tenant_key', tenantKey)
        .eq('is_active', true)
        .single();
      tenantData = data;
    } else if (tenant_id) {
      const { data } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenant_id)
        .eq('is_active', true)
        .single();
      tenantData = data;
    }

    if (!tenantData) {
      return new Response(
        JSON.stringify({ error: 'Tenant não encontrado ou inativo' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get Melhor Envio integration config for tenant
    const { data: meIntegration, error: meError } = await supabase
      .from('integration_me')
      .select('*')
      .eq('tenant_id', tenantData.id)
      .eq('is_active', true)
      .single();

    if (meError || !meIntegration) {
      return new Response(
        JSON.stringify({ error: 'Integração Melhor Envio não configurada para este tenant' }),
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

    const baseUrl = meIntegration.env === 'sandbox' 
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

      // Prepare sender data from tenant integration config
      const fromEntity = {
        name: meIntegration.from_name || "Remetente",
        phone: onlyDigits(meIntegration.from_phone || '1199999999'),
        email: meIntegration.from_email || "contato@empresa.com",
        document: null as string | null,
        company_document: null as string | null,
        address: meIntegration.from_address || "Rua do Remetente",
        complement: meIntegration.from_complement || "",
        number: meIntegration.from_number || "123",
        district: meIntegration.from_district || "Centro",
        city: meIntegration.from_city || "Belo Horizonte",
        state_abbr: meIntegration.from_state || "MG",
        postal_code: onlyDigits(meIntegration.from_cep || '31575060')
      };

      // Validate and set sender document
      const senderDoc = onlyDigits(meIntegration.from_document || '');
      if (senderDoc.length === 14 && isValidCNPJ(senderDoc)) {
        fromEntity.company_document = senderDoc;
        delete fromEntity.document;
      } else if (senderDoc.length === 11 && isValidCPF(senderDoc)) {
        fromEntity.document = senderDoc;
        delete fromEntity.company_document;
      } else {
        return new Response(
          JSON.stringify({
            error: 'Documento do remetente inválido',
            details: 'Configure um CPF (11 dígitos) ou CNPJ (14 dígitos) válido nas configurações do Melhor Envio'
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Prepare recipient data from order
      const recipientCep = onlyDigits(orderData.customer_cep || '01000000');
      
      if (recipientCep.length !== 8) {
        console.error(`Invalid recipient CEP: ${recipientCep} (length: ${recipientCep.length})`);
        return new Response(
          JSON.stringify({
            error: 'CEP de destino inválido',
            details: `CEP deve ter 8 dígitos. Encontrado: ${recipientCep}. Verifique o endereço do cliente.`
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const toEntity = {
        name: orderData.customer_name || "Cliente",
        phone: onlyDigits(orderData.customer_phone || ''),
        email: `${onlyDigits(orderData.customer_phone || '')}@checkout.com`,
        document: "00000000000", // Default CPF for cases where document is not required
        address: orderData.customer_street || "Rua do Cliente",
        complement: orderData.customer_complement || "",
        number: orderData.customer_number || "100",
        district: orderData.customer_neighborhood || "Centro",
        city: orderData.customer_city || "São Paulo",
        state_abbr: orderData.customer_state || "SP",
        postal_code: recipientCep
      };

      // Prepare packages according to Melhor Envio format
      const packages = [
        {
          weight: Math.max((appSettings?.default_weight_kg || 0.3) * 1000, 100), // Convert to grams, min 100g
          width: appSettings?.default_width_cm || 16,
          height: appSettings?.default_height_cm || 2,
          length: appSettings?.default_length_cm || 20,
          insurance_value: orderData.total_amount || 10.00,
          quantity: 1
        }
      ];

      // Create the shipment payload according to Melhor Envio API
      const shipmentPayload = {
        from: fromEntity,
        to: toEntity,
        packages: packages,
        service: 1, // Default to PAC (service ID 1)
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

      console.log('Creating shipment with payload:', JSON.stringify(shipmentPayload, null, 2));

      // Create shipment in Melhor Envio
      const shipmentResponse = await fetch(`${baseUrl}/v2/me/shipment/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'Sistema-Multitenant'
        },
        body: JSON.stringify({
          from: { postal_code: fromEntity.postal_code },
          to: { postal_code: toEntity.postal_code },
          package: {
            height: packages[0].height,
            width: packages[0].width,
            length: packages[0].length,
            weight: packages[0].weight / 1000 // Convert back to kg for calculation
          }
        })
      });

      if (!shipmentResponse.ok) {
        const errorData = await shipmentResponse.text();
        console.error('Shipment calculation error:', shipmentResponse.status, errorData);
        
        // Log error to frete_envios table
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
          { status: shipmentResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const calculationData = await shipmentResponse.json();
      console.log('Calculation response:', JSON.stringify(calculationData, null, 2));

      // Find available service
      const availableService = calculationData.find((service: any) => !service.error && service.id);
      
      if (!availableService) {
        const errorDetails = calculationData.map((s: any) => s.error).filter(Boolean).join('; ');
        
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

      // Now create the actual shipment with the selected service
      const finalShipmentPayload = {
        ...shipmentPayload,
        service: availableService.id
      };

      console.log('Creating actual shipment with payload:', JSON.stringify(finalShipmentPayload, null, 2));

      const createShipmentResponse = await fetch(`${baseUrl}/v2/me/shipment/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'Sistema-Multitenant'
        },
        body: JSON.stringify(finalShipmentPayload)
      });

      if (!createShipmentResponse.ok) {
        const errorData = await createShipmentResponse.text();
        console.error('Shipment creation error:', createShipmentResponse.status, errorData);
        
        await supabase
          .from('frete_envios')
          .insert({
            pedido_id: order_id,
            status: 'error',
            raw_response: { 
              error: JSON.stringify({
                error: 'Erro ao criar envio',
                details: errorData 
              })
            }
          });

        return new Response(
          JSON.stringify({ 
            error: 'Erro ao criar envio',
            details: errorData 
          }),
          { status: createShipmentResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const shipmentData = await createShipmentResponse.json();
      console.log('Shipment created:', JSON.stringify(shipmentData, null, 2));

      // Save successful shipment to database
      const { error: insertError } = await supabase
        .from('frete_envios')
        .insert({
          pedido_id: order_id,
          shipment_id: shipmentData.id || null,
          status: 'created',
          service_price: availableService.price,
          raw_response: { success: shipmentData }
        });

      if (insertError) {
        console.error('Error saving shipment to database:', insertError);
      }

      return new Response(JSON.stringify({
        success: true,
        shipment: shipmentData,
        service: availableService
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle other actions (like getting labels, tracking, etc.)
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