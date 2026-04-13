import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CORREIOS_SERVICES = {
  PAC_CONTRATO: "04669",
  SEDEX_CONTRATO: "04162",
  MINI_ENVIOS: "04227",
};

const tokenCacheMap: Map<string, { token: string; expiresAt: Date }> = new Map();

interface CorreiosCredentials {
  clientId: string;
  clientSecret: string;
  cartaoPostagem: string;
}

async function getCorreiosToken(credentials: CorreiosCredentials, tenantId: string): Promise<string> {
  const cached = tokenCacheMap.get(tenantId);
  if (cached && new Date(cached.expiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    return cached.token;
  }

  const { clientId, clientSecret, cartaoPostagem } = credentials;
  if (!clientId || !clientSecret) throw new Error("Credenciais dos Correios não configuradas.");
  if (!cartaoPostagem) throw new Error("Cartão de Postagem não configurado.");

  const authUrl = "https://api.correios.com.br/token/v1/autentica/cartaopostagem";
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const authResponse = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Basic ${basicAuth}` },
    body: JSON.stringify({ numero: cartaoPostagem }),
  });

  const responseText = await authResponse.text();
  if (!authResponse.ok) {
    let errorMessage = `Falha na autenticação Correios (${authResponse.status})`;
    try { const d = JSON.parse(responseText); errorMessage = d.msgs?.[0]?.texto || d.message || errorMessage; } catch {}
    throw new Error(errorMessage);
  }

  const tokenData = JSON.parse(responseText);
  if (!tokenData.token) throw new Error("Token não retornado pela API dos Correios");

  const expiresAt = tokenData.expiraEm ? new Date(tokenData.expiraEm) : new Date(Date.now() + 55 * 60 * 1000);
  tokenCacheMap.set(tenantId, { token: tokenData.token, expiresAt });
  return tokenData.token;
}

async function calcularPreco(token: string, cepOrigem: string, cepDestino: string, produtos: any[], codigoServico: string): Promise<any> {
  let pesoTotal = 0;
  for (const p of produtos) pesoTotal += (p.weight || 0.3) * (p.quantity || 1);

  const isMiniEnvios = codigoServico === CORREIOS_SERVICES.MINI_ENVIOS;
  pesoTotal = Math.max(pesoTotal, isMiniEnvios ? 0.01 : 0.3);

  const comprimento = isMiniEnvios ? "16" : "20";
  const largura = isMiniEnvios ? "11" : "16";
  const altura = isMiniEnvios ? "3" : "10";
  const pesoEnvio = isMiniEnvios ? Math.min(Math.round(pesoTotal * 1000), 300) : Math.round(pesoTotal * 1000);

  const params = new URLSearchParams({
    cepOrigem: cepOrigem.replace(/\D/g, ''), cepDestino: cepDestino.replace(/\D/g, ''),
    psObjeto: String(pesoEnvio), tpObjeto: "2", comprimento, largura, altura,
  });

  const response = await fetch(`https://api.correios.com.br/preco/v1/nacional/${codigoServico}?${params}`, {
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
  });

  if (!response.ok) { console.error("[correios] Price error:", codigoServico, response.status); return null; }
  return await response.json();
}

async function calcularPrazo(token: string, cepOrigem: string, cepDestino: string, codigoServico: string): Promise<any> {
  const params = new URLSearchParams({
    cepOrigem: cepOrigem.replace(/\D/g, ''), cepDestino: cepDestino.replace(/\D/g, ''),
  });

  const response = await fetch(`https://api.correios.com.br/prazo/v1/nacional/${codigoServico}?${params}`, {
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
  });

  if (!response.ok) { console.error("[correios] Deadline error:", codigoServico, response.status); return null; }
  return await response.json();
}

