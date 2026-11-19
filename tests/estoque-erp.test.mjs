// Estoque ERP → Cartzy: o estoque do ERP atualiza o Cartzy sozinho, descontando o que já está
// reservado no Cartzy e o ERP ainda não sabe (sem isso a live venderia a mesma peça duas vezes).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, aplicarMigracao, valor, linhas } from './support/pg.mjs';
import { createFakeSupabase } from './support/fake-supabase.mjs';
import { syncStockEvent } from '../supabase/functions/_shared/bling-product-sync.ts';
import { silenceLogs } from './support/edge.mjs';

const LOJA = '44444444-4444-4444-8444-444444444444';
const OUTRA = '55555555-5555-4555-8555-555555555555';

// ---------- parte 1: quanto já está reservado no Cartzy (função SQL erp_pending_qty) ----------
const TABELAS_MINIMAS = `
  insert into public.tenants (id, name) values ('${LOJA}', 'Loja'), ('${OUTRA}', 'Outra');
  insert into vault.secrets values ('olist_cron_secret', 'segredo');
  create or replace function public.get_current_tenant_id() returns uuid language sql as $$ select null::uuid $$;
  create or replace function public.is_super_admin() returns boolean language sql as $$ select false $$;
  create table public.products (id bigint primary key, tenant_id uuid, is_active boolean default true, stock int default 0,
    bling_product_id bigint, olist_product_id text, bagy_variation_id text, parent_product_id bigint);
  create table public.carts (id bigint primary key, tenant_id uuid);
  create table public.cart_items (id serial primary key, tenant_id uuid, cart_id bigint, product_id bigint, qty int, created_at timestamptz default now());
  create table public.orders (id bigint primary key, tenant_id uuid, cart_id bigint, is_cancelled boolean default false,
    stock_restored boolean default false, bling_order_id text, olist_order_id text, bagy_order_id text);
  create table public.live_cart_reservations (id serial primary key, tenant_id uuid, product_id bigint, qty int, expires_at timestamptz);
`;

let db;
before(async () => {
  db = await novoBanco(TABELAS_MINIMAS);
  await aplicarMigracao(db, '20261118190000_erp_stock_reconcile.sql');
  await db.exec(`
    insert into public.products (id, tenant_id, bling_product_id) values (1, '${LOJA}', 9001), (2, '${LOJA}', null), (3, '${LOJA}', null), (4, '${LOJA}', null), (5, '${OUTRA}', null);
    update public.products set parent_product_id = 3 where id = 4;
    insert into public.carts values (10, '${LOJA}'), (11, '${LOJA}'), (12, '${LOJA}'), (13, '${LOJA}'), (14, '${LOJA}'), (15, '${OUTRA}');
    insert into public.cart_items (tenant_id, cart_id, product_id, qty) values
      ('${LOJA}', 10, 1, 2),   -- carrinho sem pedido ainda: reservado
      ('${LOJA}', 11, 1, 3),   -- pedido aberto, ainda não enviado ao Bling: reservado
      ('${LOJA}', 12, 1, 5),   -- pedido já enviado ao Bling: o Bling já descontou
      ('${LOJA}', 13, 1, 7),   -- pedido cancelado: não reserva
      ('${LOJA}', 14, 1, 11),  -- pedido com estoque devolvido: não reserva
      ('${OUTRA}', 15, 1, 100);-- outra loja: não conta
    insert into public.cart_items (tenant_id, cart_id, product_id, qty, created_at) values ('${LOJA}', 10, 1, 50, now() - interval '46 days');
    insert into public.orders (id, tenant_id, cart_id, bling_order_id, is_cancelled, stock_restored) values
      (101, '${LOJA}', 11, null, false, false), (102, '${LOJA}', 12, 'B-1', false, false),
      (103, '${LOJA}', 13, null, true, false), (104, '${LOJA}', 14, null, false, true);
    insert into public.live_cart_reservations (tenant_id, product_id, qty, expires_at) values
      ('${LOJA}', 1, 4, now() + interval '10 minutes'), ('${LOJA}', 1, 8, now() - interval '1 minute');
  `);
});

test('reservado = carrinho sem pedido + pedido aberto ainda não enviado ao ERP + reserva da live válida', async () => {
  const [r] = await linhas(db, `select product_id, qty from public.erp_pending_qty($1, 'bling', array[1]::bigint[])`, [LOJA]);
  assert.equal(Number(r.qty), 2 + 3 + 4, 'não conta pedido já no Bling, cancelado, devolvido, reserva vencida, carrinho com mais de 45 dias nem outra loja');
});

test('o que é "já enviado" depende do ERP: para a Olist, o pedido enviado só ao Bling ainda está reservado', async () => {
  const [r] = await linhas(db, `select qty from public.erp_pending_qty($1, 'olist', array[1]::bigint[])`, [LOJA]);
  assert.equal(Number(r.qty), 2 + 3 + 5 + 4);
});

test('produtos sem ligação com o ERP: conta só os ativos da loja, sem contar o produto pai de variações', async () => {
  assert.equal(await valor(db, `select public.erp_unlinked_count($1, 'bling')`, [LOJA]), 2, 'produtos 2 e 4 (o 3 é pai do 4; o 1 está ligado)');
});

