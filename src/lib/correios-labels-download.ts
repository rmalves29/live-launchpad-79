/**
 * Baixa etiquetas dos Correios (um PDF por lote de até 30 pedidos) usando a ação get_labels_batch da função correios-labels.
 * Se os Correios ainda estiverem gerando, continua com os MESMOS recibos (até 4 rodadas) em vez de pedir etiqueta nova.
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

export async function baixarEtiquetasCorreios(
  invoke: InvokeFn,
  tenantId: string,
  orderIds: number[],
  onAguardando?: () => void,
  formato: FormatoEtiqueta = 'a4',
): Promise<number> {
  let baixadas = 0;
  for (let i = 0; i < orderIds.length; i += 30) {
    const lote = orderIds.slice(i, i + 30);
    let recibos: Record<string, string> | undefined;
    let data: any = null;
    let error: any = null;
    for (let rodada = 1; rodada <= 4; rodada++) {
      ({ data, error } = await invoke({
        action: 'get_labels_batch',
        order_ids: lote,
        formato,
        tenant_id: tenantId,
        ...(recibos ? { recibos } : {}),
      }));
      if (error || !data?.pending || !data?.recibos) break;
      recibos = data.recibos;
      if (rodada < 4) onAguardando?.();
    }
    if (error) throw new Error(data?.error || error.message || 'Erro ao baixar etiquetas');
    if (data?.pending) throw new Error('Os Correios ainda não terminaram de gerar as etiquetas. Tente de novo em alguns minutos.');
    if (!data?.success || !data?.labelPdfBase64) throw new Error(data?.error || 'Erro ao baixar etiquetas');
    const bytes = Uint8Array.from(atob(data.labelPdfBase64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `etiquetas-correios-${formato}-${new Date().toISOString().slice(0, 10)}${orderIds.length > 30 ? `-${Math.floor(i / 30) + 1}` : ''}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    baixadas += data.total || lote.length;
  }
  return baixadas;
}
