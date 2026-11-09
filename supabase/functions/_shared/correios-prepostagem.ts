// Montagem da pré-postagem dos Correios (API CWS) no formato validado em produção no sistema Troca Fácil (easy-swap-pro):
//  - o corpo NÃO leva `cartaoPostagem` (o cartão é definido pelo token);
//  - pessoa = { nome, cpfCnpj, email, dddCelular/celular ou dddTelefone/telefone, endereco };
//  - `cienteObjetoNaoProibido: "1"`, peso em gramas (texto), dimensões em cm (texto);
//  - declaração de conteúdo com os produtos do pedido (um item com o valor total).
// Funções puras (sem rede e sem banco) para poderem ser testadas.

export interface PessoaPostagem {
  nome: string;
  cpfCnpj?: string | null;
  telefone?: string | null;
  email?: string | null;
  logradouro: string;
  numero?: string | null;
  complemento?: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}

export interface DadosPrePostagem {
  remetente: PessoaPostagem;
  destinatario: PessoaPostagem;
  codigoServico: string;
  pesoGramas: number;
  dimensoesCm: { altura: number; largura: number; comprimento: number };
  descricaoConteudo: string;
  valorDeclarado: number;
}

// Serviços de contrato (os códigos da cotação do frete, em correios-shipping)
export const SERVICO_PAC = "04669";
export const SERVICO_SEDEX = "04162";
export const SERVICO_SEDEX_12 = "03140";
export const SERVICO_MINI_ENVIOS = "04227";
// Códigos antigos dos mesmos serviços: alguns cartões só aceitam esses na pré-postagem
const SERVICO_PAC_ANTIGO = "03298";
const SERVICO_SEDEX_ANTIGO = "03220";
const SERVICOS_CONHECIDOS = new Set([SERVICO_PAC, SERVICO_SEDEX, SERVICO_SEDEX_12, SERVICO_MINI_ENVIOS, SERVICO_PAC_ANTIGO, SERVICO_SEDEX_ANTIGO]);

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/**
 * Códigos dos serviços no contrato de CADA empresa (coluna `shipping_integrations.service_codes`). Cada cartão de postagem
 * tem os seus: o de uma empresa pode ter PAC 03298 e SEDEX 03220 e não ter 04669/04162. Serviço que não estiver aqui usa o
 * código padrão do sistema.
 */
export interface CodigosServico {
  PAC?: string;
  SEDEX?: string;
  "Mini Envios"?: string;
}

/** Lê o JSON salvo na integração e descarta o que não for código de serviço (4 ou 5 dígitos). */
export function parseCodigosServico(raw: unknown): CodigosServico {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { return {}; }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: CodigosServico = {};
  for (const nome of ["PAC", "SEDEX", "Mini Envios"] as const) {
    const d = digits((obj as Record<string, unknown>)[nome]);
    if (d.length >= 4 && d.length <= 5) out[nome] = d.padStart(5, "0");
  }
  return out;
}

/** Código do mesmo serviço no contrato da empresa: PAC (04669/03298) vira o PAC dela, SEDEX (04162/03220) vira o SEDEX dela. */
function codigoDoContrato(servico: string, codigos?: CodigosServico): string {
  if (!codigos) return servico;
  if ((servico === SERVICO_PAC || servico === SERVICO_PAC_ANTIGO) && codigos.PAC) return codigos.PAC;
  if ((servico === SERVICO_SEDEX || servico === SERVICO_SEDEX_ANTIGO) && codigos.SEDEX) return codigos.SEDEX;
  if (servico === SERVICO_MINI_ENVIOS && codigos["Mini Envios"]) return codigos["Mini Envios"];
  return servico;
}

/**
 * Serviço que o cliente escolheu no checkout: primeiro o `shipping_service_id` gravado no pedido (o zero à esquerda se perde,
 * 4227 = 04227); se não houver, o nome na observação ("[FRETE] Correios - SEDEX | ..."). Devolve null quando o pedido não diz
 * qual serviço é: nesse caso é melhor avisar do que adivinhar e postar no serviço errado.
 * Com `codigos`, o resultado já vem no código do contrato da empresa (PAC 04669 do pedido antigo vira o 03298 dela).
 */
