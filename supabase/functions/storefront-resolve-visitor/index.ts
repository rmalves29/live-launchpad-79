// Resolve identidade do visitante anônimo da vitrine pelo hash do IP
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || 'unknown';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { tenant_slug } = await req.json();
    if (!tenant_slug || typeof tenant_slug !== 'string') {
      return new Response(JSON.stringify({ error: 'tenant_slug obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenant_slug)
      .eq('is_active', true)
      .maybeSingle();

    if (!tenant) {
      return new Response(JSON.stringify({ identity: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ip = getClientIp(req);
    const ipHash = await sha256Hex(`${tenant.id}:${ip}`);

    const { data: visitor } = await supabase
      .from('storefront_visitors')
      .select('customer_phone, customer_instagram')
      .eq('tenant_id', tenant.id)
      .eq('ip_hash', ipHash)
      .maybeSingle();

    return new Response(JSON.stringify({
      identity: visitor ? {
        phone: visitor.customer_phone,
        instagram: visitor.customer_instagram ?? null,
      } : null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[storefront-resolve-visitor]', e);
    return new Response(JSON.stringify({ identity: null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
