import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MANIA_DE_MULHER_TENANT_ID = '08f2b1b9-3988-489e-8186-c60f0c0b0622';

interface RequestBody {
  tenant_id: string;
}

interface InstagramMediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  comments_count?: number;
  like_count?: number;
  media_product_type?: string;
}

interface InstagramCommentItem {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const timestamp = new Date().toISOString();

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Não autenticado' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      console.error(`[${timestamp}] [instagram-post-comments] Invalid token:`, userError?.message);
      return jsonResponse({ error: 'Token inválido ou expirado' }, 401);
    }

    const body = await req.json() as RequestBody;
    const tenantId = body.tenant_id;

    if (!tenantId) {
      return jsonResponse({ error: 'tenant_id é obrigatório' }, 400);
    }

    if (tenantId !== MANIA_DE_MULHER_TENANT_ID) {
      return jsonResponse({ error: 'Função disponível apenas para a empresa Mania de Mulher' }, 403);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tenant_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error(`[${timestamp}] [instagram-post-comments] Profile error:`, profileError);
      return jsonResponse({ error: 'Perfil não encontrado' }, 403);
    }

    const isSuperAdmin = profile.role === 'super_admin';
    if (!isSuperAdmin && profile.tenant_id !== tenantId) {
      return jsonResponse({ error: 'Sem permissão para acessar esta empresa' }, 403);
    }

    const { data: integration, error: integrationError } = await supabase
      .from('integration_instagram')
      .select('instagram_account_id, page_access_token, access_token, instagram_username, is_active')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (integrationError || !integration) {
      console.error(`[${timestamp}] [instagram-post-comments] Integration error:`, integrationError);
      return jsonResponse({ error: 'Integração do Instagram não encontrada ou inativa' }, 400);
    }

    const accessToken = integration.page_access_token || integration.access_token;
    if (!integration.instagram_account_id || !accessToken) {
      return jsonResponse({ error: 'Conta do Instagram sem credenciais suficientes para buscar postagens' }, 400);
    }

    console.log(`[${timestamp}] [instagram-post-comments] Fetching media for account: ${integration.instagram_account_id}, token length: ${accessToken.length}`);

    const mediaResponse = await fetch(
      `https://graph.instagram.com/v21.0/${integration.instagram_account_id}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count,media_product_type&limit=12&access_token=${encodeURIComponent(accessToken)}`
    );

    const mediaJson = await mediaResponse.json();

    if (!mediaResponse.ok) {
      console.error(`[${timestamp}] [instagram-post-comments] Media fetch error:`, mediaJson);
      return jsonResponse({
        error: mediaJson?.error?.message || 'Erro ao buscar postagens do Instagram',
      }, mediaResponse.status);
    }

    const mediaItems = Array.isArray(mediaJson?.data) ? mediaJson.data as InstagramMediaItem[] : [];
    const posts = mediaItems.filter((item) => item.media_product_type !== 'LIVE');

    const postsWithComments = await Promise.all(
      posts.map(async (post) => {
        const commentsResponse = await fetch(
          `https://graph.instagram.com/v21.0/${post.id}/comments?fields=id,text,username,timestamp&limit=50&access_token=${encodeURIComponent(accessToken)}`
        );

        const commentsJson = await commentsResponse.json().catch(() => ({}));
        const comments = commentsResponse.ok && Array.isArray(commentsJson?.data)
          ? commentsJson.data as InstagramCommentItem[]
          : [];

        return {
          ...post,
          comments,
        };
      })
    );

    return jsonResponse({
      account_username: integration.instagram_username,
      posts: postsWithComments,
    });
  } catch (error: any) {
    console.error('[instagram-post-comments] Error:', error?.message || error);
    return jsonResponse({ error: 'Erro interno ao buscar comentários das postagens' }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
