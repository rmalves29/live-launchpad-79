import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Códigos de contrato (AG) - usados na API CWS autenticada
const CONTRACT_SERVICES = [
  { code: "03298", name: "PAC", company: "Correios" },
  { code: "03220", name: "SEDEX", company: "Correios" },
  { code: "04227", name: "Mini Envios", company: "Correios" },
  { code: "03140", name: "SEDEX 12", company: "Correios" },
];

// Cache do token CWS por tenant
const tokenCacheMap: Map<string, { token: string; expiresAt: Date }> = new Map();

async function getCorreiosCWSToken(
  clientId: string,
  clientSecret: string,
  cartaoPostagem: string,
  tenantId: string
): Promise<string> {
  const cached = tokenCacheMap.get(tenantId);
  if (cached && new Date(cached.expiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    return cached.token;
  }

  const authUrl = "https://api.correios.com.br/token/v1/autentica/cartaopostagem";
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const resp = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${basicAuth}` },
    body: JSON.stringify({ numero: cartaoPostagem }),
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`CWS auth failed (${resp.status}): ${text.substring(0, 200)}`);

  const data = JSON.parse(text);
  if (!data.token) throw new Error("Token CWS não retornado");

  const expiresAt = data.expiraEm ? new Date(data.expiraEm) : new Date(Date.now() + 55 * 60 * 1000);
  tokenCacheMap.set(tenantId, { token: data.token, expiresAt });
  return data.token;
}

async function calcCWSPreco(token: string, cepO: string, cepD: string, pesoG: number, cod: string) {
  const isMini = cod === "04227";
  const params = new URLSearchParams({
    cepOrigem: cepO, cepDestino: cepD,
    psObjeto: String(isMini ? Math.min(pesoG, 300) : pesoG),
    tpObjeto: "2",
    comprimento: isMini ? "16" : "20",
    largura: isMini ? "11" : "16",
    altura: isMini ? "3" : "10",
  });
  const r = await fetch(`https://api.correios.com.br/preco/v1/nacional/${cod}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!r.ok) { console.error(`[mc] CWS price ${cod}: ${r.status}`); return null; }
  return r.json();
}

async function calcCWSPrazo(token: string, cepO: string, cepD: string, cod: string) {
  const params = new URLSearchParams({ cepOrigem: cepO, cepDestino: cepD });
  const r = await fetch(`https://api.correios.com.br/prazo/v1/nacional/${cod}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!r.ok) { console.error(`[mc] CWS deadline ${cod}: ${r.status}`); return null; }
  return r.json();
}

// Usar API pública de terceiros como fallback (mais confiável que a API legada dos Correios)
async function calcPublicShipping(cepO: string, cepD: string, pesoKg: number): Promise<any[]> {
  const results: any[] = [];

  // Tentar ws.correios.com.br (legado)
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
              id: `correios_${s.Codigo}`,
              service_id: s.Codigo,
              name: s.Codigo === "04510" ? "PAC" : "SEDEX",
              service_name: s.Codigo === "04510" ? "PAC" : "SEDEX",
              company: { name: "Correios", picture: "" },
              price: price.toFixed(2),
              custom_price: price.toFixed(2),
              delivery_time: `${s.PrazoEntrega || "?"} dias úteis`,
              custom_delivery_time: parseInt(s.PrazoEntrega || "0"),
            });
          }
        }
      }
    }
  } catch (e) {
    console.log("[mc] Legacy API error:", (e as Error).message);
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, to_postal_code, products } = await req.json();
    console.log("[mc] Request:", { tenant_id, to_postal_code, products_count: products?.length });

    if (!to_postal_code) {
      return new Response(
        JSON.stringify({ success: false, error: "CEP de destino é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: integration } = await supabase
      .from("shipping_integrations")
      .select("from_cep, access_token, token_type, refresh_token, scope, client_id, client_secret")
      .eq("tenant_id", tenant_id)
      .eq("provider", "meuscorreios")
      .eq("is_active", true)
      .maybeSingle();

    let cepOrigem = integration?.from_cep?.replace(/\D/g, "") || "";
    if (!cepOrigem) {
      const { data: tenant } = await supabase.from("tenants").select("company_cep").eq("id", tenant_id).single();
      cepOrigem = tenant?.company_cep?.replace(/\D/g, "") || "";
    }

    if (!cepOrigem || cepOrigem.length !== 8) {
      return new Response(
        JSON.stringify({ success: false, error: "CEP de origem não configurado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let pesoTotal = 0;
    for (const p of (products || [])) pesoTotal += (p.weight || 0.3) * (p.quantity || 1);
    pesoTotal = Math.max(pesoTotal, 0.3);

    const cepDestino = to_postal_code.replace(/\D/g, "");
    let shippingOptions: any[] = [];

    // Credenciais CWS dos Correios (armazenadas nos campos client_id/client_secret da integração)
    const clientId = integration?.client_id || "";
    const clientSecret = integration?.client_secret || "";
    const cartaoPostagem = integration?.refresh_token || "";
    const hasCWS = !!clientId && !!clientSecret && !!cartaoPostagem;

    // ESTRATÉGIA 1: API CWS autenticada (se tem credenciais)
    if (hasCWS) {
      console.log("[mc] Using CWS API");
      try {
        const token = await getCorreiosCWSToken(clientId, clientSecret, cartaoPostagem, tenant_id);
        const pesoG = Math.round(pesoTotal * 1000);

        const results = await Promise.allSettled(
          CONTRACT_SERVICES.map(async (svc) => {
            const [preco, prazo] = await Promise.all([
              calcCWSPreco(token, cepOrigem, cepDestino, pesoG, svc.code),
              calcCWSPrazo(token, cepOrigem, cepDestino, svc.code),
            ]);
            if (preco && prazo) {
              return {
                id: `correios_${svc.code}`, service_id: svc.code,
                name: svc.name, service_name: svc.name,
                company: { name: svc.company, picture: "" },
                price: String(preco.pcFinal || preco.pcBase || "0"),
                custom_price: String(preco.pcFinal || preco.pcBase || "0"),
                delivery_time: `${prazo.prazoEntrega || "?"} dias úteis`,
                custom_delivery_time: prazo.prazoEntrega || 0,
              };
            }
            return null;
          })
        );

        for (const r of results) {
          if (r.status === "fulfilled" && r.value) shippingOptions.push(r.value);
        }

        if (shippingOptions.length > 0) {
          console.log("[mc] CWS options:", shippingOptions.length);
          return new Response(
            JSON.stringify({ success: true, shipping_options: shippingOptions, provider: "meuscorreios" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.log("[mc] CWS returned no options, trying public API");
      } catch (e) {
        console.error("[mc] CWS error:", (e as Error).message);
      }
    }

    // ESTRATÉGIA 2: API pública (legada) com códigos públicos
    console.log("[mc] Using public API");
    shippingOptions = await calcPublicShipping(cepOrigem, cepDestino, pesoTotal);

    if (shippingOptions.length > 0) {
      console.log("[mc] Public options:", shippingOptions.length);
      return new Response(
        JSON.stringify({ success: true, shipping_options: shippingOptions, provider: "meuscorreios" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ESTRATÉGIA 3: Fallback por distância
    console.log("[mc] Using distance fallback");
    const mesmaRegiao = cepOrigem[0] === cepDestino[0];
    const fallback = [
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

    return new Response(
      JSON.stringify({ success: true, shipping_options: fallback, provider: "meuscorreios", fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[mc] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
