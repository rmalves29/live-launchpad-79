interface ShareTenant {
  name: string;
  slug: string;
  logo_url: string | null;
}

/** Lovable pre-renders these tags for verified social-preview crawlers. */
export function applyTenantShareMetadata(doc: Document, tenant: ShareTenant | null) {
  const previousTitle = doc.title;
  const changed: Array<{ selector: string; originals: Element[] }> = [];
  const title = tenant?.name || 'Cadastro';
  let image: string | null = null;
  try {
    const url = new URL(tenant?.logo_url || '');
    if (url.protocol === 'https:') image = url.href;
  } catch { /* A store without a logo must never inherit the platform image. */ }

  function meta(attribute: 'name' | 'property', key: string, content: string | null) {
    const selector = `meta[${attribute}="${key}"]`;
    const originals = Array.from(doc.head.querySelectorAll(selector));
    changed.push({ selector, originals });
    originals.forEach(node => node.remove());
    if (content === null) return;
    const node = doc.createElement('meta');
    node.setAttribute(attribute, key);
    node.setAttribute('content', content);
    doc.head.appendChild(node);
  }

  doc.title = title;
  meta('name', 'description', '');
  meta('name', 'author', null);
  meta('property', 'og:title', title);
  meta('property', 'og:site_name', title);
  meta('property', 'og:type', 'website');
  meta('property', 'og:url', tenant
    ? `https://app.cartzy.com.br/t/${encodeURIComponent(tenant.slug)}/cadastro-instagram`
    : null);
  meta('property', 'og:description', '');
  meta('property', 'og:image', image);
  meta('property', 'og:image:alt', image ? title : null);
  // The platform's fixed 512x512 dimensions do not describe the store's logo.
  for (const key of ['og:image:width', 'og:image:height', 'og:image:secure_url', 'og:image:type']) {
    meta('property', key, null);
  }
  meta('name', 'twitter:card', 'summary');
  meta('name', 'twitter:title', title);
  meta('name', 'twitter:description', '');
  meta('name', 'twitter:image', image);

  return () => {
    doc.title = previousTitle;
    for (const { selector, originals } of changed) {
      doc.head.querySelectorAll(selector).forEach(node => node.remove());
      originals.forEach(node => doc.head.appendChild(node));
    }
  };
}