export function servicoDoPedido(
  observacao: string | null | undefined,
  shippingServiceId?: string | number | null,
  codigos?: CodigosServico,
): string | null {
  const id = shippingServiceId != null ? digits(shippingServiceId).padStart(5, "0") : "";
  if (id && (SERVICOS_CONHECIDOS.has(id) || Object.values(codigos || {}).includes(id))) return codigoDoContrato(id, codigos);
  const o = String(observacao || "").toUpperCase();
  if (o.includes("SEDEX 12") || o.includes("SEDEX12")) return SERVICO_SEDEX_12;
  if (o.includes("SEDEX")) return codigoDoContrato(SERVICO_SEDEX, codigos);
  if (o.includes("MINI")) return codigoDoContrato(SERVICO_MINI_ENVIOS, codigos);
  if (o.includes("PAC")) return codigoDoContrato(SERVICO_PAC, codigos);
  return null;
}

/**
 * O Mini Envios tem caixa própria: 16 x 11 x 3 cm. Os Correios só aceitam até 4 cm de altura nesse serviço (PPN-055),
 * então a caixa padrão da empresa (por exemplo 15 x 11 x 6) não vale para ele. PAC e SEDEX usam a caixa da empresa.
 */
export const CAIXA_MINI_ENVIOS_CM = { comprimento: 16, largura: 11, altura: 3 };

export function ajustarDimensoes(
  servico: string,
  dim: { altura: number; largura: number; comprimento: number },
  codigos?: CodigosServico,
): { altura: number; largura: number; comprimento: number } {
  const mini = codigos?.["Mini Envios"] || SERVICO_MINI_ENVIOS;
  return servico === mini ? { ...CAIXA_MINI_ENVIOS_CM } : dim;
}

/**
 * Códigos a tentar, na ordem, para o MESMO serviço (nunca troca PAC por SEDEX). Se o código é o que a empresa cadastrou no
 * contrato, é só ele: não faz sentido tentar o de outro contrato.
 */
export function codigosParaTentar(servico: string, codigos?: CodigosServico): string[] {
  if (codigos && Object.values(codigos).includes(servico)) return [servico];
  if (servico === SERVICO_PAC || servico === SERVICO_PAC_ANTIGO) return [SERVICO_PAC, SERVICO_PAC_ANTIGO].sort((a, b) => (a === servico ? -1 : b === servico ? 1 : 0));
  if (servico === SERVICO_SEDEX || servico === SERVICO_SEDEX_ANTIGO) return [SERVICO_SEDEX, SERVICO_SEDEX_ANTIGO].sort((a, b) => (a === servico ? -1 : b === servico ? 1 : 0));
  return [servico];
}

/** Os Correios dizem "Serviços 04669 não encontrados para o cartão de postagem ...": o código não existe nesse cartão. */
export function codigoNaoExisteNoCartao(texto: string): boolean {
  return /Servi[cç]os?\s+\d+\s+n[aã]o\s+encontrados?/i.test(String(texto || ""));
}

function separarTelefone(raw?: string | null) {
  let d = digits(raw);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10) return null;
  const numero = d.slice(2);
  return { ddd: d.slice(0, 2), numero, celular: numero.length >= 9 };
}

export function pessoaDTO(p: PessoaPostagem) {
  const fone = separarTelefone(p.telefone);
  const doc = digits(p.cpfCnpj);
  const complemento = String(p.complemento || "").trim();
  return {
    nome: String(p.nome || "").trim().slice(0, 50),
    ...(doc ? { cpfCnpj: doc } : {}),
    ...(p.email ? { email: String(p.email).trim() } : {}),
    ...(fone?.celular ? { dddCelular: fone.ddd, celular: fone.numero } : {}),
    ...(fone && !fone.celular ? { dddTelefone: fone.ddd, telefone: fone.numero } : {}),
    endereco: {
      cep: digits(p.cep).slice(0, 8),
      logradouro: String(p.logradouro || "").trim().slice(0, 50),
      numero: String(p.numero || "S/N").trim().slice(0, 6) || "S/N",
      ...(complemento ? { complemento: complemento.slice(0, 30) } : {}),
      bairro: String(p.bairro || "").trim().slice(0, 30),
      cidade: String(p.cidade || "").trim().slice(0, 50),
      uf: String(p.uf || "").trim().toUpperCase().slice(0, 2),
    },
  };
}

