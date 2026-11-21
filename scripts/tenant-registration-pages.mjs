import { readFile } from 'node:fs/promises';

const origin = 'https://app.cartzy.com.br';
const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function renderTenantRegistrationHtml(template, tenant) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(tenant.slug) || !tenant.name?.trim()) {
    throw new Error('Invalid public store branding');
  }
  const name = escapeHtml(tenant.name.trim());
  const route = `/t/${tenant.slug}/cadastro-instagram`;
  let image = '';
  try {
    const url = new URL(tenant.logo_url);
    if (url.protocol === 'https:') image = url.href;
  } catch { /* No platform logo fallback for stores without a logo. */ }

  // These tags must be in the HTTP response, before any JavaScript runs.
  const metadata = `<title>${name}</title>
    <meta name="cartzy:share-rendering" content="static" />
    <meta name="description" content="" />
    <meta property="og:title" content="${name}" />
    <meta property="og:site_name" content="${name}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${origin}${route}.html" />
    <meta property="og:description" content="" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${name}" />
    <meta name="twitter:description" content="" />
    ${image ? `<meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:image:alt" content="${name}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />` : ''}
    <script>
      // The explicit .html share link opens the existing React registration route.
      if (location.pathname.endsWith('/cadastro-instagram.html')) {
        history.replaceState(null, '', ${JSON.stringify(route)} + location.search + location.hash);
      }
    </script>`;

  return template
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*>/gi, tag =>
      /\b(?:name|property)\s*=\s*["'](?:description|author|og:[^"']+|twitter:[^"']+)["']/i.test(tag) ? '' : tag)
    .replace('</head>', `${metadata}\n</head>`);
}

async function loadActiveBrands() {
  // Reuse only the public client configuration, never server-side credentials.
  const client = await readFile(new URL('../src/integrations/supabase/client.ts', import.meta.url), 'utf8');
  const url = client.match(/const SUPABASE_URL\s*=\s*"([^"]+)"/)?.[1];
  const key = client.match(/const SUPABASE_PUBLISHABLE_KEY\s*=\s*"([^"]+)"/)?.[1];
  if (!url || !key) throw new Error('Public Supabase configuration not found');
  const stores = [];
  for (let offset = 0; ; offset += 1000) {
    const endpoint = new URL('/rest/v1/tenants_public', url);
    endpoint.search = new URLSearchParams({ select: 'slug,name,logo_url', is_active: 'eq.true', order: 'slug.asc', limit: '1000', offset: String(offset) }).toString();
    const response = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Public store branding unavailable (${response.status})`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('Invalid public store branding response');
    stores.push(...page);
    if (page.length < 1000) return stores;
  }
}

export function tenantRegistrationPages(loadBrands = loadActiveBrands) {
  return {
    name: 'tenant-registration-pages',
    apply: 'build',
    enforce: 'post',
    async generateBundle(_options, bundle) {
      const template = bundle['index.html'];
      if (!template || template.type !== 'asset') throw new Error('Built index.html not found');
      const brands = await loadBrands();
      for (const tenant of brands) {
        const source = renderTenantRegistrationHtml(String(template.source), tenant);
        // Directory index supports clean URLs; .html also works on SPA-only hosts.
        for (const fileName of [
          `t/${tenant.slug}/cadastro-instagram/index.html`,
          `t/${tenant.slug}/cadastro-instagram.html`,
        ]) {
          this.emitFile({ type: 'asset', fileName, source });
        }
      }
    },
  };
}
