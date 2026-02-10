import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Códigos dos serviços dos Correios
const SERVICES = [
  { code: "04510", name: "PAC", company: "Correios" },
  { code: "04014", name: "SEDEX", company: "Correios" },
  { code: "04227", name: "Mini Envios", company: "Correios" },
];

interface CalcResult {
  Codigo: string;
  Valor: string;
  PrazoEntrega: string;
  Erro: string;
  MsgErro: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, to_postal_code, products } = await req.json();

    console.log("[meuscorreios-shipping] Request:", { tenant_id, to_postal_code, products_count: products?.length });

    if (!to_postal_code) {
      return new Response(
        JSON.stringify({ success: false, error: "CEP de destino é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar CEP de origem: primeiro da integração, depois do tenant
    let cepOrigem = "";

    // Tentar buscar from_cep da integração meuscorreios
    const { data: integration } = await supabase
      .from("shipping_integrations")
      .select("from_cep")
      .eq("tenant_id", tenant_id)
      .eq("provider", "meuscorreios")
      .eq("is_active", true)
      .maybeSingle();

    if (integration?.from_cep) {
      cepOrigem = integration.from_cep.replace(/\D/g, "");
    }

    // Fallback: buscar company_cep do tenant
    if (!cepOrigem) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("company_cep")
        .eq("id", tenant_id)
        .single();

      if (tenant?.company_cep) {
        cepOrigem = tenant.company_cep.replace(/\D/g, "");
      }
    }

    if (!cepOrigem || cepOrigem.length !== 8) {
      return new Response(
        JSON.stringify({ success: false, error: "CEP de origem não configurado. Configure o endereço da empresa em Configurações." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calcular peso e valor total dos produtos
    let pesoTotal = 0;
    let valorTotal = 0;
    for (const p of (products || [])) {
      const peso = (p.weight || 0.3) * (p.quantity || 1);
      const valor = (p.insurance_value || 50) * (p.quantity || 1);
      pesoTotal += peso;
      valorTotal += valor;
    }
    pesoTotal = Math.max(pesoTotal, 0.3);

    const cepDestino = to_postal_code.replace(/\D/g, "");

    // Usar API pública de cálculo via HTTPS
    const calcUrl = `https://www.correios.com.br/@@precosEPrazos?cepOrigem=${cepOrigem}&cepDestino=${cepDestino}&nVlPeso=${pesoTotal}&nCdFormato=1&nVlComprimento=20&nVlAltura=10&nVlLargura=16&nVlDiametro=0&sCdMaoPropria=N&nVlValorDeclarado=0&sCdAvisoRecebimento=N&nCdServico=04510,04014,04227&StrRetorno=json`;

    console.log("[meuscorreios-shipping] Trying Correios API...");

    let servicosList: any[] = [];
    let apiSuccess = false;

    // Tentar API oficial dos Correios
    try {
      const response = await fetch(calcUrl, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = await response.json();
        const servicos = data?.Servicos?.cServico || data?.cServico || [];
        servicosList = Array.isArray(servicos) ? servicos : [servicos];
        apiSuccess = servicosList.length > 0;
      }
    } catch (e) {
      console.log("[meuscorreios-shipping] Official API failed, trying fallback...");
    }

    // Fallback: usar calculador legado via HTTP
    if (!apiSuccess) {
      try {
        const legacyUrl = new URL("http://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx");
        legacyUrl.searchParams.set("nCdEmpresa", "");
        legacyUrl.searchParams.set("sDsSenha", "");
        legacyUrl.searchParams.set("sCepOrigem", cepOrigem);
        legacyUrl.searchParams.set("sCepDestino", cepDestino);
        legacyUrl.searchParams.set("nVlPeso", String(pesoTotal));
        legacyUrl.searchParams.set("nCdFormato", "1");
        legacyUrl.searchParams.set("nVlComprimento", "20");
        legacyUrl.searchParams.set("nVlAltura", "10");
        legacyUrl.searchParams.set("nVlLargura", "16");
        legacyUrl.searchParams.set("nVlDiametro", "0");
        legacyUrl.searchParams.set("sCdMaoPropria", "N");
        legacyUrl.searchParams.set("nVlValorDeclarado", "0");
        legacyUrl.searchParams.set("sCdAvisoRecebimento", "N");
        legacyUrl.searchParams.set("nCdServico", SERVICES.map(s => s.code).join(","));
        legacyUrl.searchParams.set("StrRetorno", "json");

        const response = await fetch(legacyUrl.toString(), {
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          const data = await response.json();
          const servicos = data?.Servicos?.cServico || data?.cServico || [];
          servicosList = Array.isArray(servicos) ? servicos : [servicos];
          apiSuccess = servicosList.length > 0;
        }
      } catch (e2) {
        console.log("[meuscorreios-shipping] Legacy API also failed");
      }
    }

    // Fallback final: usar estimativas fixas baseadas na distância
    if (!apiSuccess || servicosList.length === 0) {
      console.log("[meuscorreios-shipping] Using fixed estimates as final fallback");
      
      // Verificar se é mesmo estado (primeiros 2 dígitos do CEP)
      const origemRegiao = cepOrigem.substring(0, 1);
      const destinoRegiao = cepDestino.substring(0, 1);
      const mesmaRegiao = origemRegiao === destinoRegiao;
      
      const shippingOptions = [
        {
          id: "correios_04510",
          service_id: "04510",
          name: "PAC",
          service_name: "PAC",
          company: { name: "Correios", picture: "" },
          price: mesmaRegiao ? "18.90" : "28.90",
          custom_price: mesmaRegiao ? "18.90" : "28.90",
          delivery_time: mesmaRegiao ? "5 dias úteis" : "10 dias úteis",
          custom_delivery_time: mesmaRegiao ? 5 : 10,
        },
        {
          id: "correios_04014",
          service_id: "04014",
          name: "SEDEX",
          service_name: "SEDEX",
          company: { name: "Correios", picture: "" },
          price: mesmaRegiao ? "28.90" : "45.90",
          custom_price: mesmaRegiao ? "28.90" : "45.90",
          delivery_time: mesmaRegiao ? "2 dias úteis" : "5 dias úteis",
          custom_delivery_time: mesmaRegiao ? 2 : 5,
        },
      ];

      return new Response(
        JSON.stringify({ success: true, shipping_options: shippingOptions, provider: "meuscorreios", fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shippingOptions: any[] = [];

    for (const servico of servicosList) {
      // Skip services with errors
      if (servico.Erro && servico.Erro !== "0") {
        console.log(`[meuscorreios-shipping] Service ${servico.Codigo} error: ${servico.MsgErro}`);
        continue;
      }

      const serviceInfo = SERVICES.find(s => s.code === servico.Codigo);
      if (!serviceInfo) continue;

      // Parse price (format: "25,50")
      const priceStr = (servico.Valor || "0").replace(".", "").replace(",", ".");
      const price = parseFloat(priceStr);

      if (isNaN(price) || price <= 0) continue;

      const prazo = parseInt(servico.PrazoEntrega || "0");

      shippingOptions.push({
        id: `correios_${servico.Codigo}`,
        service_id: servico.Codigo,
        name: serviceInfo.name,
        service_name: serviceInfo.name,
        company: { name: serviceInfo.company, picture: "" },
        price: price.toFixed(2),
        custom_price: price.toFixed(2),
        delivery_time: `${prazo} dias úteis`,
        custom_delivery_time: prazo,
      });
    }

    console.log("[meuscorreios-shipping] Options found:", shippingOptions.length);

    return new Response(
      JSON.stringify({
        success: true,
        shipping_options: shippingOptions,
        provider: "meuscorreios",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[meuscorreios-shipping] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
