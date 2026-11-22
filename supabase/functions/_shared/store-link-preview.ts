interface PreviewContext {
  supabaseUrl: string;
  publicKey: string;
  fetcher?: typeof fetch;
}

export interface StoreLinkPreview {
  linkPreview: boolean;
  linkPreviewTitle?: string;
  linkPreviewDescription?: string;
  linkPreviewImage?: string;
  linkPreviewLarge?: boolean;
}

/** Only brand the first link, which is the link UazAPI uses for its card. */
export async function storeLinkPreview(text: string, context: PreviewContext): Promise<StoreLinkPreview | undefined> {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return undefined;
  let slug: string;
  try {
    const link = new URL(match[0].replace(/[)\],.!*]+$/, ''));
    if (link.origin !== 'https://app.cartzy.com.br') return undefined;
    const path = link.pathname.match(/^\/t\/([a-z0-9][a-z0-9_-]*)\//i);
    if (!path) return undefined;
    slug = path[1].toLowerCase();
  } catch { return undefined; }

  // Never fall back to the platform card when this store has no usable logo.
  const noCard = { linkPreview: false };
  if (!context.supabaseUrl || !context.publicKey) return noCard;
  try {
    const endpoint = new URL('/rest/v1/tenants_public', context.supabaseUrl);
    endpoint.search = new URLSearchParams({
      select: 'name,logo_url', slug: `eq.${slug}`, is_active: 'eq.true', limit: '1',
    }).toString();
    const response = await (context.fetcher || fetch)(endpoint, {
      headers: { apikey: context.publicKey, Authorization: `Bearer ${context.publicKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return noCard;
    const rows = await response.json();
    const store = Array.isArray(rows) ? rows[0] : null;
    if (!store || typeof store.name !== 'string' || !store.name.trim() || typeof store.logo_url !== 'string') return noCard;
    const image = new URL(store.logo_url);
    if (image.protocol !== 'https:') return noCard;
    return {
      linkPreview: true,
      linkPreviewTitle: store.name.trim(),
      // UazAPI treats an empty string as automatic fallback; a space suppresses it.
      linkPreviewDescription: ' ',
      linkPreviewImage: image.href,
      linkPreviewLarge: true,
    };
  } catch {
    // Keep the message deliverable, without leaking the Cartzy fallback card.
    return noCard;
  }
}
