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
    
    // Use service role to execute DDL
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      db: { schema: 'public' }
    });

    console.log("[run-migration-whatsapp-flags] Starting migration...");

    // Check if columns already exist by querying the table structure
    const { data: existingColumns, error: checkError } = await supabase
      .from("integration_whatsapp")
      .select("*")
      .limit(1);

    if (checkError) {
      console.error("[run-migration-whatsapp-flags] Error checking table:", checkError);
      throw new Error(`Error checking table: ${checkError.message}`);
    }

    // Check if the new columns exist by trying to query them
    const { data: testData, error: testError } = await supabase
      .from("integration_whatsapp")
      .select("send_item_added_msg, send_paid_order_msg, send_product_canceled_msg, send_out_of_stock_msg")
      .limit(1);

    if (!testError) {
      console.log("[run-migration-whatsapp-flags] Columns already exist!");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Colunas já existem! Migração não necessária.",
          already_exists: true 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Columns don't exist, need to run migration via RPC
    // Since we can't run raw SQL, we'll use a workaround:
    // We'll call the Supabase REST API directly with the service role key
    
    const migrationSQL = `
      ALTER TABLE integration_whatsapp 
      ADD COLUMN IF NOT EXISTS send_item_added_msg BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS send_paid_order_msg BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS send_product_canceled_msg BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS send_out_of_stock_msg BOOLEAN NOT NULL DEFAULT true;
    `;

    // Use the Supabase Management API or direct PostgreSQL connection
    // Since we have the DB URL, we can use the pg extension
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    
    if (!dbUrl) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "SUPABASE_DB_URL not configured. Please add this secret.",
          needs_secret: true,
          sql_to_run: migrationSQL.trim()
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Connect directly to PostgreSQL
    const { Client } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
    const client = new Client(dbUrl);
    
    await client.connect();
    console.log("[run-migration-whatsapp-flags] Connected to database");

    await client.queryObject(migrationSQL);
    console.log("[run-migration-whatsapp-flags] Migration executed successfully");

    await client.end();

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Migração executada com sucesso! Colunas de controle de mensagens adicionadas." 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[run-migration-whatsapp-flags] Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        sql_to_run: `ALTER TABLE integration_whatsapp 
ADD COLUMN IF NOT EXISTS send_item_added_msg BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS send_paid_order_msg BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS send_product_canceled_msg BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS send_out_of_stock_msg BOOLEAN NOT NULL DEFAULT true;`
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
