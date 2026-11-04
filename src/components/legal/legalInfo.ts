/**
 * Dados da empresa que aparecem nos Termos de Uso e na Política de Privacidade.
 * Preencha RAZAO_SOCIAL e CNPJ: enquanto estiverem vazios, as páginas mostram só "Cartzy".
 */
export const LEGAL = {
  NOME: "Cartzy",
  RAZAO_SOCIAL: "",
  CNPJ: "",
  CIDADE_FORO: "Belo Horizonte/MG",
  EMAIL: "cartzy.saas@gmail.com",
  WHATSAPP: "(31) 99290-4210",
  WHATSAPP_URL: "http://api.whatsapp.com/send?l=pt&phone=5531992904210",
  SITE: "https://cartzy.com.br",
  APP: "https://app.cartzy.com.br",
  ATUALIZADO_EM: "3 de novembro de 2026",
};

/** "Cartzy" ou "Cartzy, nome comercial de RAZÃO SOCIAL, inscrita no CNPJ nº ..." */
export function identificacaoEmpresa(): string {
  if (!LEGAL.RAZAO_SOCIAL) return LEGAL.NOME;
  const cnpj = LEGAL.CNPJ ? `, inscrita no CNPJ sob o nº ${LEGAL.CNPJ}` : "";
  return `${LEGAL.NOME}, nome comercial de ${LEGAL.RAZAO_SOCIAL}${cnpj}`;
}
