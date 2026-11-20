// Etapa 5.3: os gatilhos de pedido pago, rastreio e aviso da agenda mandam a chave interna "sistema"
// (migração 20261120130000_triggers_internal_key.sql). O resto da chamada continua igual ao de produção.
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
    create table public.whatsapp_messages (id serial primary key, tenant_id uuid, phone text, message text, type text, order_id bigint, created_at timestamptz);
    create table public.orders (id bigint primary key, tenant_id uuid, customer_phone text, is_paid boolean default false,
      skip_paid_message boolean default false, melhor_envio_tracking_code text, tracking_posted boolean, shipped_at timestamptz);
    create or replace function public.agenda_cfg(k text) returns text language sql as $$ select case k when 'tenant_aviso_rafael' then '${LOJA}' else '5531900000000' end $$;
    insert into public.orders (id, tenant_id, customer_phone) values (10, '${LOJA}', '31999887766');
  `);
  await aplicarMigracao(db, '20261112180000_item_added_pausa_30min.sql');
  await aplicarMigracao(db, '20261120120000_item_added_internal_key.sql');
  await aplicarMigracao(db, '20261120130000_triggers_internal_key.sql');
  await db.exec(`
    create trigger t_pago after update on public.orders for each row execute function public.process_paid_order();
    create trigger t_rastreio after update on public.orders for each row execute function public.send_tracking_whatsapp_on_update();
  `);
});

const chaveSistema = () => valor(db, `select key from private.internal_keys where name = 'sistema'`);
const chamadas = () => linhas(db, `select url, headers, body from net.chamadas order by id`);

test('chave "sistema" existe e é diferente da do item adicionado', async () => {
  const s = await chaveSistema();
  assert.match(s, /^[0-9a-f]{64}$/);
  assert.notEqual(s, await valor(db, `select key from private.internal_keys where name = 'item_added'`));
});

test('pedido pago: chamada igual à de produção + chave interna; log do envio continua', async () => {
  await db.exec(`update public.orders set is_paid = true where id = 10`);
  const [c] = await chamadas();
  assert.match(c.url, /zapi-send-paid-order$/);
  assert.equal(c.headers['x-cartzy-internal-key'], await chaveSistema());
  assert.equal(c.headers['Content-Type'], 'application/json');
  assert.ok('Authorization' in c.headers, 'mantém o Authorization de antes');
  assert.deepEqual(c.body, { order_id: 10, tenant_id: LOJA });
  const [log] = await linhas(db, `select message from public.whatsapp_messages`);
  assert.match(log.message, /enfileirado/);
});

test('pedido pago com "não enviar mensagem": continua sem chamar a função', async () => {
  await db.exec(`update public.orders set skip_paid_message = true, is_paid = true where id = 10`);
  assert.equal((await chamadas()).length, 0);
});

test('rastreio postado: chamada igual à de produção + chave interna', async () => {
  await db.exec(`update public.orders set melhor_envio_tracking_code = 'AA123BR', tracking_posted = true where id = 10`);
  const c = (await chamadas()).find((x) => x.url.endsWith('zapi-send-tracking'));
  assert.equal(c.headers['x-cartzy-internal-key'], await chaveSistema());
  assert.equal(c.body.tracking_code, 'AA123BR');
});

test('aviso da agenda: manda a chave interna e o mesmo corpo', async () => {
  await valor(db, `select public.agenda_whats_rafael('Reunião em 5 min')`);
  const [c] = await chamadas();
  assert.match(c.url, /zapi-send-message$/);
  assert.equal(c.headers['x-cartzy-internal-key'], await chaveSistema());
  assert.deepEqual(c.body, { tenant_id: LOJA, phone: '5531900000000', message: 'Reunião em 5 min' });
});
