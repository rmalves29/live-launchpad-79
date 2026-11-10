// Declaração de conteúdo em PDF (pdf-lib), para sair no MESMO arquivo da etiqueta dos Correios:
// cada pedido sai como "etiqueta + declaração", na mesma ordem. Mesmo conteúdo da tela
// Integrações > Correios > Declaração de conteúdo (src/lib/content-declaration.ts).

export interface Parte {
  nome: string;
  documento?: string | null;
  rua: string;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade: string;
  uf: string;
  cep: string;
}
export interface ItemDecl {
  descricao: string;
  quantidade: number;
  valorUnit: number;
}
export interface Declaracao {
  pedidoId: number | string;
  remetente: Parte;
  destinatario: Parte;
  itens: ItemDecl[];
  pesoKg: number;
}

const so = (v: string | null | undefined) => String(v || "").replace(/\D/g, "");
const cepFmt = (v: string) => (so(v).length === 8 ? `${so(v).slice(0, 5)}-${so(v).slice(5)}` : String(v || ""));
function docFmt(v: string | null | undefined) {
  const d = so(v);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d ? String(v) : "—";
}
const reais = (v: number) => (Number(v) || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
// A fonte padrão do PDF (WinAnsi) não tem emoji nem alguns símbolos: troca o que não cabe por espaço.
const limpa = (s: unknown) =>
  String(s ?? "")
    .normalize("NFC")
    .replace(/[^\x20-\x7E -ÿ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const endereco = (p: Parte) =>
  limpa([[p.rua, p.numero].filter(Boolean).join(", "), p.complemento, p.bairro, `${p.cidade}/${p.uf}`, `CEP ${cepFmt(p.cep)}`]
    .filter(Boolean)
    .join(" · ")
    .replace(/·/g, "-"));

/** O que falta para montar a declaração deste pedido (vazio = dá para montar). */
export function faltaNaDeclaracao(d: Declaracao): string[] {
  const f: string[] = [];
  if (!d.itens.length) f.push("itens do pedido");
  if (!d.remetente.nome || !so(d.remetente.documento) || !d.remetente.rua || !d.remetente.cidade || !d.remetente.uf || !so(d.remetente.cep)) {
    f.push("dados da empresa (nome, CPF/CNPJ, endereço, cidade/UF e CEP em Configurações > Empresa)");
  }
  if (!d.destinatario.cidade || !d.destinatario.uf || !so(d.destinatario.cep)) f.push("endereço da cliente");
  return f;
}

// deno-lint-ignore no-explicit-any
export async function desenharDeclaracao(saida: any, d: Declaracao, termica: boolean, data = new Date()) {
  const { StandardFonts, rgb } = await import("npm:pdf-lib@1.17.1");
  const fonte = await saida.embedFont(StandardFonts.Helvetica);
  const negrito = await saida.embedFont(StandardFonts.HelveticaBold);
  const mm = 2.8346;
  const [W, H] = termica ? [100 * mm, 150 * mm] : [595.28, 841.89];
  const M = termica ? 4 * mm : 14 * mm;
  const fs = termica ? 6.8 : 10;
  const lh = fs * 1.35;
  const pad = termica ? 2.5 : 4;
  const largura = W - 2 * M;
  const cinza = rgb(0.9, 0.9, 0.9);
  const preto = rgb(0, 0, 0);

  let pagina = saida.addPage([W, H]);
  let y = H - M;

  const quebra = (txt: string, w: number, f = fonte, tam = fs): string[] => {
    const palavras = limpa(txt).split(" ");
    const linhas: string[] = [];
    let atual = "";
    for (const p of palavras) {
      const teste = atual ? `${atual} ${p}` : p;
      if (f.widthOfTextAtSize(teste, tam) <= w) { atual = teste; continue; }
      if (atual) linhas.push(atual);
      atual = p;
      while (f.widthOfTextAtSize(atual, tam) > w && atual.length > 1) {
        let corte = atual.length - 1;
        while (corte > 1 && f.widthOfTextAtSize(atual.slice(0, corte), tam) > w) corte--;
        linhas.push(atual.slice(0, corte));
        atual = atual.slice(corte);
      }
    }
    if (atual) linhas.push(atual);
    return linhas.length ? linhas : [""];
  };
  const novaPaginaSePreciso = (alt: number) => {
    if (y - alt < M) { pagina = saida.addPage([W, H]); y = H - M; }
  };
  // linha de tabela: células com largura relativa, texto quebrado, borda fina
  const linha = (cels: Array<{ t: string; w: number; dir?: boolean; b?: boolean; fundo?: boolean }>) => {
    const larguras = cels.map((c) => c.w * largura);
    const textos = cels.map((c, i) => quebra(c.t, larguras[i] - 2 * pad, c.b ? negrito : fonte));
    const alt = Math.max(...textos.map((t) => t.length)) * lh + 2 * pad - (lh - fs);
    novaPaginaSePreciso(alt);
    let x = M;
    cels.forEach((c, i) => {
      if (c.fundo) pagina.drawRectangle({ x, y: y - alt, width: larguras[i], height: alt, color: cinza });
      pagina.drawRectangle({ x, y: y - alt, width: larguras[i], height: alt, borderColor: preto, borderWidth: termica ? 0.5 : 0.7 });
      textos[i].forEach((tx, k) => {
        const f = c.b ? negrito : fonte;
        const tw = f.widthOfTextAtSize(tx, fs);
        const tx0 = c.dir ? x + larguras[i] - pad - tw : x + pad;
        pagina.drawText(tx, { x: tx0, y: y - pad - fs - k * lh + 1, size: fs, font: f, color: preto });
      });
      x += larguras[i];
    });
    y -= alt;
  };
  const espaco = (v: number) => { y -= v; };

  // título
  const titulo = "DECLARAÇÃO DE CONTEÚDO";
  const tt = termica ? 9 : 14;
  pagina.drawText(titulo, { x: (W - negrito.widthOfTextAtSize(titulo, tt)) / 2, y: y - tt, size: tt, font: negrito });
  y -= tt + (termica ? 5 : 10);

  const parte = (rotulo: string, p: Parte, docRot: string) => {
    linha([{ t: rotulo, w: 1, b: true, fundo: true }]);
    linha([{ t: `Nome: ${p.nome}`, w: 0.56 }, { t: `${docRot}: ${docFmt(p.documento)}`, w: 0.44 }]);
    linha([{ t: `Endereço: ${endereco(p)}`, w: 1 }]);
    espaco(termica ? 3 : 7);
  };
  parte("REMETENTE", d.remetente, "CPF/CNPJ");
  parte("DESTINATÁRIO", d.destinatario, "CPF");

  const cols = [0.09, 0.55, 0.14, 0.22];
  linha([{ t: "IDENTIFICAÇÃO DOS BENS", w: 1, b: true, fundo: true }]);
  linha([
    { t: "Item", w: cols[0], b: true, fundo: true },
    { t: "Conteúdo", w: cols[1], b: true, fundo: true },
    { t: "Quant.", w: cols[2], b: true, fundo: true, dir: true },
    { t: "Valor (R$)", w: cols[3], b: true, fundo: true, dir: true },
  ]);
  let qtdTotal = 0;
  let valorTotal = 0;
  d.itens.forEach((it, i) => {
    qtdTotal += it.quantidade;
    valorTotal += it.quantidade * it.valorUnit;
    linha([
      { t: String(i + 1), w: cols[0] },
      { t: it.descricao, w: cols[1] },
      { t: String(it.quantidade), w: cols[2], dir: true },
      { t: reais(it.quantidade * it.valorUnit), w: cols[3], dir: true },
    ]);
  });
  linha([
    { t: "Total", w: cols[0] + cols[1], b: true, fundo: true },
    { t: String(qtdTotal), w: cols[2], b: true, fundo: true, dir: true },
    { t: reais(valorTotal), w: cols[3], b: true, fundo: true, dir: true },
  ]);
  linha([
    { t: `Peso total: ${d.pesoKg.toFixed(3).replace(".", ",")} kg`, w: cols[0] + cols[1] },
    { t: `Pedido nº ${d.pedidoId}`, w: cols[2] + cols[3] },
  ]);

  espaco(termica ? 4 : 8);
  for (const l of quebra("Declaro que as informações acima são verdadeiras e que o conteúdo não inclui objeto de postagem proibida pela legislação vigente.", largura, fonte, fs * 0.9)) {
    novaPaginaSePreciso(lh);
    pagina.drawText(l, { x: M, y: y - fs, size: fs * 0.9, font: fonte });
    y -= lh;
  }

  // assinatura
  const altAss = termica ? 22 : 50;
  novaPaginaSePreciso(altAss + lh);
  y -= altAss;
  const metade = (largura - (termica ? 10 : 24)) / 2;
  const dataTxt = `${limpa(d.remetente.cidade)}, ${data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
  [[M, dataTxt], [M + metade + (termica ? 10 : 24), "Assinatura do remetente"]].forEach(([x, txt]) => {
    pagina.drawLine({ start: { x: x as number, y }, end: { x: (x as number) + metade, y }, thickness: 0.6, color: preto });
    const tw = fonte.widthOfTextAtSize(txt as string, fs * 0.9);
    pagina.drawText(txt as string, { x: (x as number) + (metade - tw) / 2, y: y - fs - 1, size: fs * 0.9, font: fonte });
  });
}
