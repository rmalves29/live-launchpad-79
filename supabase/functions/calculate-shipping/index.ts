import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cep, serviceType, cartItems } = await req.json();

    if (!cep || !serviceType) {
      throw new Error("CEP e tipo de serviço são obrigatórios");
    }

    const CORREIOS_COMPANY_CODE = Deno.env.get("CORREIOS_COMPANY_CODE");
    const CORREIOS_PASSWORD = Deno.env.get("CORREIOS_PASSWORD");

    if (!CORREIOS_COMPANY_CODE || !CORREIOS_PASSWORD) {
      throw new Error("Credenciais dos Correios não configuradas");
    }

    // Calculate package dimensions and weight from cart items
    let totalWeight = 0;
    let totalVolume = 0;

    cartItems.forEach((item: any) => {
      // Default dimensions if not specified in product
      const weight = item.weight || 0.3; // 300g default
      const volume = item.volume || (20 * 15 * 5); // 20x15x5 cm default
      
      totalWeight += weight * item.qty;
      totalVolume += volume * item.qty;
    });

    // Calculate package dimensions from total volume (assuming cubic root)
    const dimension = Math.ceil(Math.cbrt(totalVolume));
    const length = Math.max(dimension, 16); // Min 16cm
    const width = Math.max(dimension, 11); // Min 11cm
    const height = Math.max(dimension, 2); // Min 2cm

    // Ensure weight is at least 300g
    totalWeight = Math.max(totalWeight, 0.3);

    const params = new URLSearchParams({
      'usuario': CORREIOS_COMPANY_CODE,
      'senha': CORREIOS_PASSWORD,
      'servico': serviceType,
      'ceporigem': '31575060', // Origin CEP from config
      'cepdestino': cep.replace(/\D/g, ''),
      'peso': totalWeight.toString(),
      'formato': '1', // Box format
      'comprimento': length.toString(),
      'altura': height.toString(),
      'largura': width.toString(),
      'diametro': '0',
      'maopropria': 'N',
      'valorDeclarado': '0',
      'avisoRecebimento': 'N'
    });

    console.log("Correios request params:", params.toString());

    const response = await fetch(`http://ws.correios.com.br/calculador/CalcPrecoPrazo.asmx/CalcPrecoPrazo?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
      throw new Error(`Erro na API dos Correios: ${response.status}`);
    }

    const xmlText = await response.text();
    console.log("Correios XML response:", xmlText);

    // Parse XML response
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    const servicos = xmlDoc.getElementsByTagName("cServico");
    
    if (servicos.length === 0) {
      throw new Error("Nenhum serviço encontrado na resposta dos Correios");
    }

    const servico = servicos[0];
    const erro = servico.getElementsByTagName("Erro")[0]?.textContent;
    
    if (erro && erro !== "0") {
      const msgErro = servico.getElementsByTagName("MsgErro")[0]?.textContent;
      throw new Error(`Erro dos Correios: ${msgErro || erro}`);
    }

    const valor = servico.getElementsByTagName("Valor")[0]?.textContent?.replace(",", ".");
    const prazo = servico.getElementsByTagName("PrazoEntrega")[0]?.textContent;

    const shippingQuote = {
      service: serviceType === "3298" ? "PAC" : "SEDEX",
      price: valor ? parseFloat(valor) : 0,
      delivery_time: prazo ? parseInt(prazo) : 0,
      error: null
    };

    console.log("Shipping quote result:", shippingQuote);

    return new Response(JSON.stringify(shippingQuote), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error calculating shipping:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      service: "",
      price: 0,
      delivery_time: 0
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});