import type { ReactNode } from "react";
import LegalLayout from "@/components/legal/LegalLayout";
import { LEGAL, identificacaoEmpresa } from "@/components/legal/legalInfo";

const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">{children}</h2>
);
const P = ({ children }: { children: ReactNode }) => <p className="mb-3.5 leading-7">{children}</p>;
const UL = ({ children }: { children: ReactNode }) => <ul className="list-disc ml-6 mb-3.5 space-y-2">{children}</ul>;
const B = ({ children }: { children: ReactNode }) => <strong className="text-primary/90">{children}</strong>;

const Contato = () => (
  <>
    <a href={`mailto:${LEGAL.EMAIL}`}>{LEGAL.EMAIL}</a> ou pelo WhatsApp{" "}
    <a href={LEGAL.WHATSAPP_URL} target="_blank" rel="noopener noreferrer">{LEGAL.WHATSAPP}</a>
  </>
);

const TermsOfUse = () => {
  return (
    <LegalLayout current="terms">
      <h1 className="text-3xl font-bold text-primary mb-2 max-sm:text-xl">Termos de Uso</h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: {LEGAL.ATUALIZADO_EM}</p>

      <P>
        Estes Termos de Uso ("Termos") regem a contratação e o uso da plataforma <B>{identificacaoEmpresa()}</B> ("Cartzy",
        "nós"), disponível em <a href={LEGAL.APP}>app.cartzy.com.br</a> e <a href={LEGAL.SITE}>cartzy.com.br</a>. O Cartzy é
        um software como serviço (SaaS) para lojistas organizarem pedidos, clientes, cobranças e envios de vendas feitas pelo
        WhatsApp, por grupos VIP e por transmissões ao vivo (Lives) no Instagram.
      </P>
      <P>
        Ao marcar a opção "Li e aceito", criar uma conta, contratar um plano ou usar o Cartzy, você declara que leu e
        concorda com estes Termos e com a nossa <a href="/politica-de-privacidade">Política de Privacidade</a>. Se não
        concordar, não utilize a plataforma.
      </P>

      <H2>1. Definições</H2>
      <UL>
        <li><B>Cliente ou Lojista:</B> a pessoa física ou jurídica que contrata o Cartzy para a sua loja.</li>
        <li><B>Usuário:</B> qualquer pessoa que acessa a conta do Cliente, incluindo o responsável e os membros da equipe cadastrados por ele.</li>
        <li><B>Consumidor Final:</B> o cliente da loja do Lojista, cujos pedidos e dados são registrados no Cartzy.</li>
        <li><B>Plano:</B> a assinatura mensal escolhida na contratação, com os recursos e o preço informados no momento da compra.</li>
        <li><B>Afiliado:</B> a pessoa cadastrada no Programa de Indicação do Cartzy que indica novos Clientes.</li>
      </UL>

      <H2>2. Cadastro e conta</H2>
      <UL>
        <li>Para contratar, você precisa ter pelo menos 18 anos e capacidade para assinar contratos, e informar dados verdadeiros, completos e atualizados da empresa (nome, CPF ou CNPJ, WhatsApp, e-mail e Instagram) e do responsável.</li>
        <li>Você mesmo cria o e-mail e a senha de acesso. A senha é pessoal: guarde-a em segurança e não a compartilhe. Para dar acesso à sua equipe, cadastre cada pessoa com o próprio login.</li>
        <li>Você é responsável por tudo que for feito na sua conta. Se suspeitar de uso indevido, troque a senha e nos avise imediatamente.</li>
        <li>Podemos recusar ou cancelar cadastros com dados falsos, duplicados, feitos de forma automatizada ou ligados a fraude.</li>
      </UL>

      <H2>3. Planos, preço e pagamento</H2>
      <UL>
        <li>O Cartzy é cobrado por assinatura mensal recorrente, no valor do Plano exibido no momento da contratação. Atualmente: Sistema de Live, R$ 299,00 por mês; Sistema de Grupos WhatsApp, R$ 299,00 por mês; e Combo com os dois sistemas, R$ 499,00 por mês. Impostos aplicáveis já estão incluídos no preço informado.</li>
        <li>O pagamento é processado pela Pagar.me ou por outro provedor de pagamento indicado na contratação. Os dados de cartão são digitados diretamente no ambiente do provedor e não passam pelos nossos servidores.</li>
        <li>A conta criada fica com o status "aguardando pagamento" e só é liberada depois da confirmação do primeiro pagamento. Cadastros não pagos em até 7 dias são marcados como expirados.</li>
        <li>A assinatura é renovada automaticamente a cada mês, na mesma forma de pagamento, até ser cancelada.</li>
        <li>Podemos reajustar os preços, avisando com pelo menos 30 dias de antecedência. O novo valor vale a partir da renovação seguinte ao aviso, e você pode cancelar antes dela se não concordar.</li>
        <li>Taxas cobradas por terceiros que você contratar diretamente (como gateways de pagamento das suas vendas, transportadoras, provedores de WhatsApp ou de nota fiscal) não estão incluídas no Plano e são de sua responsabilidade.</li>
      </UL>

      <H2>4. Atraso, suspensão e cancelamento</H2>
      <UL>
        <li><B>Atraso:</B> se uma mensalidade não for paga, o acesso pode ser suspenso até a regularização. Seus dados ficam preservados durante a suspensão.</li>
        <li><B>Cancelamento pelo Cliente:</B> você pode cancelar a qualquer momento pelo e-mail ou WhatsApp de contato. O cancelamento interrompe as próximas cobranças, e o acesso continua até o fim do período já pago. Não há multa nem fidelidade.</li>
        <li><B>Direito de arrependimento:</B> se você contratou pela internet, pode desistir em até 7 dias corridos após o primeiro pagamento e receber o valor de volta integralmente, conforme o art. 49 do Código de Defesa do Consumidor. Fora desse prazo, não há reembolso de mensalidades já pagas, inclusive proporcional.</li>
        <li><B>Cancelamento pelo Cartzy:</B> podemos suspender ou encerrar a conta, com aviso sempre que possível, em caso de violação destes Termos, uso ilegal, fraude, risco à segurança da plataforma ou falta de pagamento.</li>
        <li><B>Após o encerramento:</B> você pode pedir a exportação dos seus dados (pedidos e clientes) em até 90 dias. Depois desse prazo, os dados podem ser excluídos ou anonimizados, salvo o que a lei obrigar a guardar.</li>
      </UL>

      <H2>5. Reunião de onboarding e suporte</H2>
      <P>
        Após a confirmação do pagamento, você pode agendar uma reunião online de onboarding (cerca de 30 minutos) para
        configurar a conta e as integrações. O suporte é prestado em dias úteis, em horário comercial, pelos canais de
        contato informados abaixo. Ao nos conceder acesso às suas integrações para configuração, você autoriza que façamos
        apenas o necessário para colocá-las em funcionamento.
      </P>

      <H2>6. Uso aceitável</H2>
      <P>Você se compromete a usar o Cartzy apenas para fins lícitos. É proibido:</P>
      <UL>
        <li>enviar spam, mensagens em massa não solicitadas ou conteúdo enganoso, ofensivo ou ilegal;</li>
        <li>violar os termos e políticas do WhatsApp, do Instagram, do Facebook ou de qualquer serviço integrado;</li>
        <li>vender produtos proibidos, falsificados ou que dependam de autorização que você não tenha;</li>
        <li>cadastrar dados de terceiros sem base legal ou tratar dados pessoais em desacordo com a LGPD;</li>
        <li>tentar acessar áreas, contas ou dados que não sejam seus, ou explorar falhas de segurança;</li>
        <li>copiar, revender, sublicenciar, fazer engenharia reversa ou criar produto concorrente a partir do Cartzy;</li>
        <li>sobrecarregar a plataforma com robôs, scripts ou requisições automatizadas não autorizadas.</li>
      </UL>

      <H2>7. Integrações com terceiros</H2>
      <P>
        O Cartzy se conecta a serviços de terceiros, como WhatsApp, Instagram e Facebook (Meta), provedores de API de
        WhatsApp, gateways de pagamento (Mercado Pago, Pagar.me, Asaas, InfinitePay e outros), transportadoras e
        plataformas de frete (como Melhor Envio), emissores de nota fiscal e lojas virtuais. Esses serviços têm termos
        próprios, que você também deve cumprir. O Cartzy não é afiliado, patrocinado nem endossado pela Meta ou por esses
        fornecedores.
      </P>
      <P>
        Não controlamos e não respondemos pela disponibilidade, pelas regras ou pelas decisões desses terceiros. Isso inclui
        bloqueio ou banimento de números de WhatsApp, restrição de contas do Instagram, recusa ou estorno de pagamentos e
        atrasos de entrega. O uso de automações de mensagens deve respeitar os limites e as políticas de cada plataforma.
      </P>

      <H2>8. Seus dados e os dados dos seus clientes</H2>
      <UL>
        <li>Os dados que você cadastra ou recebe pela plataforma (produtos, pedidos, clientes e mensagens) pertencem a você.</li>
        <li>Em relação aos dados dos seus Consumidores Finais, você é o <B>controlador</B> e o Cartzy atua como <B>operador</B>, tratando esses dados apenas para executar o serviço, conforme suas instruções e a <a href="/politica-de-privacidade">Política de Privacidade</a>.</li>
        <li>Você é responsável por informar seus clientes sobre o uso dos dados deles e por ter base legal para enviar mensagens a eles.</li>
        <li>Mantemos medidas de segurança adequadas, mas recomendamos que você exporte periodicamente as informações importantes para o seu negócio.</li>
      </UL>

      <H2>9. Programa de Indicação (Afiliados)</H2>
      <UL>
        <li>O Afiliado recebe um link próprio. Quando um Cliente contrata pelo link ou é indicado pelo Afiliado, a indicação fica registrada para quem indicou primeiro, por até 60 dias.</li>
        <li>A comissão é um percentual (atualmente 20%) sobre as mensalidades efetivamente pagas pelo Cliente indicado, enquanto a assinatura estiver ativa. Não incide sobre taxas, serviços avulsos ou valores estornados.</li>
        <li>Cada comissão fica em carência por 30 dias e só é liberada se o pagamento não for cancelado, estornado ou contestado nesse período. Os pagamentos são feitos por PIX, mensalmente, quando o saldo liberado atingir o mínimo informado no painel do Afiliado.</li>
        <li>É proibido indicar a si mesmo, usar anúncios com a marca Cartzy sem autorização, enviar spam ou fazer promessas falsas sobre a plataforma. Comissões obtidas dessa forma são canceladas e o Afiliado pode ser descadastrado.</li>
        <li>O Afiliado não é empregado, sócio nem representante do Cartzy e é responsável pelos tributos sobre o que receber. As regras e o percentual podem mudar com aviso prévio, sem afetar comissões já liberadas.</li>
      </UL>

      <H2>10. Disponibilidade do serviço</H2>
      <P>
        Trabalhamos para manter o Cartzy disponível o tempo todo, mas podem ocorrer interrupções para manutenção,
        atualizações ou por falhas de terceiros (servidores, internet, provedores de WhatsApp e redes sociais). Sempre que
        possível, avisaremos com antecedência sobre manutenções programadas. Podemos melhorar, alterar ou remover recursos,
        preservando o núcleo do serviço contratado.
      </P>

      <H2>11. Propriedade intelectual</H2>
      <P>
        O software, a marca, o logotipo, o design e os conteúdos do Cartzy pertencem ao Cartzy ou aos seus licenciadores.
        A assinatura dá a você uma licença de uso pessoal, não exclusiva e intransferível, válida enquanto ela estiver ativa.
        Você mantém todos os direitos sobre seus produtos, fotos, textos e marcas cadastrados na plataforma.
      </P>

      <H2>12. Limitação de responsabilidade</H2>
      <UL>
        <li>O Cartzy é uma ferramenta de gestão: a venda, a entrega, a troca, a emissão de nota fiscal e o atendimento aos Consumidores Finais são responsabilidade do Lojista.</li>
        <li>Não respondemos por lucros cessantes, perda de vendas, danos indiretos ou por atos de terceiros e de plataformas integradas.</li>
        <li>Na máxima extensão permitida por lei, a responsabilidade total do Cartzy em relação a estes Termos fica limitada ao valor pago pelo Cliente nos 12 meses anteriores ao fato que originou a reclamação.</li>
        <li>Nada nestes Termos afasta direitos garantidos por lei que não possam ser limitados, especialmente os do Código de Defesa do Consumidor, quando aplicável.</li>
      </UL>

      <H2>13. Alterações destes Termos</H2>
      <P>
        Podemos atualizar estes Termos. Mudanças relevantes serão avisadas por e-mail, WhatsApp ou dentro da plataforma com
        pelo menos 30 dias de antecedência. Continuar usando o Cartzy depois desse prazo significa concordar com a nova
        versão; se não concordar, você pode cancelar sem multa.
      </P>

      <H2>14. Lei aplicável e foro</H2>
      <P>
        Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro da comarca de {LEGAL.CIDADE_FORO} para resolver
        qualquer disputa, ressalvado o direito do consumidor de propor ação no foro do próprio domicílio.
      </P>

      <H2>15. Contato</H2>
      <P>
        Dúvidas, cancelamentos e solicitações: escreva para <Contato />.
      </P>
    </LegalLayout>
  );
};

export default TermsOfUse;
