import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTenantShareMetadata } from '../src/lib/tenant-share-metadata.ts';

// Minimal DOM fixture for the head mutation API; no React or network required.
function documentFixture() {
  const nodes = [];
  const doc = {
    title: 'Cartzy - Gest�o de Pedidos',
    createElement() {
      return { attributes: {}, setAttribute(k, v) { this.attributes[k] = v; },
        remove() { const i = nodes.indexOf(this); if (i >= 0) nodes.splice(i, 1); } };
    },
    head: {
      appendChild(node) { nodes.push(node); },
      querySelectorAll(selector) {
        const [, key, value] = selector.match(/^meta\[(name|property)="([^"]+)"\]$/);
        return nodes.filter(node => node.attributes[key] === value);
      },
    },
  };
  const add = (attribute, key, value) => {
    const node = doc.createElement('meta');
    node.setAttribute(attribute, key); node.setAttribute('content', value);
    doc.head.appendChild(node);
  };
  add('property', 'og:title', 'Cartzy');
  add('property', 'og:title', 'Duplicate platform title');
  add('property', 'og:image', 'https://app.cartzy.com.br/favicon.png');
  add('property', 'og:image:width', '512');
  add('property', 'og:description', 'Sistema completo de gest�o de pedidos');
  add('name', 'description', 'Sistema completo de gest�o de pedidos');
  add('name', 'twitter:image', 'https://app.cartzy.com.br/favicon.png');
  return { doc, nodes, values: (attribute, key) =>
    doc.head.querySelectorAll(`meta[${attribute}="${key}"]`).map(n => n.attributes.content) };
}

const store = { name: 'La Grandame', slug: 'lagrandame', logo_url: 'https://example.com/la-grandame.jpg' };

test('preview has only the store name/logo, no platform or description; leaving restores defaults', () => {
  const { doc, nodes, values } = documentFixture();
  const original = nodes.map(n => ({ ...n.attributes }));
  const cleanup = applyTenantShareMetadata(doc, store);
  assert.equal(doc.title, 'La Grandame');
  assert.deepEqual(values('property', 'og:title'), ['La Grandame']);
  assert.deepEqual(values('property', 'og:site_name'), ['La Grandame']);
  assert.deepEqual(values('property', 'og:image'), [store.logo_url]);
  assert.deepEqual(values('name', 'twitter:image'), [store.logo_url]);
  assert.deepEqual(values('property', 'og:description'), ['']);
  assert.deepEqual(values('name', 'description'), ['']);
  assert.deepEqual(values('property', 'og:image:width'), []);
  assert.deepEqual(values('property', 'og:url'), ['https://app.cartzy.com.br/t/lagrandame/cadastro-instagram']);
  cleanup();
  assert.equal(doc.title, 'Cartzy - Gest�o de Pedidos');
  const sorted = list => list.map(attributes => JSON.stringify(attributes)).sort();
  assert.deepEqual(sorted(nodes.map(n => n.attributes)), sorted(original));
});

test('loading, unknown stores and stores without a safe logo never inherit another brand', () => {
  for (const tenant of [null, { ...store, logo_url: null }, { ...store, logo_url: 'javascript:alert(1)' }]) {
    const { doc, values } = documentFixture();
    applyTenantShareMetadata(doc, tenant);
    assert.deepEqual(values('property', 'og:image'), []);
    assert.deepEqual(values('name', 'twitter:image'), []);
    assert.deepEqual(values('property', 'og:title'), [tenant?.name || 'Cadastro']);
  }
});

test('changing stores updates both title and image and supports names containing markup as text', () => {
  const { doc, values } = documentFixture();
  applyTenantShareMetadata(doc, store)();
  applyTenantShareMetadata(doc, { ...store, name: 'A & B <Loja>', slug: 'outra', logo_url: 'https://example.com/outra.jpg' });
  assert.deepEqual(values('property', 'og:title'), ['A & B <Loja>']);
  assert.deepEqual(values('property', 'og:image'), ['https://example.com/outra.jpg']);
});
