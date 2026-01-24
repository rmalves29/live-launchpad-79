import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Códigos dos serviços dos Correios
const CORREIOS_SERVICES = {
  PAC: "04510",
  SEDEX: "04014",
  MINI_ENVIOS: "04227",
  // Com contrato
  PAC_CONTRATO: "04669",
  SEDEX_CONTRATO: "04162",
  SEDEX_10: "04804",
  SEDEX_12: "04782",
  SEDEX_HOJE: "04804",
};

interface CorreiosToken {
  token: string;
  expiraEm: string;
}

// Cache do token OAuth
let tokenCache: { token: string; expiresAt: Date } | null = null;

async function getCorreiosToken(): Promise<string> {
  // Verificar se token em cache ainda é válido (com margem de 5 min)
  if (tokenCache && new Date(tokenCache.expiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    console.log("[correios] Using cached token");
    return tokenCache.token;
  }

  const clientId = Deno.env.get("CORREIOS_CLIENT_ID");
  const clientSecret = Deno.env.get("CORREIOS_CLIENT_SECRET");
  const contrato = Deno.env.get("CORREIOS_CONTRATO");
  const cartaoPostagem = Deno.env.get("CORREIOS_CARTAO_POSTAGEM");

  if (!clientId || !clientSecret) {
    throw new Error("Credenciais dos Correios não configuradas (CORREIOS_CLIENT_ID, CORREIOS_CLIENT_SECRET)");
  }

  console.log("[correios] Fetching new OAuth token...");

  // Autenticação OAuth2 dos Correios CWS
  const authUrl = "https://api.correios.com.br/token/v1/autentica/cartaopostagem";
  
  const authBody = {
    numero: cartaoPostagem || contrato,
  };

  const authResponse = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: JSON.stringify(authBody),
  });

  if (!authResponse.ok) {
    const errorText = await authResponse.text();
    console.error("[correios] Auth error:", authResponse.status, errorText);
    throw new Error(`Falha na autenticação Correios: ${authResponse.status} - ${errorText}`);
  }

  const tokenData: CorreiosToken = await authResponse.json();
  
  // Cachear o token
  tokenCache = {
    token: tokenData.token,
    expiresAt: new Date(tokenData.expiraEm),
  };

  console.log("[correios] Token obtained, expires at:", tokenData.expiraEm);
  return tokenData.token;
}

interface CorreiosPrecoRequest {
  cepOrigem: string;
  cepDestino: string;
  psObjeto: string; // peso em gramas
  tpObjeto: number; // 1=Envelope, 2=Pacote, 3=Rolo
  comprimento: number;
  largura: number;
  altura: number;
  vlDeclarado?: number;
}

async function calcularPreco(
  token: string,
  cepOrigem: string,
  cepDestino: string,
  produtos: any[],
  codigoServico: string
): Promise<any> {
  // Calcular dimensões e peso total
  let pesoTotal = 0;
  let valorTotal = 0;

  for (const p of produtos) {
    const peso = (p.weight || 0.3) * (p.quantity || 1);
    const valor = (p.insurance_value || 50) * (p.quantity || 1);
    pesoTotal += peso;
    valorTotal += valor;
  }

  // Peso mínimo 0.3kg
  pesoTotal = Math.max(pesoTotal, 0.3);

  const url = `https://api.correios.com.br/preco/v1/nacional/${codigoServico}`;
  
  const params = new URLSearchParams({
    cepOrigem: cepOrigem.replace(/\D/g, ''),
    cepDestino: cepDestino.replace(/\D/g, ''),
    psObjeto: String(Math.round(pesoTotal * 1000)), // converter para gramas
    tpObjeto: "2", // Pacote
    comprimento: "20",
    largura: "16",
    altura: "10",
    vlDeclarado: String(Math.max(valorTotal, 50)), // Mínimo R$50 para valor declarado
  });

  console.log("[correios] Calculating price for service:", codigoServico, params.toString());

  const response = await fetch(`${url}?${params}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[correios] Price error for", codigoServico, ":", response.status, errorText);
    return null;
  }

  return await response.json();
}

async function calcularPrazo(
  token: string,
  cepOrigem: string,
  cepDestino: string,
  codigoServico: string
): Promise<any> {
  const url = `https://api.correios.com.br/prazo/v1/nacional/${codigoServico}`;
  
  const params = new URLSearchParams({
    cepOrigem: cepOrigem.replace(/\D/g, ''),
    cepDestino: cepDestino.replace(/\D/g, ''),
  });

  console.log("[correios] Calculating deadline for service:", codigoServico);

  const response = await fetch(`${url}?${params}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[correios] Deadline error for", codigoServico, ":", response.status, errorText);
    return null;
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, to_postal_code, products } = await req.json();

    console.log("[correios-shipping] Request received:", {
      tenant_id,
      to_postal_code,
      products_count: products?.length,
    });

    if (!to_postal_code) {
      return new Response(
        JSON.stringify({ success: false, error: "CEP de destino é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar configuração do tenant
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar integração Correios do tenant
    const { data: integration, error: integrationError } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "correios")
      .eq("is_active", true)
      .maybeSingle();

    // Usar CEP de origem da integração ou do env
    const cepOrigem = integration?.from_cep || Deno.env.get("CORREIOS_ORIGIN_CEP") || "";
    
    if (!cepOrigem) {
      return new Response(
        JSON.stringify({ success: false, error: "CEP de origem não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Obter token OAuth dos Correios
    const token = await getCorreiosToken();

    // Preparar lista de produtos
    const productsList = (products || []).map((p: any) => ({
      weight: p.weight || 0.3,
      insurance_value: Number(p.insurance_value) || 50,
      quantity: Number(p.quantity) || 1,
    }));

    if (productsList.length === 0) {
      productsList.push({
        weight: 0.3,
        insurance_value: 50,
        quantity: 1,
      });
    }

    // Calcular frete para cada serviço
    const servicesToCheck = [
      { code: CORREIOS_SERVICES.PAC_CONTRATO, name: "PAC", company: "Correios" },
      { code: CORREIOS_SERVICES.SEDEX_CONTRATO, name: "SEDEX", company: "Correios" },
      { code: CORREIOS_SERVICES.MINI_ENVIOS, name: "Mini Envios", company: "Correios" },
    ];

    const shippingOptions: any[] = [];

    // Fazer requisições em paralelo
    const results = await Promise.allSettled(
      servicesToCheck.map(async (service) => {
        const [precoResult, prazoResult] = await Promise.all([
          calcularPreco(token, cepOrigem, to_postal_code, productsList, service.code),
          calcularPrazo(token, cepOrigem, to_postal_code, service.code),
        ]);

        if (precoResult && prazoResult) {
          return {
            id: `correios_${service.code}`,
            service_id: service.code,
            name: service.name,
            service_name: service.name,
            company: { name: service.company, picture: "" },
            price: precoResult.pcFinal || precoResult.pcBase || "0",
            custom_price: precoResult.pcFinal || precoResult.pcBase || "0",
            delivery_time: `${prazoResult.prazoEntrega || "?"} dias úteis`,
            custom_delivery_time: prazoResult.prazoEntrega || 0,
          };
        }
        return null;
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        shippingOptions.push(result.value);
      }
    }

    console.log("[correios-shipping] Options found:", shippingOptions.length);

    return new Response(
      JSON.stringify({
        success: true,
        shipping_options: shippingOptions,
        provider: "correios",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[correios-shipping] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
