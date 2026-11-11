/**
 * Baixa etiquetas dos Correios (um PDF por lote de até 30 pedidos) usando a ação get_labels_batch da função correios-labels.
 * Se os Correios ainda estiverem gerando, continua com os MESMOS recibos enquanto houver avanço, em vez de pedir etiqueta nova.
 */
export interface InvokeResult {
  data: any;
  error: any;
}
export type InvokeFn = (body: Record<string, unknown>) => Promise<InvokeResult>;

/** a4 = folha A4 (layout padrão dos Correios); zebra = etiqueta térmica 100 x 150 mm */
export type FormatoEtiqueta = 'a4' | 'zebra';

const CHAVE_FORMATO = 'cartzy_formato_etiqueta_correios';

export function lerFormatoSalvo(): FormatoEtiqueta {
  try {
    return localStorage.getItem(CHAVE_FORMATO) === 'zebra' ? 'zebra' : 'a4';
  } catch {
    return 'a4';
  }
}

export function salvarFormato(f: FormatoEtiqueta) {
  try {
    localStorage.setItem(CHAVE_FORMATO, f);
  } catch {
    /* sem armazenamento: só não lembra a escolha */
  }
}

export const MAX_RODADAS = 25;
export const RODADAS_SEM_AVANCO = 3;

export async function baixarEtiquetasCorreios(
  invoke: InvokeFn,
  tenantId: string,
  orderIds: number[],
  onAguardando?: (prontas: number, total: number) => void,
  formato: FormatoEtiqueta = 'a4',
  /** pedidos que já foram postados nos Correios: ficam fora do PDF (os Correios não imprimem mais) */
  onJaPostados?: (pedidos: number[]) => void,
): Promise<number> {
  let baixadas = 0;
  const jaPostados: number[] = [];
  for (let i = 0; i < orderIds.length; i += 30) {
    const lote = orderIds.slice(i, i + 30);
    let recibos: Record<string, string> | undefined;
    // Etiquetas já entregues em rodadas anteriores: o servidor não pede de novo aos Correios.
    const pdfs: Record<string, string> = {};
    let postados: string[] = [];
    let data: any = null;
    let error: any = null;
    // Os Correios geram uma etiqueta por vez: continua enquanto houver avanço.
    // Para depois de 3 rodadas seguidas sem nenhuma etiqueta nova (ou no máximo 25 rodadas).
    let melhor = -1;
    let semAvanco = 0;
    for (let rodada = 1; rodada <= MAX_RODADAS; rodada++) {
      ({ data, error } = await invoke({
        action: 'get_labels_batch',
        order_ids: lote,
        formato,
        tenant_id: tenantId,
        ...(recibos ? { recibos } : {}),
        ...(Object.keys(pdfs).length ? { pdfs } : {}),
        ...(postados.length ? { postados } : {}),
      }));
      if (error || !data?.pending || !data?.recibos) break;
      recibos = data.recibos;
      if (data.pdfs && typeof data.pdfs === 'object') Object.assign(pdfs, data.pdfs);
      if (Array.isArray(data.postados)) postados = data.postados;
      const prontas = Math.max(typeof data.prontas === 'number' ? data.prontas : 0, Object.keys(pdfs).length) + postados.length;
      if (prontas > melhor) {
        melhor = prontas;
        semAvanco = 0;
      } else if (++semAvanco >= RODADAS_SEM_AVANCO) break;
      if (rodada < MAX_RODADAS) onAguardando?.(baixadas + prontas, orderIds.length);
    }
    if (error) throw new Error(data?.error || error.message || 'Erro ao baixar etiquetas');
    if (data?.pending) throw new Error('Os Correios ainda não terminaram de gerar as etiquetas. Tente de novo em alguns minutos.');
    if (!data?.success || !data?.labelPdfBase64) throw new Error(data?.error || 'Erro ao baixar etiquetas');
    const bytes = Uint8Array.from(atob(data.labelPdfBase64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `etiquetas-e-declaracoes-correios-${formato}-${new Date().toISOString().slice(0, 10)}${orderIds.length > 30 ? `-${Math.floor(i / 30) + 1}` : ''}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    baixadas += typeof data.total === 'number' ? data.total : lote.length;
    if (Array.isArray(data.pedidos_postados)) jaPostados.push(...data.pedidos_postados);
  }
  if (jaPostados.length) onJaPostados?.(jaPostados);
  return baixadas;
}
