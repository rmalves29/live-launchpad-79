// Formatos que o pedido leva ao Bling (UF, CPF, telefone, e-mail, frete Frenet, erros conhecidos).
// Funções saíram do bling-sync-orders na etapa 3 (item 3.2) e agora têm teste direto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUF, isValidCPF, formatBlingPhone, validEmailOrEmpty, isDuplicateNumeroError, isInsufficientStockError,
  normalizeFrenetServiceLabel, inferFrenetCarrierName, getFrenetServiceCodeCandidate, matchesLogisticService, chooseLogisticServiceAlias, normalizeShippingText,
} from '../supabase/functions/_shared/bling-order-helpers.ts';

test('UF: nome do estado vira sigla', () => {
  assert.equal(normalizeUF('São Paulo'), 'SP');
  assert.equal(normalizeUF('goias'), 'GO');
  assert.equal(normalizeUF('mg'), 'MG');
  assert.equal(normalizeUF(null), '');
});

test('CPF: dígitos verificadores', () => {
  assert.equal(isValidCPF('529.982.247-25'), true);
  assert.equal(isValidCPF('111.111.111-11'), false);
  assert.equal(isValidCPF('529.982.247-24'), false);
});

test('telefone no formato do Bling; inválido sai vazio', () => {
  assert.equal(formatBlingPhone('5531992904210'), '(31) 99290-4210');
  assert.equal(formatBlingPhone('3133334444'), '(31) 3333-4444');
  assert.equal(formatBlingPhone('123'), '');
});

test('e-mail inválido não vai para o Bling', () => {
  assert.equal(validEmailOrEmpty(' ana@loja.com.br '), 'ana@loja.com.br');
  assert.equal(validEmailOrEmpty('ana@loja'), '');
  assert.equal(validEmailOrEmpty('a@b.com, c@d.com'), '');
});

test('erros conhecidos do Bling: número repetido e estoque insuficiente', () => {
  assert.equal(isDuplicateNumeroError('{"code":36,"element":"numero","msg":"VENDAS"}'), true);
  assert.equal(isInsufficientStockError('{"code":67}'), true);
  assert.equal(isInsufficientStockError('O saldo de um ou mais produtos é insuficiente'), true);
  assert.equal(isInsufficientStockError('{"code":10}'), false);
});

test('frete Frenet: serviço, transportadora e código', () => {
  assert.equal(normalizeFrenetServiceLabel('Frenet - Correios - SEDEX (2 dias)'), 'SEDEX');
  assert.equal(normalizeFrenetServiceLabel('Frenet - PAC'), 'PAC');
  assert.equal(inferFrenetCarrierName('Frenet', 'Jadlog .Package'), 'Jadlog');
  assert.equal(inferFrenetCarrierName('Frenet', 'SEDEX'), 'Correios');
  assert.equal(inferFrenetCarrierName('Frenet', 'Desconhecida'), 'Transportadora Frenet');
  assert.equal(getFrenetServiceCodeCandidate(3220), '03220');
  assert.equal(getFrenetServiceCodeCandidate(''), '');
});

test('serviço logístico do Bling casa pelo nome ou apelido', () => {
  const svc = { descricao: 'SEDEX CONTRATO AG', codigo: '03220', aliases: ['Sedex'] };
  const keys = new Set([normalizeShippingText('SEDEX')]);
  assert.equal(matchesLogisticService(svc, keys), true);
  assert.equal(chooseLogisticServiceAlias(svc, keys), 'Sedex');
  assert.equal(matchesLogisticService({ descricao: 'Jadlog' }, keys), false);
});
