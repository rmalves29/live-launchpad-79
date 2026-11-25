// Fase 1: o módulo único de regras (_shared/regras-pedido.ts) faz EXATAMENTE a conta que a tela do checkout do
// sistema fazia. Compara com o código original da tela (lido de dentro de PublicCheckout.tsx), sem cópia à mão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractInnerArrows } from './support/extract.mjs';
import { avaliarCupomCheckout, descontoPromocao, itensParaGateway } from '../supabase/functions/_shared/regras-pedido.ts';

const TELA = 'src/pages/pedidos/PublicCheckout.tsx';
const { computeBogoDiscount } = extractInnerArrows(TELA, ['computeBogoDiscount'], {});

function sorteio(seed) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

async function cupomNaTela(cupom, pedidos, agoraMs) {
  const out = { aplicado: false, desconto: 0 };
  const banco = { from: (t) => { const q = { select: () => q, eq: () => q, neq: () => q, maybeSingle: async () => ({ data: t === 'coupons' ? cupom : null, error: null }), then: (ok) => Promise.resolve({ data: [], error: null }).then(ok) }; return q; } };
  const relogio = Date.now;
  Date.now = () => agoraMs;
  try {
    const { applyCouponToOrders } = extractInnerArrows(TELA, ['applyCouponToOrders'], {
      couponCode: 'CUPOM', setLoadingCoupon() {}, toast() {}, supabase: banco, tenant: { id: 'loja' },
      setAppliedCoupon: (c) => { out.aplicado = c?.appliedType === 'coupon'; }, setCouponDiscount: (v) => { out.desconto = v; }, formatCurrency: String,
    });
    await applyCouponToOrders(pedidos);
  } finally { Date.now = relogio; }
  return out;
}

const PRECOS = [0.99, 2.9, 9.9, 11.11, 14.98, 19.9, 24.9, 34.9, 49.9, 89.9, 149.9];

test('cupom do checkout: módulo único = tela original em 3.000 casos (validade, mínimos, faixas, limite de uso)', async () => {
  const r = sorteio(777);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const base = Date.parse('2026-11-10T12:00:00Z');
  for (let n = 0; n < 3000; n++) {
    const pedidos = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, j) => ({
      id: j + 1, created_at: new Date(base + j * 86_400_000 * (1 + Math.floor(r() * 2))).toISOString(),
      items: Array.from({ length: 1 + Math.floor(r() * 4) }, () => ({ unit_price: pick(PRECOS), qty: 1 + Math.floor(r() * 3) })),
    }));
    const tipo = pick(['percentage', 'fixed', 'progressive']);
    const cupom = {
      code: 'CUPOM', is_active: true, discount_type: tipo,
      discount_value: tipo === 'fixed' ? pick([5, 20, 59.8, 500]) : pick([3, 10, 30]),
      progressive_tiers: tipo === 'progressive' ? [{ min_value: 0, max_value: 99.99, discount: 5 }, { min_value: 100, max_value: null, discount: 12 }] : null,
      min_purchase_amount: r() < 0.25 ? pick([50, 150]) : null, min_items_quantity: r() < 0.2 ? pick([3, 6]) : null,
      starts_at: r() < 0.3 ? new Date(base + 86_400_000 * pick([-1, 0.5, 1.5, 9])).toISOString() : null,
      expires_at: r() < 0.3 ? new Date(base + 86_400_000 * pick([0.5, 2.5, 30])).toISOString() : null,
      usage_limit: r() < 0.15 ? 10 : null, used_count: pick([0, 9, 10, 11]),
    };
    const agora = base + 86_400_000 * pick([0, 1, 3, 5]) + 3_600_000;
    const tela = await cupomNaTela(cupom, pedidos, agora);
    const novo = avaliarCupomCheckout(cupom, pedidos.map((p) => ({ created_at: p.created_at, itens: p.items.map((i) => ({ preco: i.unit_price, qtd: i.qty })) })), agora, 'tela');
    assert.equal(novo.ok, tela.aplicado, `caso ${n}: aplicado diferente`);
    assert.equal(novo.ok ? novo.desconto : 0, tela.aplicado ? tela.desconto : 0, `caso ${n}: desconto diferente (o valor sem arredondar tem de ser idêntico)`);
  }
});

