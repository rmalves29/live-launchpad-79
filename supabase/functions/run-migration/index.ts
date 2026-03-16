import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Add campaign_id column to fe_auto_messages
  const { error } = await supabase.rpc('exec_sql' as any, {
    sql: `ALTER TABLE fe_auto_messages ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES fe_campaigns(id) ON DELETE SET NULL`
  });

  // Try direct approach via postgres
  try {
    const dbUrl = Deno.env.get('SUPABASE_DB_URL');
    if (dbUrl) {
      const { Client } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
      const client = new Client(dbUrl);
      await client.connect();
      await client.queryArray(`ALTER TABLE fe_auto_messages ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES fe_campaigns(id) ON DELETE SET NULL`);
      await client.end();
      return new Response(JSON.stringify({ success: true, method: 'direct_sql' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, method: 'direct_sql_failed' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: error?.message || 'no db url' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
