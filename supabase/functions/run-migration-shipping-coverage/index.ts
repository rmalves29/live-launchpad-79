import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[migration] Adding geographic coverage columns to custom_shipping_options...");

    // Adicionar colunas de cobertura geográfica
    const columns = [
      { name: 'coverage_type', type: 'TEXT', default: "'national'" },
      { name: 'coverage_states', type: 'TEXT[]', default: 'NULL' },
      { name: 'coverage_city', type: 'TEXT', default: 'NULL' },
      { name: 'coverage_state', type: 'TEXT', default: 'NULL' },
    ];

    const results: string[] = [];

    for (const col of columns) {
      // Verificar se coluna já existe
      const { data: existing } = await supabase
        .from('custom_shipping_options')
        .select(col.name)
        .limit(1);

      // Se não der erro, coluna já existe
      if (existing !== null) {
        results.push(`Column ${col.name} already exists`);
        continue;
      }

      // Usar RPC para executar DDL (se disponível) ou informar para executar manualmente
      results.push(`Column ${col.name} needs to be added manually via SQL Editor`);
    }

    // Retornar o SQL que precisa ser executado
    const migrationSQL = `
-- Execute este SQL no Supabase SQL Editor:
ALTER TABLE custom_shipping_options 
ADD COLUMN IF NOT EXISTS coverage_type TEXT DEFAULT 'national',
ADD COLUMN IF NOT EXISTS coverage_states TEXT[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS coverage_city TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS coverage_state TEXT DEFAULT NULL;

-- Comentários
COMMENT ON COLUMN custom_shipping_options.coverage_type IS 'Tipo de cobertura: national, states, city, capital, interior';
COMMENT ON COLUMN custom_shipping_options.coverage_states IS 'Lista de UFs quando coverage_type = states';
COMMENT ON COLUMN custom_shipping_options.coverage_city IS 'Cidade específica quando coverage_type = city';
COMMENT ON COLUMN custom_shipping_options.coverage_state IS 'Estado para capital/interior ou cidade específica';
    `.trim();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Migration SQL generated. Execute in Supabase SQL Editor.",
        sql: migrationSQL,
        results
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[migration] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        sql: `
-- Execute este SQL no Supabase SQL Editor:
ALTER TABLE custom_shipping_options 
ADD COLUMN IF NOT EXISTS coverage_type TEXT DEFAULT 'national',
ADD COLUMN IF NOT EXISTS coverage_states TEXT[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS coverage_city TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS coverage_state TEXT DEFAULT NULL;
        `.trim()
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
