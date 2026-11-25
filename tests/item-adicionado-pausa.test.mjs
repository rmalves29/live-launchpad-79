// Regra anti-bloqueio do "item adicionado" (migração 20261112180000_item_added_pausa_30min.sql),
// rodada num Postgres de verdade em memória:
//  1) primeiro pedido manda na hora e abre pausa de 30 min;
//  2) pedidos na pausa acumulam;
//  3) no fim da pausa sai UMA mensagem com tudo;
//  4) no máximo 1 mensagem a cada 2 minutos por loja quando várias pausas vencem juntas.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, aplicarMigracao, linhas, valor } from './support/pg.mjs';

const LOJA = '11111111-1111-4111-8111-111111111111';
const OUTRA = '22222222-2222-4222-8222-222222222222';
let db;

beforeEach(async () => {
  db = await novoBanco(`insert into public.tenants (id, name) values ('${LOJA}', 'Loja A'), ('${OUTRA}', 'Loja B');`);
  await aplicarMigracao(db, '20261112180000_item_added_pausa_30min.sql');
});

const pedir = (tenant, fone, item) => valor(db,
  `select public.item_added_claim($1, $2, 30, $3::jsonb, $4::jsonb)`,
  [tenant, fone, JSON.stringify(item), JSON.stringify({ tenant_id: tenant, phone: fone, ultimo: item })]);
const voltarNoTempo = (minutos, tenant = LOJA, fone = null) => db.query(
  `update public.item_added_cooldown set last_sent_at = last_sent_at - make_interval(mins => $1),
     due_at = due_at - make_interval(mins => $1) where tenant_id = $2 and ($3::text is null or phone_key = $3)`,
  [minutos, tenant, fone]);
const rodarFila = () => valor(db, 'select public.item_added_flush_tick()');
const mensagensEnviadas = () => linhas(db, 'select body from net.chamadas order by id');

test('primeiro pedido manda na hora; os seguintes, dentro de 30 min, ficam acumulados', async () => {
  assert.equal(await pedir(LOJA, '3199990000', { code: 'C1' }), 'send');
  assert.equal(await pedir(LOJA, '3199990000', { code: 'C2' }), 'deferred');
  assert.equal(await pedir(LOJA, '3199990000', { code: 'C3' }), 'deferred');
  const [fila] = await linhas(db, 'select pending_items from public.item_added_cooldown');
  assert.deepEqual(fila.pending_items, [{ code: 'C2' }, { code: 'C3' }]);
});

test('antes de vencer a pausa nada sai; ao vencer, sai UMA mensagem com todos os itens acumulados', async () => {
  await pedir(LOJA, '3199990000', { code: 'C1' });
  await pedir(LOJA, '3199990000', { code: 'C2' });
  await pedir(LOJA, '3199990000', { code: 'C3' });

  await voltarNoTempo(29);
  assert.equal(await rodarFila(), 0, 'com 29 minutos ainda não sai');

  await voltarNoTempo(2);
  assert.equal(await rodarFila(), 1);
  const [msg] = await mensagensEnviadas();
  assert.equal(msg.body.flush, true);
  assert.deepEqual(msg.body.consolidated_items, [{ code: 'C2' }, { code: 'C3' }]);
  assert.equal(await rodarFila(), 0, 'não repete a mesma mensagem');
});

test('quando a pausa acumulada é enviada, começa uma nova pausa de 30 min', async () => {
  await pedir(LOJA, '3199990000', { code: 'C1' });
  await pedir(LOJA, '3199990000', { code: 'C2' });
  await voltarNoTempo(31);
  await rodarFila();
  assert.equal(await pedir(LOJA, '3199990000', { code: 'C3' }), 'deferred', 'pedido logo depois do envio acumulado espera nova pausa');
});

test('cliente que não pediu nada durante a pausa não recebe mensagem; depois da pausa volta a mandar na hora', async () => {
  await pedir(LOJA, '3199990000', { code: 'C1' });
  await voltarNoTempo(31);
  assert.equal(await rodarFila(), 0);
  assert.equal((await mensagensEnviadas()).length, 0);
  assert.equal(await pedir(LOJA, '3199990000', { code: 'C2' }), 'send');
});

test('pausas de clientes diferentes são independentes, inclusive entre lojas', async () => {
  assert.equal(await pedir(LOJA, '3199990000', { code: 'C1' }), 'send');
  assert.equal(await pedir(LOJA, '3188880000', { code: 'C1' }), 'send');
  assert.equal(await pedir(OUTRA, '3199990000', { code: 'C1' }), 'send');
});

test('várias pausas da mesma loja vencendo juntas: 1 mensagem a cada 2 minutos; outra loja não espera', async () => {
  for (const fone of ['3111110000', '3122220000', '3133330000']) {
    await pedir(LOJA, fone, { code: 'C1' });
    await pedir(LOJA, fone, { code: 'C2' });
  }
  await pedir(OUTRA, '3144440000', { code: 'C1' });
  await pedir(OUTRA, '3144440000', { code: 'C2' });
  await voltarNoTempo(31, LOJA);
  await voltarNoTempo(31, OUTRA);

  assert.equal(await rodarFila(), 2, 'uma da loja A e uma da loja B');
  assert.equal(await rodarFila(), 0, 'loja A ainda dentro do intervalo de 2 minutos');

  await db.query(`update public.item_added_flush_slots set last_flush_at = last_flush_at - interval '2 minutes'`);
  assert.equal(await rodarFila(), 1);
  await db.query(`update public.item_added_flush_slots set last_flush_at = last_flush_at - interval '2 minutes'`);
  assert.equal(await rodarFila(), 1);
  assert.equal((await mensagensEnviadas()).length, 4);
});

test('se o envio liberado falhar, a pausa é desfeita e o próximo pedido manda na hora', async () => {
  await pedir(LOJA, '3199990000', { code: 'C1' });
  await db.query('select public.item_added_release($1, $2)', [LOJA, '3199990000']);
  assert.equal(await pedir(LOJA, '3199990000', { code: 'C2' }), 'send');
});

test('desfazer a pausa não apaga itens que já estavam acumulados', async () => {
  await pedir(LOJA, '3199990000', { code: 'C1' });
  await pedir(LOJA, '3199990000', { code: 'C2' });
  await db.query('select public.item_added_release($1, $2)', [LOJA, '3199990000']);
  const [fila] = await linhas(db, 'select pending_items, last_sent_at from public.item_added_cooldown');
  assert.deepEqual(fila.pending_items, [{ code: 'C2' }]);
  assert.notEqual(fila.last_sent_at, null);
});

test('as funções da pausa não podem ser chamadas pelo site público (anon) nem por usuário logado', async () => {
  const permissoes = await linhas(db, `
    select r.rolname, has_function_privilege(r.rolname, 'public.item_added_claim(uuid,text,int,jsonb,jsonb)', 'execute') as pode
      from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role') order by r.rolname`);
  assert.deepEqual(permissoes.map((p) => [p.rolname, p.pode]), [['anon', false], ['authenticated', false], ['service_role', true]]);
});

test('o envio acumulado roda sozinho a cada minuto', async () => {
  const [job] = await linhas(db, `select schedule, command from cron.job where jobname = 'item-added-flush-every-minute'`);
  assert.equal(job.schedule, '* * * * *');
  assert.match(job.command, /item_added_flush_tick/);
});
