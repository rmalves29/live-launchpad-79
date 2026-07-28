import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const limit = Math.min(Math.max(body.limit || 50, 1), 100);

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
    console.error(`[${timestamp}] [instagram-sync-live-comments] live_media error for tenant ${integration.tenant_id}:`, mediaJson);
    result.errors.push(message);
    return result;
  }

  const mediaItems = Array.isArray(mediaJson?.data) ? mediaJson.data as GraphMedia[] : [];
  result.media = mediaItems.length;

  for (const media of mediaItems) {
    const commentsUrl = `https://graph.instagram.com/v21.0/${media.id}/comments?fields=id,text,username,timestamp,from{id,username}&limit=${limit}&access_token=${encodeURIComponent(token)}`;
    const commentsResponse = await fetch(commentsUrl);
    const commentsJson = await commentsResponse.json().catch(() => ({}));

    if (!commentsResponse.ok) {
      const message = commentsJson?.error?.message || `Erro ${commentsResponse.status} ao buscar comentários da mídia ${media.id}`;
      console.error(`[${timestamp}] [instagram-sync-live-comments] comments error for media ${media.id}:`, commentsJson);
      result.errors.push(message);
      continue;
    }

    const comments = Array.isArray(commentsJson?.data) ? commentsJson.data as GraphComment[] : [];
    comments.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    result.comments_seen += comments.length;

    const commentIds = comments.map((comment) => comment.id).filter(Boolean);
    const existingIds = new Set<string>();
    if (commentIds.length > 0) {
      const { data: existingRows, error: existingError } = await supabase
        .from('instagram_live_comments')
        .select('comment_id')
        .eq('tenant_id', integration.tenant_id)
        .in('comment_id', commentIds);

      if (existingError) {
        console.warn(`[${timestamp}] [instagram-sync-live-comments] duplicate check failed:`, existingError.message);
      } else {
        for (const row of existingRows || []) {
          if (row.comment_id) existingIds.add(row.comment_id);
        }
      }
    }

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
        headers: { 'Content-Type': 'application/json' },
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