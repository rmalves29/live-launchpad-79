import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const BLING_API_URL = 'https://api.bling.com.br/Api/v3';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const { tenant_id, code } = await req.json();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: integ } = await supabase.from('integration_bling').select('access_token').eq('tenant_id', tenant_id).maybeSingle();
  const token = integ!.access_token;
  const searchRes = await fetch(`${BLING_API_URL}/produtos?codigo=${encodeURIComponent(code)}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const searchJson = await searchRes.json();
  const id = searchJson?.data?.[0]?.id;
  const detRes = await fetch(`${BLING_API_URL}/produtos/${id}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const detJson = await detRes.json();
  return new Response(JSON.stringify({ search: searchJson, detail: detJson }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
