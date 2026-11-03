import { describe, it, expect, beforeEach } from 'bun:test';

const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, clear: () => { for (const k in store) delete store[k]; } };
(globalThis as any).document = { cookie: '' };
import { getActiveRef, rememberRef, whatsappText } from './affiliate-ref';

describe('referência de afiliado', () => {
  beforeEach(() => localStorage.clear());

  it('primeiro afiliado vale (first-click)', () => {
    const t = Date.now();
    rememberRef('JULIANA', t);
    expect(rememberRef('MARIA', t + 1000)).toBe('JULIANA');
  });

  it('referência expira após 60 dias', () => {
    const t = Date.now();
    rememberRef('JULIANA', t);
    expect(getActiveRef(t + 59 * 864e5)).toBe('JULIANA');
    expect(getActiveRef(t + 61 * 864e5)).toBeNull();
    expect(rememberRef('MARIA', t + 61 * 864e5)).toBe('MARIA');
  });

  it('texto do WhatsApp cita a indicação', () => {
    expect(whatsappText({ nome: 'Juliana', codigo: 'JULIANA' }))
      .toBe('Oi! Quero conhecer o Cartzy. Vim pela indicação de Juliana (cód. JULIANA)');
    expect(whatsappText(null)).toBe('Oi! Quero conhecer o Cartzy.');
  });
});