/** Confere o que os Correios exigem. O remetente precisa de CPF/CNPJ; o destinatário, não. */
export function validarPessoa(tipo: "remetente" | "destinatario", p: PessoaPostagem): string[] {
  const campos: Array<[string, unknown]> = [
    ["nome", p.nome],
    ...(tipo === "remetente" ? ([["CPF/CNPJ", p.cpfCnpj]] as Array<[string, unknown]>) : []),
    ["logradouro", p.logradouro],
    ["bairro", p.bairro],
    ["cidade", p.cidade],
    ["UF", p.uf],
    ["CEP", p.cep],
  ];
  return campos.filter(([, v]) => !String(v ?? "").trim()).map(([c]) => c);
}

export function montarCorpoPrePostagem(d: DadosPrePostagem) {
  const faltaRem = validarPessoa("remetente", d.remetente);
  if (faltaRem.length) {
    throw new Error(`Dados da empresa (remetente) incompletos: ${faltaRem.join(", ")}. Preencha em Configurações > Empresa.`);
  }
  const faltaDest = validarPessoa("destinatario", d.destinatario);
  if (faltaDest.length) {
    throw new Error(`Dados do cliente (destinatário) incompletos: ${faltaDest.join(", ")}.`);
  }
  const dim = d.dimensoesCm;
  return {
    remetente: pessoaDTO(d.remetente),
    destinatario: pessoaDTO(d.destinatario),
    codigoServico: d.codigoServico,
    pesoInformado: String(Math.max(1, Math.round(d.pesoGramas))),
    codigoFormatoObjetoInformado: "2",
    alturaInformada: String(Math.max(1, Math.round(dim.altura))),
    larguraInformada: String(Math.max(1, Math.round(dim.largura))),
    comprimentoInformado: String(Math.max(1, Math.round(dim.comprimento))),
    cienteObjetoNaoProibido: "1",
    itensDeclaracaoConteudo: [
      {
        conteudo: String(d.descricaoConteudo || "Semijoia").slice(0, 200),
        quantidade: "1",
        valor: (Number(d.valorDeclarado) > 0 ? Number(d.valorDeclarado) : 1).toFixed(2),
      },
    ],
  };
}

/** Texto de erro dos Correios: junta as mensagens (`msgs`) quando a resposta é JSON. */
export function mensagemErroCorreios(status: number, corpo: string): string {
  let detalhe = String(corpo || "").slice(0, 400);
  try {
    const j = JSON.parse(corpo);
    if (Array.isArray(j?.msgs) && j.msgs.length) detalhe = j.msgs.join("; ");
    else if (typeof j?.message === "string") detalhe = j.message;
  } catch { /* corpo não é JSON: usa o texto bruto */ }
  return `Falha na API dos Correios (HTTP ${status}): ${detalhe}`;
}

/**
 * Situação do objeto a partir do rastreio oficial (SRO), eventos do mais recente para o mais antigo.
 * "FC" = etiqueta emitida, aguardando postagem (ou cancelada, se a descrição disser). Qualquer outro evento
 * (postado, em trânsito, entregue...) significa que o objeto já está com os Correios. Sem eventos = ainda não postado.
 */
export function situacaoRastreio(eventos: Array<{ codigo?: string; descricao?: string }>): "aguardando" | "cancelada" | "postado" {
  const ultimo = eventos?.[0];
  if (!ultimo) return "aguardando";
  if (String(ultimo.codigo || "").toUpperCase() === "FC") return /cancelad/i.test(String(ultimo.descricao || "")) ? "cancelada" : "aguardando";
  return "postado";
}
