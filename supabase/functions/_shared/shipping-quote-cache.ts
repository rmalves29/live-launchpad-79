// Cache de cotação de frete por prefixo de CEP (5 primeiros dígitos). Vale para cada loja separadamente.
// CEPs vizinhos têm preço/prazo praticamente iguais: a segunda cliente da mesma região recebe o frete na hora.
// A chave inclui peso, valor declarado e volume (em faixas) e a data da última alteração da integração
// (mudou a origem, os serviços ou as credenciais, o cache antigo deixa de valer). Validade: 3 horas.
// Respostas de contingência (fallback) e erros nunca são guardados.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TTL_MS = 3 * 60 * 60 * 1000;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

function quoteKey(products: any[], updatedAt: string): string {
  let kg = 0, insurance = 0, volume = 0;
  for (const p of products || []) {
    const q = Number(p.quantity) || 1;
    kg += (Number(p.weight) || 0.3) * q;
    insurance += (Number(p.insurance_value) || 0) * q;
    volume += (Number(p.width) || 0) * (Number(p.height) || 0) * (Number(p.length) || 0) * q;
  }
  // faixas: 50 g, R$ 50 de valor declarado, 1.000 cm³
  return `w${Math.ceil(kg * 20)}|i${Math.ceil(insurance / 50)}|v${Math.ceil(volume / 1000)}|u${new Date(updatedAt).getTime()}`;
}

export function withQuoteCache(provider: string, handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return handler(req);
    let body: any;
    try { body = await req.clone().json(); } catch { return handler(req); }
    const tenantId = body?.tenant_id;
    const cep = String(body?.to_postal_code || "").replace(/\D/g, "");
    if (!tenantId || cep.length !== 8) return handler(req);

    let supabase: any;
    let key = "";
    try {
      supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: integ } = await supabase.from("shipping_integrations").select("updated_at")
        .eq("tenant_id", tenantId).eq("provider", provider).eq("is_active", true).maybeSingle();
      if (!integ) return handler(req);
      key = quoteKey(body.products, integ.updated_at);
      const prefix = cep.slice(0, 5);
      const { data: hit } = await supabase.from("shipping_quote_cache").select("options, created_at")
        .eq("tenant_id", tenantId).eq("provider", provider).eq("cep_prefix", prefix).eq("weight_key", key).maybeSingle();
      if (hit && Array.isArray(hit.options) && hit.options.length > 0 && Date.now() - new Date(hit.created_at).getTime() < TTL_MS) {
        console.log(`[${provider}] cache hit ${prefix} ${key}`);
        return new Response(JSON.stringify({ success: true, shipping_options: hit.options, provider, cached: true }),
          { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
      }
    } catch (e) {
      console.error(`[${provider}] cache read:`, (e as Error).message);
      return handler(req);
    }

    const res = await handler(req);
    try {
      if (res.ok) {
        const data = await res.clone().json();
        if (data?.success !== false && !data?.fallback && Array.isArray(data?.shipping_options) && data.shipping_options.length > 0) {
          const write = (async () => {
            await supabase.from("shipping_quote_cache").upsert(
              { tenant_id: tenantId, provider, cep_prefix: cep.slice(0, 5), weight_key: key, options: data.shipping_options, created_at: new Date().toISOString() },
              { onConflict: "tenant_id,provider,cep_prefix,weight_key" },
            );
            if (Math.random() < 0.02) await supabase.from("shipping_quote_cache").delete().lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
          })().catch((e) => console.error(`[${provider}] cache write:`, (e as Error).message));
          // @ts-ignore EdgeRuntime existe no ambiente de funções do Supabase
          if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(write);
        }
      }
    } catch (e) {
      console.error(`[${provider}] cache save:`, (e as Error).message);
    }
    return res;
  };
}
