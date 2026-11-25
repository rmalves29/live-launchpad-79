// Checkout: o desconto de cupom mostrado na tela tem que ser o mesmo que o servidor cobra.
// Desde a etapa 2 a regra fica num lugar só (_shared/coupon-rules.ts); este teste garante que tela e servidor
// continuam chegando no mesmo desconto (as "capas" de cada lado convertem o carrinho de jeitos diferentes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFunctions } from './support/extract.mjs';
import { previewCoupon, bestAutoCoupon, cartSubtotal, cartOriginal } from '../src/lib/live-shop.ts';
import { isOrderWithinCoupon } from '../supabase/functions/_shared/coupon-eligibility.ts';
import { computeCouponDiscount } from '../supabase/functions/_shared/coupon-rules.ts';

const servidor = extractFunctions('supabase/functions/live-shop/index.ts', ['round2', 'num', 'couponActive', 'computeCoupon'], { computeCouponDiscount });

const linha = (price, qty, was = null) => ({ product_id: 1, qty, code: 'C1', name: 'Peça', label: '', image_url: null, price, was, stock: 99 });
const paraServidor = (lines) => lines.map((l) => ({ unit_price: l.price, qty: l.qty, promotional: !!l.was }));
const cupom = (extra) => ({ code: 'X', discount_type: 'percentage', discount_value: 10, min_purchase_amount: 0, min_items_quantity: 0, progressive_tiers: null, apply_to_promotional: true, expires_at: null, is_active: true, ...extra });

function sorteio(seed) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

test('tela e servidor calculam o mesmo desconto para 5.000 carrinhos e cupons sorteados', () => {
  const r = sorteio(42);
  const tipos = ['percentage', 'fixed', 'progressive'];
  for (let n = 0; n < 5000; n++) {
    const lines = Array.from({ length: 1 + Math.floor(r() * 5) }, () => linha(Math.round(r() * 20000) / 100 + 1, 1 + Math.floor(r() * 4), r() < 0.3 ? 300 : null));
    const tipo = tipos[Math.floor(r() * 3)];
    const porQtd = r() < 0.5;
    const c = cupom({
      discount_type: tipo,
      discount_value: tipo === 'fixed' ? Math.round(r() * 8000) / 100 : Math.round(r() * 50),
      min_purchase_amount: r() < 0.3 ? Math.round(r() * 300) : 0,
      min_items_quantity: r() < 0.3 ? Math.floor(r() * 6) : 0,
      apply_to_promotional: r() < 0.5,
      progressive_tiers: tipo === 'progressive'
        ? (porQtd
          ? [{ min_value: 0, max_value: null, min_qty: 2, max_qty: 4, discount: 5 }, { min_value: 0, max_value: null, min_qty: 5, max_qty: null, discount: 12 }]
          : [{ min_value: 100, max_value: 299.99, discount: 5 }, { min_value: 300, max_value: null, discount: 10 }])
        : null,
    });
    const tela = previewCoupon(c, lines);
    const serv = servidor.computeCoupon(c, paraServidor(lines));
    assert.equal(tela.ok, serv.ok, `caso ${n}: tela=${JSON.stringify(tela)} servidor=${JSON.stringify(serv)} cupom=${JSON.stringify(c)}`);
    assert.equal(tela.discount, serv.discount, `caso ${n}: desconto diferente`);
  }
});

test('cupom percentual, fixo e mínimo de compra', () => {
  const lines = [linha(50, 2), linha(30, 1)];
  assert.equal(cartSubtotal(lines), 130);
  assert.deepEqual(previewCoupon(cupom({ discount_value: 10 }), lines), { ok: true, discount: 13 });
  assert.deepEqual(previewCoupon(cupom({ discount_type: 'fixed', discount_value: 500 }), lines), { ok: true, discount: 130 }, 'fixo nunca passa do valor dos produtos');
  assert.equal(previewCoupon(cupom({ min_purchase_amount: 200 }), lines).ok, false);
  assert.equal(previewCoupon(cupom({ min_items_quantity: 4 }), lines).ok, false);
  assert.equal(previewCoupon(undefined, lines).message, 'Cupom inválido ou expirado.');
});

test('cupom que não vale para promoção ignora as peças em promoção', () => {
  const lines = [linha(100, 1, 150), linha(40, 1)];
  assert.equal(cartOriginal(lines), 190);
  assert.deepEqual(previewCoupon(cupom({ apply_to_promotional: false, discount_value: 10 }), lines), { ok: true, discount: 4 });
  assert.equal(previewCoupon(cupom({ apply_to_promotional: false }), [linha(100, 1, 150)]).message, 'Este cupom não vale para produtos em promoção.');
});

test('cupom progressivo por quantidade e por valor', () => {
  const porQtd = cupom({ discount_type: 'progressive', progressive_tiers: [{ min_qty: 2, max_qty: 4, discount: 5 }, { min_qty: 5, max_qty: null, discount: 12 }] });
  assert.equal(previewCoupon(porQtd, [linha(10, 1)]).ok, false);
  assert.deepEqual(previewCoupon(porQtd, [linha(10, 3)]), { ok: true, discount: 1.5 });
  assert.deepEqual(previewCoupon(porQtd, [linha(10, 5)]), { ok: true, discount: 6 });
  const porValor = cupom({ discount_type: 'progressive', progressive_tiers: [{ min_value: 100, max_value: null, discount: 10 }] });
  assert.equal(previewCoupon(porValor, [linha(99.99, 1)]).ok, false);
  assert.deepEqual(previewCoupon(porValor, [linha(100, 1)]), { ok: true, discount: 10 });
});

test('cupom automático: escolhe o de maior desconto e ignora os não automáticos', () => {
  const lines = [linha(100, 1)];
  const melhor = bestAutoCoupon([
    cupom({ code: 'A', auto_apply: true, discount_value: 5 }),
    cupom({ code: 'B', auto_apply: true, discount_type: 'fixed', discount_value: 15 }),
    cupom({ code: 'C', auto_apply: false, discount_value: 50 }),
  ], lines);
  assert.equal(melhor.coupon.code, 'B');
  assert.equal(melhor.discount, 15);
});

test('servidor recusa cupom desativado, vencido, ainda não iniciado ou esgotado', () => {
  const lines = paraServidor([linha(100, 1)]);
  const ontem = new Date(Date.now() - 864e5).toISOString();
  const amanha = new Date(Date.now() + 864e5).toISOString();
  for (const extra of [{ is_active: false }, { expires_at: ontem }, { starts_at: amanha }, { usage_limit: 3, used_count: 3 }]) {
    assert.equal(servidor.computeCoupon(cupom(extra), lines).ok, false, JSON.stringify(extra));
  }
  assert.equal(servidor.computeCoupon(cupom({ usage_limit: 3, used_count: 2 }), lines).ok, true);
});

test('cupom só vale para pedidos feitos dentro da janela de validade', () => {
  const janela = { startsMs: Date.parse('2026-11-01T00:00:00Z'), expiresMs: Date.parse('2026-11-30T23:59:59Z'), discountType: 'percentage' };
  assert.equal(isOrderWithinCoupon('2026-10-31T12:00:00Z', null), true, 'sem cupom não restringe');
  assert.equal(isOrderWithinCoupon('2026-11-15T12:00:00Z', janela), true);
  assert.equal(isOrderWithinCoupon('2026-10-31T12:00:00Z', janela), false);
  assert.equal(isOrderWithinCoupon('2026-12-01T12:00:00Z', janela), false);
});