test('a conferência de estoque roda sozinha a cada 15 minutos', async () => {
  const [job] = await linhas(db, `select schedule, command from cron.job where jobname = 'erp-stock-reconcile'`);
  assert.equal(job.schedule, '7,22,37,52 * * * *');
  assert.match(job.command, /erp-stock-reconcile/);
});

test('as funções de estoque não podem ser chamadas pelo site público nem por usuário logado', async () => {
  const rows = await linhas(db, `select r.rolname, has_function_privilege(r.rolname, 'public.erp_pending_qty(uuid,text,bigint[])', 'execute') as pode
    from pg_roles r where r.rolname in ('anon','authenticated','service_role') order by 1`);
  assert.deepEqual(rows.map((x) => [x.rolname, x.pode]), [['anon', false], ['authenticated', false], ['service_role', true]]);
});

// ---------- parte 2: aviso de estoque do Bling chegando no Cartzy (syncStockEvent) ----------
let restore;
before(() => { restore = silenceLogs(); });
after(() => restore());

function blingFalso(saldos, { codigos = {} } = {}) {
  const chamadas = [];
  globalThis.fetch = async (url) => {
    chamadas.push(String(url));
    const u = new URL(url);
    if (u.pathname.endsWith('/estoques/saldos')) {
      const ids = u.searchParams.getAll('idsProdutos[]').map(Number);
      return Response.json({ data: ids.map((id) => ({ produto: { id }, depositos: [{ id: 77, saldoVirtual: saldos[id] ?? 0 }, { id: 88, saldoVirtual: 999 }] })) });
    }
    const m = u.pathname.match(/\/produtos\/(\d+)$/);
    if (m) return Response.json({ data: { id: Number(m[1]), codigo: codigos[m[1]] } });
    return Response.json({ data: [] });
  };
  return chamadas;
}

const integ = { tenant_id: LOJA, bling_deposit_id: 77 };
const banco = (produtos, reservado = 0) => createFakeSupabase({
  tables: { products: produtos, erp_stock_sync_state: [] },
  rpc: { erp_pending_qty: (a) => a.p_product_ids.map((id) => ({ product_id: id, qty: reservado })) },
});

test('estoque mudou no Bling: o Cartzy recebe o saldo do depósito escolhido menos o reservado', { timeout: 20000 }, async () => {
  blingFalso({ 9001: 10 });
  const sb = banco([{ id: 1, tenant_id: LOJA, bling_product_id: 9001, stock: 3 }], 4);
  const r = await syncStockEvent(sb, integ, 'tok', { produto: { id: 9001 }, deposito: { id: 77 } });
  assert.match(r, /estoque 3 -> 6/);
  assert.equal(sb.db.products[0].stock, 6);
  assert.ok(sb.db.erp_stock_sync_state.length === 1, 'painel de saúde registra a última mudança');
});

test('reservado maior que o saldo do Bling: estoque fica 0, nunca negativo', { timeout: 20000 }, async () => {
  blingFalso({ 9001: 2 });
  const sb = banco([{ id: 1, tenant_id: LOJA, bling_product_id: 9001, stock: 3 }], 5);
  await syncStockEvent(sb, integ, 'tok', { produto: { id: 9001 } });
  assert.equal(sb.db.products[0].stock, 0);
});

test('aviso de outro depósito é ignorado', { timeout: 20000 }, async () => {
  blingFalso({ 9001: 50 });
  const sb = banco([{ id: 1, tenant_id: LOJA, bling_product_id: 9001, stock: 3 }]);
  assert.equal(await syncStockEvent(sb, integ, 'tok', { produto: { id: 9001 }, deposito: { id: 88 } }), 'outro_deposito');
  assert.equal(sb.db.products[0].stock, 3);
});

test('produto ainda não ligado: liga pelo código quando há exatamente um produto com esse código', { timeout: 20000 }, async () => {
  blingFalso({ 9002: 8 }, { codigos: { 9002: 'C300' } });
  const sb = banco([{ id: 2, tenant_id: LOJA, code: 'C300', bling_product_id: null, stock: 1 }]);
  const r = await syncStockEvent(sb, integ, 'tok', { produto: { id: 9002 } });
  assert.match(r, /ligado; estoque 1 -> 8/);
  assert.equal(sb.db.products[0].bling_product_id, 9002);
});

test('código repetido em dois produtos: não adivinha qual ligar', { timeout: 20000 }, async () => {
  blingFalso({ 9003: 8 }, { codigos: { 9003: 'C301' } });
  const sb = banco([
    { id: 3, tenant_id: LOJA, code: 'C301', bling_product_id: null, stock: 1 },
    { id: 4, tenant_id: LOJA, sku_erp: 'C301', bling_product_id: null, stock: 1 },
  ]);
  assert.equal(await syncStockEvent(sb, integ, 'tok', { produto: { id: 9003 } }), 'produto_nao_vinculado');
  assert.ok(sb.db.products.every((p) => p.bling_product_id === null && p.stock === 1));
});

test('estoque igual ao do Cartzy: não regrava nada', { timeout: 20000 }, async () => {
  blingFalso({ 9001: 3 });
  const sb = banco([{ id: 1, tenant_id: LOJA, bling_product_id: 9001, stock: 3 }]);
  assert.equal(await syncStockEvent(sb, integ, 'tok', { produto: { id: 9001 } }), 'estoque_ja_igual');
  assert.equal(sb.log.writes.length, 0);
});