test('cupom na cobrança: o limite de uso só barra quem PASSOU do limite (a tela já somou o uso)', () => {
  const pedidos = [{ created_at: null, itens: [{ preco: 100, qtd: 1 }] }];
  const c = { discount_type: 'percentage', discount_value: 10, usage_limit: 10 };
  assert.equal(avaliarCupomCheckout({ ...c, used_count: 10 }, pedidos, Date.now(), 'tela').ok, false);
  assert.equal(avaliarCupomCheckout({ ...c, used_count: 10 }, pedidos, Date.now(), 'cobranca').ok, true);
  assert.equal(avaliarCupomCheckout({ ...c, used_count: 11 }, pedidos, Date.now(), 'cobranca').ok, false);
});

test('promoção "leve X pague Y" e progressiva: módulo único = tela original em 5.000 carrinhos', () => {
  const r = sorteio(4242);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const PROMOS = [
    [{ name: 'L3P2', category_id: 1, promotion_type: 'bogo', buy_qty: 2, get_qty: 1, discount_percent: 100 }],
    [{ name: '2a50', category_id: 2, promotion_type: 'bogo', buy_qty: 1, get_qty: 1, discount_percent: 50 }],
    [{ name: 'Prog', category_id: 1, promotion_type: 'progressive_qty', tiers: [{ qty: 3, percent: 10 }, { qty: 5, percent: 15 }] }],
    [{ name: 'L3P2', category_id: 1, buy_qty: 2, get_qty: 1, discount_percent: null }, { name: 'Prog2', category_id: 3, promotion_type: 'progressive_qty', tiers: [{ qty: 2, percent: 5 }] }],
  ];
  for (let n = 0; n < 5000; n++) {
    const itens = Array.from({ length: 1 + Math.floor(r() * 6) }, () => ({ unit_price: pick(PRECOS), qty: 1 + Math.floor(r() * 4), category_id: r() < 0.1 ? null : 1 + Math.floor(r() * 3) }));
    const promos = pick(PROMOS);
    const tela = computeBogoDiscount(itens, promos);
    const novo = descontoPromocao(itens.map((i) => ({ preco: i.unit_price, qtd: i.qty, categoria: i.category_id })), promos);
    assert.equal(novo.total, tela.total, `caso ${n}`);
  }
});

test('gateway: a soma dos itens bate no centavo com o alvo, em 20.000 casos (inclui cupom de 100%)', () => {
  const r = sorteio(99);
  for (let n = 0; n < 20000; n++) {
    const linhas = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, i) => ({ nome: `P${i}`, qtd: 1 + Math.floor(r() * 4), centavos: 1 + Math.floor(r() * 20000) }));
    const cheio = linhas.reduce((s, l) => s + l.qtd * l.centavos, 0);
    const alvo = r() < 0.1 ? 0 : Math.floor(cheio * r());
    const out = itensParaGateway(linhas, alvo);
    assert.equal(out.reduce((s, l) => s + l.qtd * l.centavos, 0), alvo, `caso ${n}`);
    for (const l of out) { assert.ok(l.centavos >= 1 && Number.isInteger(l.centavos) && l.qtd >= 1, `caso ${n}: item inválido`); }
    // quantidade de peças nunca aumenta; nome de cada peça é preservado
    for (const nome of new Set(linhas.map((l) => l.nome))) {
      const antes = linhas.filter((l) => l.nome === nome).reduce((s, l) => s + l.qtd, 0);
      const depois = out.filter((l) => l.nome === nome).reduce((s, l) => s + l.qtd, 0);
      assert.ok(depois <= antes, `caso ${n}: ${nome} ganhou peças`);
    }
  }
});

test('gateway: sem desconto, os itens saem iguais aos originais', () => {
  const linhas = [{ nome: 'A', qtd: 2, centavos: 4990 }, { nome: 'B', qtd: 1, centavos: 1990 }];
  assert.deepEqual(itensParaGateway(linhas, 11970), linhas);
});

test('gateway: linha que não divide pela quantidade vira duas (2 un. a R$ 9,98 + 1 un. a R$ 9,99)', () => {
  assert.deepEqual(itensParaGateway([{ nome: 'A', qtd: 3, centavos: 1000 }], 2995), [{ nome: 'A', qtd: 2, centavos: 998 }, { nome: 'A', qtd: 1, centavos: 999 }]);
});
