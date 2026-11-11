import { describe, it, expect } from 'bun:test';
import { baixarEtiquetasCorreios, MAX_RODADAS } from './correios-labels-download';

// ambiente mínimo para o download do PDF
(globalThis as any).URL.createObjectURL = () => 'blob:x';
(globalThis as any).document = {
  createElement: () => ({ click() {}, remove() {} }),
  body: { appendChild() {} },
};
const PDF = btoa('%PDF-1.4 teste');

describe('baixarEtiquetasCorreios', () => {
  it('continua chamando enquanto os Correios entregam etiquetas novas, mesmo além de 4 rodadas', async () => {
    let chamadas = 0;
    const invoke = async () => {
      chamadas++;
      if (chamadas < 8) return { data: { pending: true, recibos: { a: '1' }, prontas: chamadas, total: 8 }, error: null };
      return { data: { success: true, labelPdfBase64: PDF, total: 8 }, error: null };
    };
    const n = await baixarEtiquetasCorreios(invoke, 't', [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(chamadas).toBe(8);
    expect(n).toBe(8);
  });

  it('desiste depois de 3 rodadas seguidas sem nenhuma etiqueta nova', async () => {
    let chamadas = 0;
    const invoke = async () => {
      chamadas++;
      return { data: { pending: true, recibos: { a: '1' }, prontas: 2, total: 5 }, error: null };
    };
    await expect(baixarEtiquetasCorreios(invoke, 't', [1, 2, 3, 4, 5])).rejects.toThrow();
    expect(chamadas).toBe(4); // 1ª rodada com avanço + 3 sem avanço
  });

  it('nunca passa do limite de rodadas', async () => {
    let chamadas = 0;
    const invoke = async () => {
      chamadas++;
      return { data: { pending: true, recibos: { a: '1' }, prontas: chamadas, total: 999 }, error: null };
    };
    await expect(baixarEtiquetasCorreios(invoke, 't', [1])).rejects.toThrow();
    expect(chamadas).toBe(MAX_RODADAS);
  });
});

describe('baixarEtiquetasCorreios — etiquetas já prontas', () => {
  it('reenvia ao servidor as etiquetas já recebidas, para não pedir de novo aos Correios', async () => {
    const enviados: any[] = [];
    const invoke = async (body: Record<string, unknown>) => {
      enviados.push(body);
      if (enviados.length === 1) return { data: { pending: true, recibos: { b: '2' }, prontas: 1, total: 2, pdfs: { a: 'PDF-A' } }, error: null };
      return { data: { success: true, labelPdfBase64: PDF, total: 2 }, error: null };
    };
    await baixarEtiquetasCorreios(invoke, 't', [1, 2]);
    expect(enviados[0].pdfs).toBeUndefined();
    expect(enviados[1].pdfs).toEqual({ a: 'PDF-A' });
  });
});

describe('baixarEtiquetasCorreios — pedidos já postados', () => {
  it('baixa as outras e avisa quais pedidos já foram postados', async () => {
    let avisados: number[] = [];
    const invoke = async () => ({ data: { success: true, labelPdfBase64: PDF, total: 1, pedidos_postados: [16903] }, error: null });
    const n = await baixarEtiquetasCorreios(invoke, 't', [17011, 16903], undefined, 'zebra', (p) => (avisados = p));
    expect(n).toBe(1);
    expect(avisados).toEqual([16903]);
  });

  it('dá erro claro quando todos os pedidos já foram postados', async () => {
    const invoke = async () => ({ data: { success: true, labelPdfBase64: null, total: 0, pedidos_postados: [16903, 16901] }, error: null });
    await expect(baixarEtiquetasCorreios(invoke, 't', [16903, 16901])).rejects.toThrow('#16903, #16901');
  });
});
