import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_PAGES = 5;

// Nunca grava access_token em log.
function redactToken(text: string) {
  return text.replace(/access_token=[^&\s"]+/g, 'access_token=[REDACTED]');
}

interface RequestBody {
  tenant_id?: string;
  limit?: number;
}

interface InstagramIntegrationRecord {
  tenant_id: string;
  page_id: string | null;
  instagram_account_id: string | null;
  instagram_username: string | null;
  access_token: string | null;
  page_access_token: string | null;
}

interface GraphComment {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  from?: {
    id?: string;
    username?: string;
  };
}

interface GraphMedia {
  id: string;
  media_product_type?: string;
  status?: string;
  comments_count?: number;
  timestamp?: string;
  permalink?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const timestamp = new Date().toISOString();

  try {
    const body = await readBody(req);
    const tenantId = body.tenant_id?.trim();
    const limit = Math.min(Math.max(body.limit || 100, 1), 100);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let integrationsQuery = supabase
      .from('integration_instagram')
      .select('tenant_id, page_id, instagram_account_id, instagram_username, access_token, page_access_token')
      .eq('is_active', true)
      .not('access_token', 'is', null);

    if (tenantId) {
      integrationsQuery = integrationsQuery.eq('tenant_id', tenantId);
    }

    const { data: integrations, error: integrationError } = await integrationsQuery;
    if (integrationError) {
      console.error(`[${timestamp}] [instagram-sync-live-comments] Integration query error:`, integrationError);
      return jsonResponse({ success: false, error: integrationError.message }, 200);
    }

    const results = [];
    for (const integration of (integrations || []) as InstagramIntegrationRecord[]) {
      results.push(await syncIntegration(supabase, supabaseUrl, integration, limit, timestamp));
    }

    const summary = results.reduce(
      (acc, item) => {
        acc.media += item.media;
        acc.comments_seen += item.comments_seen;
        acc.comments_processed += item.comments_processed;
        acc.comments_skipped += item.comments_skipped;
        acc.errors += item.errors.length;
        return acc;
      },
      { media: 0, comments_seen: 0, comments_processed: 0, comments_skipped: 0, errors: 0 },
    );

    return jsonResponse({ success: true, summary, results }, 200);
  } catch (error: any) {
    console.error(`[${timestamp}] [instagram-sync-live-comments] Unexpected error:`, error?.message || error);
    return jsonResponse({ success: false, error: error?.message || 'Erro inesperado' }, 200);
  }
});

async function syncIntegration(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  integration: InstagramIntegrationRecord,
  limit: number,
  timestamp: string,
) {
  const token = integration.access_token || integration.page_access_token;
  const result = {
    tenant_id: integration.tenant_id,
    instagram_username: integration.instagram_username,
    media: 0,
    comments_seen: 0,
    comments_processed: 0,
    comments_skipped: 0,
    errors: [] as string[],
  };

  if (!token) {
    result.errors.push('Token ausente');
    return result;
  }

  const mediaUrl = `https://graph.instagram.com/v21.0/me/live_media?fields=id,media_product_type,status,comments_count,timestamp,permalink&limit=10&access_token=${encodeURIComponent(token)}`;
  const mediaResponse = await fetch(mediaUrl);
  const mediaJson = await mediaResponse.json().catch(() => ({}));

  if (!mediaResponse.ok) {
    const message = mediaJson?.error?.message || `Erro ${mediaResponse.status} ao buscar live_media`;
    console.error(`[${timestamp}] [instagram-sync-live-comments] live_media error for tenant ${integration.tenant_id}:`, redactToken(JSON.stringify(mediaJson)));
    result.errors.push(message);
    return result;
  }

  const mediaItems = Array.isArray(mediaJson?.data) ? mediaJson.data as GraphMedia[] : [];
  result.media = mediaItems.length;

  await trackLives(supabase, integration.tenant_id, mediaItems, timestamp);


  for (const media of mediaItems) {
    // Busca paginada (até MAX_PAGES x 100): em lives movimentadas, mais de 100 comentários novos
    // por minuto não ficam de fora. Para quando uma página inteira já foi processada.
    let nextUrl: string | null = `https://graph.instagram.com/v21.0/${media.id}/comments?fields=id,text,username,timestamp,from{id,username}&limit=${limit}&access_token=${encodeURIComponent(token)}`;
    const comments: GraphComment[] = [];
    const existingIds = new Set<string>();
    let pages = 0;
    let fetchFailed = false;

    while (nextUrl && pages < MAX_PAGES) {
      pages += 1;
      const commentsResponse = await fetch(nextUrl);
      const commentsJson = await commentsResponse.json().catch(() => ({}));

      if (!commentsResponse.ok) {
        const message = commentsJson?.error?.message || `Erro ${commentsResponse.status} ao buscar comentários da mídia ${media.id}`;
        console.error(`[${timestamp}] [instagram-sync-live-comments] comments error for media ${media.id}:`, redactToken(JSON.stringify(commentsJson)));
        result.errors.push(message);
        fetchFailed = true;
        break;
      }

      const pageComments = Array.isArray(commentsJson?.data) ? commentsJson.data as GraphComment[] : [];
      result.comments_seen += pageComments.length;

      const pageIds = pageComments.map((comment) => comment.id).filter(Boolean);
      const pageExisting = new Set<string>();
      if (pageIds.length > 0) {
        const { data: existingRows, error: existingError } = await supabase
          .from('instagram_live_comments')
          .select('comment_id')
          .eq('tenant_id', integration.tenant_id)
          .in('comment_id', pageIds);

        if (existingError) {
          console.warn(`[${timestamp}] [instagram-sync-live-comments] duplicate check failed:`, existingError.message);
        } else {
          for (const row of existingRows || []) {
            if (row.comment_id) {
              pageExisting.add(row.comment_id);
              existingIds.add(row.comment_id);
            }
          }
        }
      }

      comments.push(...pageComments.filter((c) => c.id && !pageExisting.has(c.id)));

      // Página sem nenhum comentário novo => o resto é histórico já processado.
      if (pageComments.length === 0 || pageExisting.size === pageIds.length) break;
      nextUrl = commentsJson?.paging?.next || null;
    }

    if (fetchFailed && comments.length === 0) continue;

    // Processa do mais antigo para o mais novo: quem comentou primeiro leva a peça.
    comments.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

    for (const comment of comments) {
      if (!comment.id || existingIds.has(comment.id)) {
        result.comments_skipped += 1;
        continue;
      }

      const username = comment.username || comment.from?.username || '';
      const userId = comment.from?.id || username || comment.id;
      const webhookPayload = {
        object: 'instagram',
        entry: [
          {
            id: integration.page_id || integration.instagram_account_id || 'me',
            time: comment.timestamp ? Math.floor(new Date(comment.timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000),
            changes: [
              {
                field: 'live_comments',
                value: {
                  from: {
                    id: String(userId),
                    username,
                  },
                  media: {
                    id: media.id,
                    media_product_type: 'LIVE',
                  },
                  id: comment.id,
                  text: comment.text || '',
                  timestamp: comment.timestamp,
                },
              },
            ],
          },
        ],
      };

      const webhookResponse = await fetch(`${supabaseUrl}/functions/v1/instagram-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
        body: JSON.stringify(webhookPayload),
      });
      const responseText = await webhookResponse.text();

      if (!webhookResponse.ok) {
        const message = `Webhook retornou ${webhookResponse.status}: ${responseText.slice(0, 300)}`;
        console.error(`[${timestamp}] [instagram-sync-live-comments] ${message}`);
        result.errors.push(message);
        continue;
      }

      existingIds.add(comment.id);
      result.comments_processed += 1;
    }
  }

  return result;
}

async function trackLives(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  mediaItems: GraphMedia[],
  timestamp: string,
) {
  const nowIso = new Date().toISOString();
  const activeIds: string[] = [];

  for (const media of mediaItems) {
    if (!media.id) continue;
    activeIds.push(media.id);

    const startedAt = media.timestamp ? new Date(media.timestamp).toISOString() : nowIso;

    const { data: existing } = await supabase
      .from('instagram_lives')
      .select('id, started_at')
      .eq('tenant_id', tenantId)
      .eq('media_id', media.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('instagram_lives')
        .update({
          last_seen_at: nowIso,
          status: media.status || 'LIVE',
          permalink: media.permalink || null,
          comments_count_api: media.comments_count ?? null,
          ended_at: null,
        })
        .eq('id', existing.id);
      if (error) console.warn(`[${timestamp}] [instagram-sync-live-comments] live update failed:`, error.message);
    } else {
      const { error } = await supabase.from('instagram_lives').insert({
        tenant_id: tenantId,
        media_id: media.id,
        started_at: startedAt,
        last_seen_at: nowIso,
        status: media.status || 'LIVE',
        permalink: media.permalink || null,
        comments_count_api: media.comments_count ?? null,
      });
      if (error) console.warn(`[${timestamp}] [instagram-sync-live-comments] live insert failed:`, error.message);
    }
  }

  // Encerra lives que não aparecem mais na listagem ativa


  const { data: toClose } = await supabase
    .from('instagram_lives')
    .select('id, last_seen_at, media_id')
    .eq('tenant_id', tenantId)
    .is('ended_at', null);

  for (const row of toClose || []) {
    if (activeIds.includes(row.media_id as string)) continue;
    const { error } = await supabase
      .from('instagram_lives')
      .update({ ended_at: row.last_seen_at, status: 'ENDED' })
      .eq('id', row.id);
    if (error) console.warn(`[${timestamp}] [instagram-sync-live-comments] live close failed:`, error.message);
  }
}

async function readBody(req: Request): Promise<RequestBody> {

  if (req.method !== 'POST') return {};
  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as RequestBody;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}