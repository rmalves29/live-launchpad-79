// Como o webhook do WhatsApp reconhece o telefone da cliente (funções saíram do zapi-webhook na etapa 3, item 3.2).
// Um telefone errado aqui = pedido no nome de outra pessoa ou mensagem que não chega.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, normalizeParticipantPhone, looksLikeBrazilianPhone, firstValidPhone, hashMessage, getBrasiliaDateISO } from '../supabase/functions/_shared/zapi-phone.ts';

test('telefone com DDI 55 e com/sem o nono dígito', () => {
  assert.equal(normalizePhone('5531992904210'), '31992904210');
  assert.equal(normalizePhone('+55 (31) 9290-4210'), '31992904210', 'DDD + 8 dígitos ganha o 9');
  assert.equal(normalizePhone('31992904210'), '31992904210');
});

test('ID de grupo, LID do WhatsApp e números curtos não viram telefone', () => {
  assert.equal(normalizePhone('120363424212147581'), '');
  assert.equal(normalizePhone('12345'), '');
  assert.equal(normalizePhone('5501992904210'), '', 'DDD inválido');
});

test('participante de grupo: tira o 55, não corta LID', () => {
  assert.equal(normalizeParticipantPhone('5531992904210'), '31992904210');
  assert.equal(normalizeParticipantPhone('214567890123456'), '214567890123456');
});

test('primeiro telefone válido da lista', () => {
  assert.equal(looksLikeBrazilianPhone('120363424212147581'), false);
  assert.equal(firstValidPhone(null, '120363424212147581', '5531992904210'), '5531992904210');
  assert.equal(firstValidPhone('abc'), '');
});

test('hash da mensagem é estável e data de Brasília tem formato AAAA-MM-DD', () => {
  assert.equal(hashMessage('C210'), hashMessage('C210'));
  assert.notEqual(hashMessage('C210'), hashMessage('C211'));
  assert.match(getBrasiliaDateISO(), /^\d{4}-\d{2}-\d{2}$/);
});
