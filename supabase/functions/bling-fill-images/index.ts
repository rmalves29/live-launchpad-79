// Edge Function: bling-fill-images
// Preenche a foto dos produtos que foram importados do Bling sem imagem.
// Usa o vínculo bling_product_id (cai para busca por código se não houver). Foto interna do Bling (link S3 que expira)
// é copiada para o Storage (bucket product-images). Variações herdam a foto do produto pai.
// Use `limit` para processar em lotes (o Bling aceita ~3 chamadas/s).
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLING_API_URL = 'https://api.bling.com.br/Api/v3';
const BUCKET = 'product-images';
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// Foto do produto: link externo se existir, senão o interno (que expira e por isso é copiado para o Storage).
async function resolveImage(supabase: any, tenantId: string, blingId: number | string, prod: any): Promise<string | null> {
  const ext = prod?.midia?.imagens?.externas?.[0]?.link;
  if (ext) return String(ext);
  const int = prod?.midia?.imagens?.internas?.[0]?.link;
  if (!int) return prod?.imagemURL ? String(prod.imagemURL) : null;
  try {
    const res = await fetch(String(int), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || 'image/jpeg';
    const fileExt = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const key = new URL(String(int)).pathname.split('/').pop() || String(blingId);
    const path = `bling/${tenantId}/${blingId}-${key}.${fileExt}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, await res.arrayBuffer(), { contentType: type, upsert: true });
    if (error) { console.error('[bling-fill-images] upload:', error.message); return null; }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error('[bling-fill-images] download:', (e as Error).message);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { tenant_id, limit = 40, only_missing_image = true } = await req.json().catch(() => ({}));
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

    // Só produtos principais (simples ou pai de variações); as variações herdam a foto do pai.
    let query = supabase
      .from('products')
      .select('id, code, image_url, bling_product_id')
      .eq('tenant_id', tenant_id)
      .is('parent_product_id', null)
      .order('id', { ascending: false })
      .limit(limit);
    if (only_missing_image) query = query.is('image_url', null);

    const { data: products, error: prodErr } = await query;
    if (prodErr) throw prodErr;

    const token = integ.access_token;
    const headers = { 'enable-jwt': '1', 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
    const results = { total: products?.length || 0, updated: 0, children_updated: 0, not_found: 0, no_image: 0, errors: 0 };
    const samples: any[] = [];

    for (const p of products || []) {
      try {
        let blingId = p.bling_product_id;
        if (!blingId) {
          const searchRes = await fetch(`${BLING_API_URL}/produtos?codigo=${encodeURIComponent(p.code)}`, { headers });
          await delay(350);
          if (!searchRes.ok) {
            results.errors++;
            samples.push({ code: p.code, step: 'search', status: searchRes.status });
            continue;
          }
          const items = (await searchRes.json())?.data || [];
          const match = items.find((it: any) => String(it.codigo).toUpperCase() === String(p.code).toUpperCase()) || items[0];
          if (!match?.id) { results.not_found++; continue; }
          blingId = match.id;
        }

        const detRes = await fetch(`${BLING_API_URL}/produtos/${blingId}`, { headers });
        await delay(350);
        if (!detRes.ok) {
          results.errors++;
          samples.push({ code: p.code, step: 'detail', status: detRes.status });
          continue;
        }
        const prod = (await detRes.json())?.data;
        const imageUrl = await resolveImage(supabase, tenant_id, blingId, prod);

        if (!imageUrl) { results.no_image++; continue; }

        await supabase.from('products').update({ bling_product_id: blingId, image_url: imageUrl }).eq('id', p.id);
        results.updated++;

        const { data: kids } = await supabase
          .from('products')
          .update({ image_url: imageUrl })
          .eq('tenant_id', tenant_id)
          .eq('parent_product_id', p.id)
          .is('image_url', null)
          .select('id');
        results.children_updated += kids?.length || 0;
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
