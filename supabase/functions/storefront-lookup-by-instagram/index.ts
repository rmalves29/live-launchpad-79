// Lookup público: tenta encontrar um cliente do tenant pelo @ do Instagram.
// Não cria nada. Usado pelo modal de identificação progressiva da vitrine pública.
//
// Body: { tenant_slug: string, instagram: string }
// Resp: { found: boolean, phone?: string, instagram?: string, name?: string, blocked?: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeInstagram(ig: string | null | undefined): string | null {
  if (!ig) return null;
  const t = String(ig).trim().replace(/^@+/, '').replace(/\s+/g, '');
  return t || null;
}

// Escape de % e _ para uso seguro em ilike
function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (m) => `\\${m}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const tenant_slug = typeof body?.tenant_slug === 'string' ? body.tenant_slug.trim() : '';
    const instagramRaw = typeof body?.instagram === 'string' ? body.instagram : '';
    const instagram = normalizeInstagram(instagramRaw);

    if (!tenant_slug) return jsonResp({ error: 'tenant_slug obrigatório' }, 400);
    if (!instagram) return jsonResp({ error: 'instagram obrigatório' }, 400);

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
      console.log(`[lookup-instagram] tenant não encontrado: ${tenant_slug}`);
      return jsonResp({ found: false });
    }

    // Busca case-insensitive pelo @ exato (sem wildcards) — escapamos % e _
    const safe = escapeLike(instagram);
    const { data: customer, error } = await supabase
      .from('customers')
      .select('id, phone, instagram, name, is_blocked')
      .eq('tenant_id', tenant.id)
      .ilike('instagram', safe)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[lookup-instagram] query error', error);
      return jsonResp({ found: false });
    }

    if (!customer) {
      console.log(`[lookup-instagram] not found tenant=${tenant.id} ig=${instagram}`);
      return jsonResp({ found: false });
    }

    if (customer.is_blocked) {
      console.log(`[lookup-instagram] blocked tenant=${tenant.id} customer=${customer.id}`);
      return jsonResp({ found: true, blocked: true });
    }

    return jsonResp({
      found: true,
      blocked: false,
      phone: customer.phone,
      instagram: customer.instagram,
      name: customer.name,
    });
  } catch (e) {
    console.error('[storefront-lookup-by-instagram] FATAL', e);
    return jsonResp({ found: false });
  }
});
