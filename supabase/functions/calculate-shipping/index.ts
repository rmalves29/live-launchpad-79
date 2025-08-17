import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const onlyDigits = (s: string) => String(s || "").replace(/\D/g, "");
const toCorreiosPeso = (kg: number) => String(Number(kg).toFixed(3)).replace(".", ",");

// Parse XML response
function parseXML(xmlText: string) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  
  const servicos = xmlDoc.getElementsByTagName("cServico");
  const results = [];
  
  for (let i = 0; i < servicos.length; i++) {
    const servico = servicos[i];
    const codigo = servico.getElementsByTagName("Codigo")[0]?.textContent || "";
    const erro = servico.getElementsByTagName("Erro")[0]?.textContent;
    const msgErro = servico.getElementsByTagName("MsgErro")[0]?.textContent;
    const valor = servico.getElementsByTagName("Valor")[0]?.textContent;
    const prazo = servico.getElementsByTagName("PrazoEntrega")[0]?.textContent;
    
    const serviceName = codigo === "04510" ? "PAC" : codigo === "04014" ? "SEDEX" : codigo;
    const price = valor ? Number(String(valor).replace(".", "").replace(",", ".")) : 0;
    const deliveryTime = prazo ? Number(prazo) : 0;
    const hasError = erro && erro !== "0";
    
    results.push({
      service: serviceName,
      codigo,
      price,
      delivery_time: deliveryTime,
      error: hasError ? msgErro || erro : null
    });
  }
  
  return results;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cep } = await req.json();

    if (!cep) {
      throw new Error("CEP é obrigatório");
    }

    const cepDestino = onlyDigits(cep);
    if (cepDestino.length !== 8) {
      throw new Error("CEP inválido. Use 8 dígitos.");
    }

    // Get configuration from environment variables
    const originCep = Deno.env.get("CORREIOS_ORIGIN_CEP") || "31575060";
    const COD_PAC = Deno.env.get("CORREIOS_SERVICE_PAC") || "04510";
    const COD_SEDEX = Deno.env.get("CORREIOS_SERVICE_SEDEX") || "04014";
    
    // Fixed dimensions and weight as requested
    const PESO_KG = 0.01; // 10 gramas
    const DIM = { comprimento: 10, largura: 10, altura: 10, diametro: 0 };

    if (!/^\d{8}$/.test(onlyDigits(originCep))) {
      throw new Error("CEP de origem não configurado.");
    }

    const params = new URLSearchParams({
      nCdEmpresa: "",          // vazio = sem contrato
      sDsSenha: "",            // vazio = sem contrato
      nCdServico: `${COD_PAC},${COD_SEDEX}`,
      sCepOrigem: onlyDigits(originCep),
      sCepDestino: cepDestino,
      nVlPeso: toCorreiosPeso(PESO_KG),
      nCdFormato: "1",         // 1 = caixa/pacote
      nVlComprimento: DIM.comprimento.toString(),
      nVlAltura: DIM.altura.toString(),
      nVlLargura: DIM.largura.toString(),
      nVlDiametro: DIM.diametro.toString(),
      sCdMaoPropria: "N",
      nVlValorDeclarado: "0",
      sCdAvisoRecebimento: "N",
      StrRetorno: "xml",
    });

    console.log("Correios request params:", params.toString());

    const response = await fetch(`http://ws.correios.com.br/calculador/CalcPrecoPrazo.asmx/CalcPrecoPrazo?${params.toString()}`, {
      method: 'GET',
      timeout: 15000
    });

    if (!response.ok) {
      throw new Error(`Erro na API dos Correios: ${response.status}`);
    }

    const xmlText = await response.text();
    console.log("Correios XML response:", xmlText);

    const results = parseXML(xmlText);
    
    // Filter successful results and errors
    const sucessos = results.filter(r => !r.error);
    const erros = results.filter(r => r.error);

    const responseData = {
      origem: originCep,
      destino: cepDestino,
      pesoKg: PESO_KG,
      dimensoesCm: DIM,
      resultados: sucessos,
      erros: erros.length ? erros : undefined,
    };

    console.log("Shipping calculation result:", responseData);

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error calculating shipping:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      resultados: [],
      erros: [{ error: error.message }]
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});