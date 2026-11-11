import { describe, expect, test } from 'bun:test';
import { cleanHandle, escapeLike, missingFieldsForHandleCheckout } from './social-handle';

const complete = {
  phone: '(31) 99999-8888',
  email: 'maria@exemplo.com',
  cep: '30140-071',
  street: 'Rua A',
  number: '10',
  neighborhood: 'Centro',
  city: 'Belo Horizonte',
  state: 'MG',
};

describe('@ do Instagram/TikTok', () => {
  test('remove o @ e os espaços', () => {
    expect(cleanHandle('  @Maria.Joias ')).toBe('Maria.Joias');
    expect(cleanHandle('@@ana_b')).toBe('ana_b');
  });

  test('o _ do @ não vira curinga na busca', () => {
    expect(escapeLike('ana_b')).toBe('ana\\_b');
  });
});

describe('checkout aberto pelo @', () => {
  test('com telefone, e-mail e endereço completo não falta nada', () => {
    expect(missingFieldsForHandleCheckout(complete)).toEqual([]);
  });

  test('telefone é obrigatório', () => {
    expect(missingFieldsForHandleCheckout({ ...complete, phone: '' })).toContain('Telefone');
  });

  test('e-mail é obrigatório', () => {
    expect(missingFieldsForHandleCheckout({ ...complete, email: '' })).toContain('E-mail');
    expect(missingFieldsForHandleCheckout({ ...complete, email: 'maria@' })).toContain('E-mail');
  });

  test('endereço completo é obrigatório', () => {
    expect(missingFieldsForHandleCheckout({ ...complete, number: '', city: '' })).toEqual(['Número', 'Cidade']);
    expect(missingFieldsForHandleCheckout({ ...complete, cep: '3014' })).toContain('CEP');
  });
});
