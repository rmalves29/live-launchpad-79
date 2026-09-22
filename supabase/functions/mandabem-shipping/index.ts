import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WS_BASE = "https://mandabem.com.br/ws";

// Serviços suportados pelo webservice do Manda Bem
const SERVICES = ["PAC", "SEDEX", "PACMINI"] as const;

const SERVICE_LABEL: Record<string, string> = {
  PAC: "PAC",
  SEDEX: "SEDEX",
  PACMINI: "Mini Envios",
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function form(params: Record<string, string | number>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, String(v));
  return body.toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, to_postal_code, products } = await req.json();

    console.log("[mandabem-shipping] Request:", { tenant_id, to_postal_code, products_count: products?.length });

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id é obrigatório" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!to_postal_code) {
      return new Response(
        JSON.stringify({ success: false, error: "CEP de destino é obrigatório" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integration } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "mandabem")
      .eq("is_active", true)
      .maybeSingle();

    if (!integration) {
      return new Response(
        JSON.stringify({ success: false, error: "Configuração Manda Bem não encontrada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const plataformaId = integration.client_id || "";
    const plataformaChave = integration.access_token || "";

    if (!plataformaId || !plataformaChave) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais Manda Bem (API ID / API Token) não configuradas" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!integration.from_cep) {
      return new Response(
        JSON.stringify({ success: false, error: "CEP de origem não configurado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Consolidação de peso/dimensões (mesma regra das demais transportadoras)
    let totalWeight = 0;
    let totalValue = 0;
    let maxHeight = 0;
    let maxWidth = 0;
    let maxLength = 0;

    const list = Array.isArray(products) ? products : [];
    if (list.length === 0) {
      totalWeight = 0.3;
      totalValue = 50;
      maxHeight = 2;
      maxWidth = 16;
      maxLength = 20;
    } else {
      for (const p of list) {
        const qty = Number(p.quantity) || 1;
        totalWeight += (Number(p.weight) || 0.3) * qty;
        totalValue += (Number(p.insurance_value) || 50) * qty;
        maxHeight = Math.max(maxHeight, Number(p.height) || 2);
        maxWidth = Math.max(maxWidth, Number(p.width) || 16);
        maxLength = Math.max(maxLength, Number(p.length) || 20);
      }
    }
    totalWeight = Math.max(totalWeight, 0.1);

    const cepOrigem = String(integration.from_cep).replace(/\D/g, "");
    const cepDestino = String(to_postal_code).replace(/\D/g, "");

    // Filtro de serviços habilitados pelo lojista
    let enabledServices: Record<string, boolean> | null = null;
    try {
      const raw = integration.enabled_services;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) enabledServices = parsed;
      }
    } catch { /* ignora json inválido */ }

    const hasFilter = !!enabledServices && Object.keys(enabledServices).length > 0;
    const wanted = SERVICES.filter((s) => !hasFilter || enabledServices![s] !== false);

    const options: any[] = [];
    const errors: string[] = [];

    for (const servico of wanted) {
      // PACMINI tem limites rígidos de peso/dimensão
      if (servico === "PACMINI" && (totalWeight > 0.3 || maxHeight > 4 || maxWidth > 16 || maxLength > 24)) {
        continue;
      }

      const payload: Record<string, string | number> = {
        plataforma_id: plataformaId,
        plataforma_chave: plataformaChave,
        cep_origem: cepOrigem,
        cep_destino: cepDestino,
        servico,
        peso: totalWeight.toFixed(3),
        altura: Math.max(1, Math.round(maxHeight)),
        largura: Math.max(11, Math.round(maxWidth)),
        comprimento: Math.max(16, Math.round(maxLength)),
        valor_seguro: totalValue.toFixed(2),
      };

      const response = await fetch(`${WS_BASE}/valor_envio`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form(payload),
      });

      const text = await response.text();
      console.log(`[mandabem-shipping] ${servico} HTTP ${response.status}: ${text.substring(0, 300)}`);

      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        errors.push(`${servico}: resposta inválida`);
        continue;
      }

      const resultado = json?.resultado || json;
      if (String(resultado?.sucesso) !== "true") {
        errors.push(`${servico}: ${resultado?.erro || "sem cotação"}`);
        continue;
      }
      if (resultado?.erro) console.log(`[mandabem-shipping] Aviso ${servico}: ${resultado.erro}`);

      // A resposta traz uma chave por serviço cotado (PAC, SEDEX, PACMINI)
      for (const key of SERVICES) {
        const quote = resultado?.[key];
        if (!quote) continue;
        if (hasFilter && enabledServices![key] === false) continue;
        if (options.some((o) => o.service_id === key)) continue;

        const price = toNumber(quote.valor);
        if (!price) continue;
        const days = Number(quote.prazo) || null;

        options.push({
          id: `mandabem_${key.toLowerCase()}`,
          service_id: key,
          name: SERVICE_LABEL[key] || key,
          service_name: SERVICE_LABEL[key] || key,
          company: { name: "Correios", picture: "" },
          price,
          custom_price: price,
          delivery_time: days ? `${days} dias úteis` : "Consulte",
          custom_delivery_time: days,
          provider: "mandabem",
        });
      }
    }

    options.sort((a, b) => a.price - b.price);

    console.log("[mandabem-shipping] Opções válidas:", options.length, "erros:", errors);

    if (options.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: errors[0] || "Nenhuma opção de frete disponível para este CEP",
          details: errors,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, shipping_options: options, provider: "mandabem" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[mandabem-shipping] Erro:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
