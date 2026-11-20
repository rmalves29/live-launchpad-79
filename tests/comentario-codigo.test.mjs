// Etapa 4.2: a leitura do código de produto no comentário (o que decide se o comentário vira pedido) saiu de dentro do
// zapi-webhook para _shared/live-comment-codes.ts. Aqui a regra nova é comparada com a cópia literal da antiga.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractProductEntries, isProductBroadcastMessage } from '../supabase/functions/_shared/live-comment-codes.ts';
import { lerComentarioAntigo } from './fixtures/comentario-antigo.ts';

const nova = (t) => ({ isBroadcastMessage: isProductBroadcastMessage(t), productEntries: isProductBroadcastMessage(t) ? [] : extractProductEntries(t) });

const exemplos = [
  'C210', 'c210', 'C210x2', 'C210 x 2', '2xC210', '2 x C210', 'quero C210 e C211', 'C370/24', 'C014-1', 'T002-01x3',
  'C370/24 e C370', 'eu quero o c 210', 'C210X2 c211 3xC212', 'SKU123', 'quero 2 C210', 'C210x150', 'C210x0',
  'oi tudo bem?', '', '🛍️ Para comprar, digite apenas o código: C890', '🛍️ C890 lindo!', 'Para comprar digite C890',
  'C1234567', 'AB12/3-4', 'c1 c2 c3 c4 c5', 'C210, C210', '10x C99', 'kit C10/1 C10/2 C10', 'R$ 89,90 C210',
];

test('exemplos de comentários reais: regra nova = regra antiga', () => {
  for (const t of exemplos) assert.deepEqual(nova(t), lerComentarioAntigo(t), JSON.stringify(t));
});

test('50.000 comentários gerados: regra nova = regra antiga', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pedacos = ['C', 'c', 'T', 'SKU', 'P', 'x', 'X', ' ', '  ', '2', '10', '150', '/', '-', '24', '01', 'quero ', 'e ', ',', '🛍️', 'para comprar digite ', '\n', '0', '999999', 'ab'];
  for (let k = 0; k < 50000; k++) {
    let t = '';
    const n = 1 + Math.floor(rnd() * 12);
    for (let i = 0; i < n; i++) t += pedacos[Math.floor(rnd() * pedacos.length)] + (rnd() < 0.5 ? String(Math.floor(rnd() * 1000)) : '');
    assert.deepEqual(nova(t), lerComentarioAntigo(t), JSON.stringify(t));
  }
});

test('o que a loja espera ver: códigos, quantidade e variantes', () => {
  assert.deepEqual(extractProductEntries('C210x2 e 3xC211'), [{ code: 'C210', qty: 2 }, { code: 'C211', qty: 3 }]);
  assert.deepEqual(extractProductEntries('C370/24'), [{ code: 'C370/24', qty: 1 }], 'variante não vira também o código pai');
  assert.deepEqual(extractProductEntries('c210x150'), [{ code: 'C210', qty: 99 }], 'quantidade limitada a 99');
  assert.equal(isProductBroadcastMessage('🛍️ Para comprar, digite apenas o código: C890'), true, 'divulgação não vira pedido');
});
