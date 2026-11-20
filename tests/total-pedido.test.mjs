// Etapa 4.3 (P-07): total do pedido numa regra só (_shared/order-totals.ts), usada pela cobrança, pela loja da live
// e pelo checkout público. Aqui ela é comparada, centavo por centavo, com as contas que existiam antes em cada lugar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOrderTotals, pixDiscountPerOrder, round2 } from '../supabase/functions/_shared/order-totals.ts';

// ---- contas ANTIGAS, copiadas do código antes da etapa 4.3 ----
// create-payment: Pix por pedido = round(subtotal × %) centavos; total por pedido = max(0, sub − pix − cupom) + frete(1º)
const servidorAntigo = (subs, pct, cupons, frete) => subs.reduce((acc, s, i) => {
  const pix = (pct > 0 ? Math.round(s * pct) : 0) / 100;
  return acc + Math.max(0, s - pix - (cupons[i] || 0)) + (i === 0 ? frete : 0);
}, 0);
const pixServidorAntigo = (subs, pct) => subs.reduce((a, s) => a + (pct > 0 ? Math.round(s * pct) : 0) / 100, 0);
// loja da live (depois do P-09, antes do 4.3)
const livePixAntigo = (s, pct) => (pct > 0 ? Math.round((s * pct) / 100 * 100) / 100 : 0);
// checkout público antes do 4.3: Pix sobre (soma dos pedidos − promoção), arredondado uma vez só
const publicoPixAntigo = (subs, promo, pct) => {
  const base = Math.max(0, subs.reduce((a, b) => a + b, 0) - promo);
  return pct > 0 ? Math.round((base * pct / 100) * 100) / 100 : 0;
};

// gerador determinístico
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const preco = () => round2(1 + rnd() * 400);
const pcts = [0, 2, 3, 5, 7.5, 10, 12, 15];

test('Pix por pedido: igual à conta da cobrança em 20.000 casos', () => {
  for (let k = 0; k < 20000; k++) {
    const subs = Array.from({ length: 1 + Math.floor(rnd() * 3) }, preco);
    const pct = pcts[k % pcts.length];
    const novo = pixDiscountPerOrder(subs, pct);
    subs.forEach((s, i) => assert.equal(novo[i], (pct > 0 ? Math.round(s * pct) : 0) / 100));
    assert.equal(computeOrderTotals({ orderSubtotals: subs, method: 'pix', pixPercent: pct }).pixDiscount, round2(pixServidorAntigo(subs, pct)));
  }
});

test('total da tela = total cobrado (pedido único, com e sem cupom e frete) em 20.000 casos', () => {
  for (let k = 0; k < 20000; k++) {
    const s = preco(); const pct = pcts[k % pcts.length];
    const cupom = rnd() < 0.5 ? round2(rnd() * s * 0.5) : 0;
    const frete = rnd() < 0.7 ? round2(rnd() * 40) : 0;
    const t = computeOrderTotals({ orderSubtotals: [s], method: 'pix', pixPercent: pct, couponDiscount: cupom, shipping: frete });
    assert.equal(t.total, round2(servidorAntigo([s], pct, [cupom], frete)), `s=${s} pct=${pct} cupom=${cupom} frete=${frete}`);
  }
});

test('loja da live: a conta nova bate com a antiga (diferença no máximo de 1 centavo por arredondamento de ponto flutuante, e a nova é a da cobrança)', () => {
  let diferentes = 0;
  for (let k = 0; k < 20000; k++) {
    const s = preco(); const pct = pcts[k % pcts.length];
    const novo = pixDiscountPerOrder([s], pct)[0];
    const antigo = livePixAntigo(s, pct);
    assert.ok(Math.abs(novo - antigo) <= 0.010001, `s=${s} pct=${pct}`);
    if (novo !== antigo) diferentes++;
    assert.equal(novo, (pct > 0 ? Math.round(s * pct) : 0) / 100, 'nova = cobrança');
  }
  assert.ok(diferentes < 200, `casos com 1 centavo de diferença: ${diferentes}`);
});

test('checkout público SEM promoção: igual ao antigo em 1 pedido; com vários pedidos passa a arredondar por pedido como a cobrança', () => {
  for (let k = 0; k < 10000; k++) {
    const subs = Array.from({ length: 1 + Math.floor(rnd() * 3) }, preco);
    const pct = pcts[k % pcts.length];
    const novo = computeOrderTotals({ orderSubtotals: subs, method: 'pix', pixPercent: pct }).pixDiscount;
    if (subs.length === 1) assert.ok(Math.abs(novo - publicoPixAntigo(subs, 0, pct)) <= 0.010001);
    assert.equal(novo, round2(pixServidorAntigo(subs, pct)), 'sempre igual à cobrança');
  }
});

test('checkout público COM "leve X pague Y": antes a tela dava MENOS desconto Pix do que a cobrança; agora é igual', () => {
  const subs = [300]; const promo = 100; const pct = 10;
  const telaAntiga = publicoPixAntigo(subs, promo, pct);                 // 10% de 200 = 20
  const cobranca = pixServidorAntigo(subs, pct);                          // 10% de 300 = 30
  const novo = computeOrderTotals({ orderSubtotals: subs, method: 'pix', pixPercent: pct, promoDiscount: promo }).pixDiscount;
  assert.equal(telaAntiga, 20);
  assert.equal(cobranca, 30);
  assert.equal(novo, 30, 'tela agora mostra o que é cobrado');
});

test('cartão e retirada não têm desconto Pix; total nunca fica negativo antes do frete', () => {
  assert.equal(computeOrderTotals({ orderSubtotals: [100], method: 'card', pixPercent: 10 }).pixDiscount, 0);
  assert.equal(computeOrderTotals({ orderSubtotals: [100], method: 'pay_on_pickup', pixPercent: 10 }).total, 100);
  assert.equal(computeOrderTotals({ orderSubtotals: [50], method: 'pix', pixPercent: 10, couponDiscount: 80, shipping: 15 }).total, 15);
});
