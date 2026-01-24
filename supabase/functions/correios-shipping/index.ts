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

// Cache do token OAuth por tenant
const tokenCacheMap: Map<string, { token: string; expiresAt: Date }> = new Map();

interface CorreiosCredentials {
  clientId: string;
  clientSecret: string;
  cartaoPostagem: string;
  contrato?: string;
}

async function getCorreiosToken(credentials: CorreiosCredentials, tenantId: string): Promise<string> {
  // Verificar se token em cache ainda é válido (com margem de 5 min)
  const cached = tokenCacheMap.get(tenantId);
  if (cached && new Date(cached.expiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    console.log("[correios] Using cached token for tenant:", tenantId);
    return cached.token;
  }

  const { clientId, clientSecret, cartaoPostagem } = credentials;

  console.log("[correios] Credentials check for tenant:", tenantId, {
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    hasCartao: !!cartaoPostagem,
  });

  if (!clientId || !clientSecret) {
    throw new Error("Credenciais dos Correios não configuradas. Preencha Client ID e Client Secret na integração.");
  }

  if (!cartaoPostagem) {
    throw new Error("Cartão de Postagem não configurado. Preencha o campo na integração.");
  }

  console.log("[correios] Fetching new OAuth token...");

  // Autenticação OAuth2 dos Correios CWS
  const authUrl = "https://api.correios.com.br/token/v1/autentica/cartaopostagem";
  
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  
  const authBody = {
    numero: cartaoPostagem,
  };

  console.log("[correios] Auth request to:", authUrl);

  const authResponse = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: JSON.stringify(authBody),
  });

  const responseText = await authResponse.text();
  console.log("[correios] Auth response status:", authResponse.status);
  console.log("[correios] Auth response:", responseText.substring(0, 500));

  if (!authResponse.ok) {
    let errorMessage = `Falha na autenticação Correios (${authResponse.status})`;
    try {
      const errorData = JSON.parse(responseText);
      errorMessage = errorData.msgs?.[0]?.texto || errorData.message || errorMessage;
    } catch {
      // Manter mensagem genérica
    }
    throw new Error(errorMessage);
  }

  const tokenData = JSON.parse(responseText);
  
  if (!tokenData.token) {
    throw new Error("Token não retornado pela API dos Correios");
  }
  
  // Cachear o token (expira em ~1 hora)
  const expiresAt = tokenData.expiraEm ? new Date(tokenData.expiraEm) : new Date(Date.now() + 55 * 60 * 1000);
  tokenCacheMap.set(tenantId, {
    token: tokenData.token,
    expiresAt,
  });

  console.log("[correios] Token obtained successfully, expires at:", expiresAt.toISOString());
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

  // Peso mínimo 0.3kg para PAC/SEDEX, 0.01kg para Mini Envios
  const isMiniEnvios = codigoServico === CORREIOS_SERVICES.MINI_ENVIOS;
  pesoTotal = Math.max(pesoTotal, isMiniEnvios ? 0.01 : 0.3);

  const url = `https://api.correios.com.br/preco/v1/nacional/${codigoServico}`;
  
  // Dimensões diferentes para Mini Envios (máx 24x16x4cm, máx 300g)
  const comprimento = isMiniEnvios ? "16" : "20";
  const largura = isMiniEnvios ? "11" : "16";
  const altura = isMiniEnvios ? "3" : "10";
  const pesoEnvio = isMiniEnvios ? Math.min(Math.round(pesoTotal * 1000), 300) : Math.round(pesoTotal * 1000);
  
  const params = new URLSearchParams({
    cepOrigem: cepOrigem.replace(/\D/g, ''),
    cepDestino: cepDestino.replace(/\D/g, ''),
    psObjeto: String(pesoEnvio),
    tpObjeto: "2", // Pacote
    comprimento,
    largura,
    altura,
  });

  // Valor declarado é opcional - tentar adicionar apenas se não causar erro
  // Alguns contratos não suportam serviços adicionais de valor declarado

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

    if (!integration) {
      return new Response(
        JSON.stringify({ success: false, error: "Integração Correios não configurada ou inativa" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Usar CEP de origem da integração
    const cepOrigem = integration.from_cep;
    
    if (!cepOrigem) {
      return new Response(
        JSON.stringify({ success: false, error: "CEP de origem não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar credenciais da integração (armazenadas nos campos reutilizados)
    // client_id e client_secret estão nos campos nativos
    // contrato está em scope, cartao_postagem está em refresh_token
    const credentials: CorreiosCredentials = {
      clientId: integration.client_id || "",
      clientSecret: integration.client_secret || "",
      cartaoPostagem: integration.refresh_token || "", // Cartão de postagem
      contrato: integration.scope || "", // Contrato (opcional)
    };

    // Obter token OAuth dos Correios
    const token = await getCorreiosToken(credentials, tenant_id);

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
