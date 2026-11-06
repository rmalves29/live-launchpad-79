/**
 * Declaração de conteúdo para postagem: gera o documento em HTML e abre a impressão do navegador
 * (o usuário imprime ou escolhe "Salvar como PDF"). Dois formatos: folha A4 e etiqueta térmica 10x15 cm.
 * Tudo que vem do pedido é escapado: o nome do cliente ou o produto nunca viram HTML.
 */

export type DeclarationFormat = 'a4' | 'thermal';

export interface DeclarationParty {
  name: string;
  document?: string | null;
  street: string;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city: string;
  state: string;
  cep: string;
}

export interface DeclarationItem {
  description: string;
  quantity: number;
  unitValue: number;
}

export interface DeclarationData {
  orderId: number | string;
  sender: DeclarationParty;
  recipient: DeclarationParty;
  items: DeclarationItem[];
  weightKg: number;
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const money = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const digits = (v: string | null | undefined) => String(v || '').replace(/\D/g, '');

export function formatCepBr(cep: string | null | undefined) {
  const d = digits(cep);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : String(cep || '');
}

export function formatDocumentBr(doc: string | null | undefined) {
  const d = digits(doc);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return String(doc || '');
}

function addressLine(p: DeclarationParty) {
  const parts = [
    [p.street, p.number].filter(Boolean).join(', '),
    p.complement,
    p.district,
    `${p.city}/${p.state}`,
    `CEP ${formatCepBr(p.cep)}`,
  ].filter(Boolean);
  return parts.join(' · ');
}

function partyBlock(title: string, p: DeclarationParty, docLabel: string) {
  return `<table>
    <colgroup><col style="width:56%"><col style="width:44%"></colgroup>
    <tr><th colspan="2">${esc(title)}</th></tr>
    <tr><td class="w">Nome: ${esc(p.name)}</td><td>${esc(docLabel)}: ${esc(formatDocumentBr(p.document) || '—')}</td></tr>
    <tr><td colspan="2">Endereço: ${esc(addressLine(p))}</td></tr>
  </table>`;
}

function oneDeclaration(d: DeclarationData, dateLabel: string) {
  const totalQty = d.items.reduce((s, i) => s + i.quantity, 0);
  const totalValue = d.items.reduce((s, i) => s + i.quantity * i.unitValue, 0);
  const rows = d.items
    .map(
      (i, idx) =>
        `<tr><td>${idx + 1}</td><td>${esc(i.description)}</td><td class="r">${i.quantity}</td><td class="r">${money(i.quantity * i.unitValue)}</td></tr>`,
    )
    .join('');
  return `<section class="page">
    <h1>DECLARAÇÃO DE CONTEÚDO</h1>
    ${partyBlock('REMETENTE', d.sender, 'CPF/CNPJ')}
    ${partyBlock('DESTINATÁRIO', d.recipient, 'CPF')}
    <table>
      <colgroup><col style="width:9%"><col><col style="width:14%"><col style="width:22%"></colgroup>
      <tr><th colspan="4">IDENTIFICAÇÃO DOS BENS</th></tr>
      <tr class="h"><td>Item</td><td>Conteúdo</td><td class="r">Quant.</td><td class="r">Valor (R$)</td></tr>
      ${rows}
      <tr class="h"><td colspan="2">Total</td><td class="r">${totalQty}</td><td class="r">${money(totalValue)}</td></tr>
      <tr><td colspan="2">Peso total: ${d.weightKg.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg</td><td colspan="2">Pedido nº ${esc(d.orderId)}</td></tr>
    </table>
    <p class="note">Declaro que as informações acima são verdadeiras e que o conteúdo não inclui objeto de postagem proibida pela legislação vigente.</p>
    <div class="sign"><div>${esc(d.sender.city)}, ${esc(dateLabel)}</div><div>Assinatura do remetente</div></div>
  </section>`;
}

const CSS_A4 = `
  @page { size: A4; margin: 14mm; }
  body { font: 12px/1.45 Arial, Helvetica, sans-serif; color: #111; margin: 0; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 12px; }
  table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 10px; }
  td, th { overflow-wrap: anywhere; }
  th, td { border: 1px solid #555; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #e8e8e8; }
  .h td { background: #f0f0f0; font-weight: bold; }
  .w { width: 58%; }
  .r { text-align: right; white-space: nowrap; }
  .note { font-size: 11px; color: #333; margin: 6px 0 0; }
  .sign { display: flex; gap: 24px; margin-top: 46px; }
  .sign div { flex: 1; border-top: 1px solid #333; text-align: center; padding-top: 4px; font-size: 11px; }
`;

const CSS_THERMAL = `
  @page { size: 100mm 150mm; margin: 4mm; }
  body { font: 9px/1.3 Arial, Helvetica, sans-serif; color: #000; margin: 0; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  h1 { font-size: 11px; text-align: center; margin: 0 0 5px; }
  table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 4px; }
  td, th { overflow-wrap: anywhere; }
  th, td { border: 0.6px solid #000; padding: 2px 4px; text-align: left; vertical-align: top; }
  th { background: #ddd; }
  .h td { background: #eee; font-weight: bold; }
  .w { width: 55%; }
  .r { text-align: right; white-space: nowrap; }
  .note { font-size: 7.5px; margin: 3px 0 0; }
  .sign { display: flex; gap: 10px; margin-top: 18px; }
  .sign div { flex: 1; border-top: 0.6px solid #000; text-align: center; padding-top: 2px; font-size: 7.5px; }
`;

export function declarationsHtml(list: DeclarationData[], format: DeclarationFormat, date = new Date()) {
  const dateLabel = date.toLocaleDateString('pt-BR');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Declaração de conteúdo</title><style>${
    format === 'thermal' ? CSS_THERMAL : CSS_A4
  }</style></head><body>${list.map((d) => oneDeclaration(d, dateLabel)).join('')}</body></html>`;
}

/** Abre a impressão do navegador com as declarações. Usa um quadro invisível para não esbarrar em bloqueio de pop-up. */
export function printDeclarations(list: DeclarationData[], format: DeclarationFormat) {
  const html = declarationsHtml(list, format);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) { iframe.remove(); throw new Error('Não foi possível preparar a impressão.'); }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  win.addEventListener('afterprint', cleanup);
  setTimeout(() => { win.focus(); win.print(); }, 250);
  setTimeout(() => iframe.remove(), 5 * 60 * 1000); // garantia caso o navegador não avise o fim da impressão
}