// Fallback: API pública legada dos Correios
async function calcPublicShipping(cepO: string, cepD: string, pesoKg: number): Promise<any[]> {
  const results: any[] = [];
  try {
    const codes = "04510,04014";
    const url = `http://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx?nCdEmpresa=&sDsSenha=&sCepOrigem=${cepO}&sCepDestino=${cepD}&nVlPeso=${pesoKg}&nCdFormato=1&nVlComprimento=20&nVlAltura=10&nVlLargura=16&nVlDiametro=0&sCdMaoPropria=N&nVlValorDeclarado=0&sCdAvisoRecebimento=N&nCdServico=${codes}&StrRetorno=json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const text = await r.text();
      if (!text.includes("<html") && !text.includes("<!doctype")) {
        const data = JSON.parse(text);
        const servicos = data?.Servicos?.cServico || data?.cServico || [];
        const list = Array.isArray(servicos) ? servicos : [servicos];
        for (const s of list) {
          if (s.Erro && s.Erro !== "0") continue;
          const price = parseFloat((s.Valor || "0").replace(".", "").replace(",", "."));
          if (price > 0) {
            results.push({
              id: `correios_${s.Codigo}`, service_id: s.Codigo,
              name: s.Codigo === "04510" ? "PAC" : "SEDEX",
              service_name: s.Codigo === "04510" ? "PAC" : "SEDEX",
              company: { name: "Correios", picture: "" },
              price: price.toFixed(2), custom_price: price.toFixed(2),
              delivery_time: `${s.PrazoEntrega || "?"} dias úteis`,
              custom_delivery_time: parseInt(s.PrazoEntrega || "0"),
            });
          }
        }
      }
    }
  } catch (e) {
    console.log("[correios] Legacy API error:", (e as Error).message);
  }
  return results;
}

// Fallback por distância (último recurso)
function distanceFallback(cepO: string, cepD: string): any[] {
  const mesmaRegiao = cepO[0] === cepD[0];
  return [
    {
      id: "correios_pac_est", service_id: "04510",
      name: "PAC", service_name: "PAC",
      company: { name: "Correios", picture: "" },
      price: mesmaRegiao ? "18.90" : "28.90",
      custom_price: mesmaRegiao ? "18.90" : "28.90",
      delivery_time: mesmaRegiao ? "5 dias úteis" : "10 dias úteis",
      custom_delivery_time: mesmaRegiao ? 5 : 10,
    },
    {
      id: "correios_sedex_est", service_id: "04014",
      name: "SEDEX", service_name: "SEDEX",
      company: { name: "Correios", picture: "" },
      price: mesmaRegiao ? "28.90" : "45.90",
      custom_price: mesmaRegiao ? "28.90" : "45.90",
      delivery_time: mesmaRegiao ? "2 dias úteis" : "5 dias úteis",
      custom_delivery_time: mesmaRegiao ? 2 : 5,
    },
  ];
}

function parseEnabledServices(raw: any): Record<string, boolean> | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  return null;
}

function isServiceEnabled(enabledServices: Record<string, boolean> | null, serviceName: string): boolean {
  if (!enabledServices || Object.keys(enabledServices).length === 0) return true;
  return enabledServices[serviceName] !== false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenant_id, to_postal_code, products } = await req.json();

    if (!to_postal_code) {
      return new Response(JSON.stringify({ success: false, error: "CEP de destino é obrigatório" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: integration } = await supabase
      .from("shipping_integrations").select("*")
      .eq("tenant_id", tenant_id).eq("provider", "correios").eq("is_active", true).maybeSingle();

    if (!integration) {
      return new Response(JSON.stringify({ success: false, error: "Integração Correios não configurada ou inativa." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cepOrigem = (integration.from_cep || "").replace(/\D/g, "");
    if (!cepOrigem || cepOrigem.length !== 8) {
      return new Response(JSON.stringify({ success: false, error: "CEP de origem não configurado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cepDestino = to_postal_code.replace(/\D/g, "");
    const enabledServices = parseEnabledServices(integration.enabled_services);

    const credentials: CorreiosCredentials = {
      clientId: integration.client_id || "",
      clientSecret: integration.client_secret || "",
      cartaoPostagem: integration.refresh_token || "",
    };

    const hasCWS = !!credentials.clientId && !!credentials.clientSecret && !!credentials.cartaoPostagem;

    const productsList = (products || []).map((p: any) => ({
      weight: p.weight || 0.3, insurance_value: Number(p.insurance_value) || 50, quantity: Number(p.quantity) || 1,
    }));
    if (productsList.length === 0) productsList.push({ weight: 0.3, insurance_value: 50, quantity: 1 });

    let pesoTotal = 0;
    for (const p of productsList) pesoTotal += (p.weight || 0.3) * (p.quantity || 1);
    pesoTotal = Math.max(pesoTotal, 0.3);

    let shippingOptions: any[] = [];

    // ESTRATÉGIA 1: API CWS autenticada
    if (hasCWS) {
      try {
        const token = await getCorreiosToken(credentials, tenant_id);

        const allServices = [
          { code: CORREIOS_SERVICES.PAC_CONTRATO, name: "PAC", company: "Correios" },
          { code: CORREIOS_SERVICES.SEDEX_CONTRATO, name: "SEDEX", company: "Correios" },
          { code: CORREIOS_SERVICES.MINI_ENVIOS, name: "Mini Envios", company: "Correios" },
        ];

        const servicesToCheck = allServices.filter(s => isServiceEnabled(enabledServices, s.name));
        console.log("[correios] CWS services to check:", servicesToCheck.map(s => s.name));

        const results = await Promise.allSettled(
          servicesToCheck.map(async (service) => {
            const [precoResult, prazoResult] = await Promise.all([
              calcularPreco(token, cepOrigem, cepDestino, productsList, service.code),
              calcularPrazo(token, cepOrigem, cepDestino, service.code),
            ]);
            if (precoResult && prazoResult) {
              return {
                id: `correios_${service.code}`, service_id: service.code,
                name: service.name, service_name: service.name,
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
          if (result.status === "fulfilled" && result.value) shippingOptions.push(result.value);
        }

        if (shippingOptions.length > 0) {
          console.log("[correios] CWS options:", shippingOptions.length);
          return new Response(JSON.stringify({ success: true, shipping_options: shippingOptions, provider: "correios" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        console.log("[correios] CWS returned no options, trying public API fallback");
      } catch (e) {
        console.error("[correios] CWS auth error:", (e as Error).message, "- falling back to public API");
      }
    }

    // ESTRATÉGIA 2: API pública (legada)
    console.log("[correios] Using public API fallback");
    shippingOptions = await calcPublicShipping(cepOrigem, cepDestino, pesoTotal);

    if (enabledServices && Object.keys(enabledServices).length > 0) {
      shippingOptions = shippingOptions.filter(opt => enabledServices[opt.name] !== false);
    }

    if (shippingOptions.length > 0) {
      console.log("[correios] Public API options:", shippingOptions.length);
      return new Response(JSON.stringify({ success: true, shipping_options: shippingOptions, provider: "correios" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ESTRATÉGIA 3: Fallback por distância
    console.log("[correios] Using distance fallback");
    let fallback = distanceFallback(cepOrigem, cepDestino);
    if (enabledServices && Object.keys(enabledServices).length > 0) {
      fallback = fallback.filter(opt => enabledServices[opt.name] !== false);
    }

    return new Response(JSON.stringify({ success: true, shipping_options: fallback, provider: "correios", fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[correios-shipping] Error:", errMsg);
    console.error("[correios-shipping] Stack:", error instanceof Error ? error.stack : "no stack");
    return new Response(JSON.stringify({ success: false, error: errMsg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
