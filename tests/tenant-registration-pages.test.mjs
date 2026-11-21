import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTenantRegistrationHtml, tenantRegistrationPages } from '../scripts/tenant-registration-pages.mjs';

const template = `<html><head><title>Cartzy</title>
<meta name="description" content="Platform description">
<meta property="og:title" content="Cartzy"><meta property="og:image" content="https://app.cartzy.com.br/favicon.png">
<meta property="og:image:height" content="512"><meta name="twitter:title" content="Cartzy">
<script type="module" src="/assets/index-123.js"></script><link rel="stylesheet" href="/assets/index.css"></head><body><div id="root"></div></body></html>`;
const grandame = { slug: 'lagrandame', name: 'La Grandame', logo_url: 'https://example.com/la-grandame.jpg' };

test('raw HTML, without running scripts, contains only store branding and no description', () => {
  const html = renderTenantRegistrationHtml(template, grandame);
  assert.match(html, /<title>La Grandame<\/title>/);
  assert.match(html, /property="og:image" content="https:\/\/example.com\/la-grandame.jpg"/);
  assert.equal((html.match(/property="og:title"/g) || []).length, 1);
  assert.doesNotMatch(html, /Cartzy|Platform description|favicon.png|og:image:height/);
  assert.match(html, /property="og:description" content=""/);
  assert.match(html, /\/assets\/index-123.js/);
  assert.match(html, /\/assets\/index.css/);
});

test('build emits independent directory and explicit share URLs for each store', async () => {
  const plugin = tenantRegistrationPages(async () => [grandame, { slug: 'outra', name: 'Outra Loja', logo_url: null }]);
  const files = [];
  await plugin.generateBundle.call({ emitFile: file => files.push(file) }, {}, { 'index.html': { type: 'asset', source: template } });
  assert.deepEqual(files.map(f => f.fileName), [
    't/lagrandame/cadastro-instagram/index.html', 't/lagrandame/cadastro-instagram.html',
    't/outra/cadastro-instagram/index.html', 't/outra/cadastro-instagram.html',
  ]);
  assert.doesNotMatch(files[2].source, /La Grandame|og:image|twitter:image/);
  assert.match(files[1].source, /history.replaceState/);
  assert.match(files[1].source, /property="og:url" content="https:\/\/app.cartzy.com.br\/t\/lagrandame\/cadastro-instagram.html"/);
});

test('escapes store data and rejects unsafe slugs and image protocols', () => {
  const html = renderTenantRegistrationHtml(template, { ...grandame, name: 'A "B" <script> & C', logo_url: 'javascript:alert(1)' });
  assert.match(html, /A &quot;B&quot; &lt;script&gt; &amp; C/);
  assert.doesNotMatch(html, /javascript:|og:image/);
  assert.throws(() => renderTenantRegistrationHtml(template, { ...grandame, slug: '../outside' }));
});
