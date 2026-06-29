import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLING_API_URL = 'https://api.bling.com.br/Api/v3';
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { tenant_id, limit = 500, only_missing_image = true } = await req.json().catch(() => ({}));
    if (!tenant_id) {
      return new Response(JSON.stringify({ success: false, error: 'tenant_id is required' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: integ, error: integErr } = await supabase
      .from('integration_bling')
      .select('access_token, token_expires_at, is_active')
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (integErr || !integ?.access_token) {
      return new Response(JSON.stringify({ success: false, error: 'Bling não configurado' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let query = supabase
      .from('products')
      .select('id, code, image_url, bling_product_id')
      .eq('tenant_id', tenant_id)
      .order('id', { ascending: false })
      .limit(limit);
    if (only_missing_image) query = query.is('image_url', null);

    const { data: products, error: prodErr } = await query;
    if (prodErr) throw prodErr;

    const token = integ.access_token;
    const results = { total: products?.length || 0, updated: 0, not_found: 0, no_image: 0, errors: 0 };
    const samples: any[] = [];

    for (const p of products || []) {
      try {
        // Step 1: find product by code
        const searchRes = await fetch(`${BLING_API_URL}/produtos?codigo=${encodeURIComponent(p.code)}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        });
        await delay(350);
        if (!searchRes.ok) {
          results.errors++;
          samples.push({ code: p.code, step: 'search', status: searchRes.status });
          continue;
        }
        const searchJson = await searchRes.json();
        const items = searchJson?.data || [];
        const match = items.find((it: any) => String(it.codigo).toUpperCase() === p.code.toUpperCase()) || items[0];
        if (!match?.id) {
          results.not_found++;
          continue;
        }

        // Step 2: get full product details
        const detRes = await fetch(`${BLING_API_URL}/produtos/${match.id}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        });
        await delay(350);
        if (!detRes.ok) {
          results.errors++;
          samples.push({ code: p.code, step: 'detail', status: detRes.status });
          continue;
        }
        const detJson = await detRes.json();
        const prod = detJson?.data;
        const externas = prod?.midia?.imagens?.externas || [];
        const imageUrl = externas[0]?.link || null;

        const update: any = { bling_product_id: match.id };
        if (imageUrl) update.image_url = imageUrl;
        else results.no_image++;

        await supabase.from('products').update(update).eq('id', p.id);
        if (imageUrl) results.updated++;
      } catch (e) {
        results.errors++;
        samples.push({ code: p.code, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ success: true, results, samples: samples.slice(0, 10) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: String(error) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
