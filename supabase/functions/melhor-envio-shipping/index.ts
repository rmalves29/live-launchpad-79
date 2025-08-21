import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Product {
  id: string;
  width: number;
  height: number;
  length: number;
  weight: number;
  insurance_value: number;
  quantity: number;
}

interface MelhorEnvioRequest {
  from: {
    postal_code: string;
  };
  to: {
    postal_code: string;
  };
  products: Product[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cep_origem, cep_destino, products } = await req.json();

    if (!cep_origem || !cep_destino || !products) {
      throw new Error("CEP origem, destino e produtos são obrigatórios");
    }

    // Get configuration from environment variables
    const accessToken = Deno.env.get("MELHOR_ENVIO_ACCESS_TOKEN");
    const isProduction = Deno.env.get("MELHOR_ENVIO_PRODUCTION") === "true";
    
    if (!accessToken) {
      throw new Error("Token de acesso do Melhor Envio não configurado");
    }

    const baseUrl = isProduction 
      ? "https://melhorenvio.com.br/api/v2" 
      : "https://sandbox.melhorenvio.com.br/api/v2";

    // Format products for Melhor Envio API
    const formattedProducts: Product[] = products.map((product: any, index: number) => ({
      id: product.id?.toString() || index.toString(),
      width: Number(product.width) || 10,
      height: Number(product.height) || 2,
      length: Number(product.length) || 16,
      weight: Number(product.weight) || 0.3,
      insurance_value: Number(product.price) || 10.00,
      quantity: Number(product.quantity) || 1
    }));

    const requestBody: MelhorEnvioRequest = {
      from: {
        postal_code: cep_origem.replace(/\D/g, '')
      },
      to: {
        postal_code: cep_destino.replace(/\D/g, '')
      },
      products: formattedProducts
    };

    console.log("Melhor Envio request:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${baseUrl}/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'Aplicação (email@exemplo.com.br)'
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log("Melhor Envio response status:", response.status);
    console.log("Melhor Envio response:", responseText);

    if (!response.ok) {
      throw new Error(`Erro na API do Melhor Envio: ${response.status} - ${responseText}`);
    }

    const data = JSON.parse(responseText);

    // Format response for frontend
    const formattedResponse = {
      origem: cep_origem,
      destino: cep_destino,
      produtos: formattedProducts.length,
      opcoes: data.map((opcao: any) => ({
        id: opcao.id,
        nome: opcao.name,
        empresa: opcao.company?.name || 'Melhor Envio',
        preco: parseFloat(opcao.price),
        prazo_min: opcao.delivery_range?.min || 0,
        prazo_max: opcao.delivery_range?.max || 0,
        formato: opcao.packages?.[0]?.format || 'box',
        dimensoes: opcao.packages?.[0]?.dimensions || {},
        servicos_adicionais: opcao.additional_services || {}
      })),
      melhor_envio: true
    };

    return new Response(JSON.stringify(formattedResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error calculating Melhor Envio shipping:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      melhor_envio: false,
      opcoes: []
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});