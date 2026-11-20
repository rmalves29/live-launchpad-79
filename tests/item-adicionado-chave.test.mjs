// P-03 (etapa 4.1), lado do banco: os dois gatilhos que chamam zapi-send-item-added passam a mandar a chave interna,
// e só o próprio banco/serviço consegue ler ou conferir essa chave. Migração 20261120120000_item_added_internal_key.sql.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, aplicarMigracao, linhas, valor } from './support/pg.mjs';

const LOJA = '11111111-1111-4111-8111-111111111111';
let db;

beforeEach(async () => {
  db = await novoBanco(`
    insert into public.tenants (id, name) values ('${LOJA}', 'Loja A');
    alter table public.tenants add column if not exists live_open_order boolean default false;
    create or replace function public.is_super_admin() returns boolean language sql as $$ select false $$;
    create table public.carts (id bigint primary key, customer_phone text);
    create table public.orders (id bigint primary key, cart_id bigint, source text);
    create table public.cart_items (id serial primary key, tenant_id uuid, cart_id bigint, product_id bigint,
      product_name text, product_code text, qty int, unit_price numeric);
    insert into public.carts values (5, '31999887766');
    insert into public.orders values (77, 5, 'live');
  `);
  await aplicarMigracao(db, '20261112180000_item_added_pausa_30min.sql');
  await aplicarMigracao(db, '20261120120000_item_added_internal_key.sql');
  await db.exec(`create trigger t_item_added after insert or update on public.cart_items
                   for each row execute function public.send_whatsapp_on_item_added();`);
});

const chave = () => valor(db, `select key from private.internal_keys where name = 'item_added'`);
const chamadas = () => linhas(db, `select url, headers, body from net.chamadas order by id`);

test('a chave interna é criada uma vez, longa e aleatória, e reaplicar a migração não troca a chave', async () => {
  const k1 = await chave();
  assert.match(k1, /^[0-9a-f]{64}$/);
  await aplicarMigracao(db, '20261120120000_item_added_internal_key.sql');
  assert.equal(await chave(), k1);
});

test('gatilho do item adicionado manda a chave no header (e o resto da chamada continua igual)', async () => {
  await db.exec(`insert into public.cart_items (tenant_id, cart_id, product_id, product_name, product_code, qty, unit_price)
                 values ('${LOJA}', 5, 1, 'Colar Aurora', 'C210', 1, 89.9)`);
  const [c] = await chamadas();
  assert.match(c.url, /zapi-send-item-added$/);
  assert.equal(c.headers['x-cartzy-internal-key'], await chave());
  assert.equal(c.headers['Content-Type'], 'application/json');
  assert.equal(c.body.customer_phone, '31999887766');
  assert.equal(c.body.order_id, 77);
});

test('fim da pausa de 30 min (flush) também manda a chave', async () => {
  await valor(db, `select public.item_added_claim($1, '3199990000', 30, '{"code":"C1"}'::jsonb, '{"tenant_id":"${LOJA}"}'::jsonb)`, [LOJA]);
  await valor(db, `select public.item_added_claim($1, '3199990000', 30, '{"code":"C2"}'::jsonb, '{"tenant_id":"${LOJA}"}'::jsonb)`, [LOJA]);
  await db.exec(`update public.item_added_cooldown set due_at = now() - interval '1 minute'`);
  assert.equal(await valor(db, 'select public.item_added_flush_tick()'), 1);
  const [c] = await chamadas();
  assert.equal(c.headers['x-cartzy-internal-key'], await chave());
  assert.equal(c.body.flush, true);
});

test('conferência da chave: certa = true; errada, vazia ou de outro nome = false', async () => {
  const k = await chave();
  assert.equal(await valor(db, `select public.internal_key_check('item_added', $1)`, [k]), true);
  assert.equal(await valor(db, `select public.internal_key_check('item_added', 'chute')`), false);
  assert.equal(await valor(db, `select public.internal_key_check('item_added', '')`), false);
  assert.equal(await valor(db, `select public.internal_key_check('outra', $1)`, [k]), false);
});

test('ninguém de fora lê a chave: anon e authenticated sem acesso à tabela nem à conferência', async () => {
  for (const papel of ['anon', 'authenticated']) {
    await db.exec(`set role ${papel}`);
    await assert.rejects(db.query(`select key from private.internal_keys`), /permission denied/);
    await assert.rejects(db.query(`select public.internal_key_check('item_added', 'x')`), /permission denied/);
    await db.exec('reset role');
  }
});
