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

const PrivacyPolicy = () => {
  return (
    <LegalLayout current="privacy">
      <h1 className="text-3xl font-bold text-primary mb-2 max-sm:text-xl">Política de Privacidade</h1>
      <p className="text-sm text-muted-foreground mb-8">Última atualização: {LEGAL.ATUALIZADO_EM}</p>

      <P>
        Esta Política explica como o <B>{identificacaoEmpresa()}</B> ("Cartzy", "nós") coleta, usa, compartilha e protege
        dados pessoais no site <a href={LEGAL.SITE}>cartzy.com.br</a>, na plataforma{" "}
        <a href={LEGAL.APP}>app.cartzy.com.br</a> e nos serviços relacionados. Ela segue a Lei Geral de Proteção de Dados
        Pessoais (<B>LGPD – Lei nº 13.709/2018</B>) e os requisitos da Política de Plataforma da Meta.
      </P>

      <H2>1. Quem é responsável pelos dados</H2>
      <UL>
        <li><B>Cartzy como controlador:</B> para os dados de quem visita o site, se cadastra, contrata o Cartzy, agenda reuniões ou participa do Programa de Indicação. Nesses casos, nós decidimos como os dados são usados.</li>
        <li><B>Cartzy como operador:</B> para os dados dos clientes das lojas (Consumidores Finais) que o Lojista registra ou recebe pela plataforma. O <B>controlador é o Lojista</B>, e nós tratamos esses dados apenas para prestar o serviço, conforme as instruções dele. Pedidos sobre esses dados devem ser feitos primeiro à loja; se você nos procurar, encaminharemos e apoiaremos a resposta.</li>
      </UL>

      <H2>2. Dados que coletamos</H2>
      <UL>
        <li><B>Cadastro e contratação:</B> nome do responsável, e-mail, senha (guardada de forma criptografada, que nem nós conseguimos ler), nome da empresa, CPF ou CNPJ, WhatsApp, @ do Instagram, cidade e estado, além do registro do aceite destes documentos.</li>
        <li><B>Pagamento da assinatura:</B> status das cobranças, valores, datas e identificadores fornecidos pelo provedor de pagamento. Os dados do cartão são digitados diretamente no ambiente do provedor (como a Pagar.me) e não passam pelos nossos servidores.</li>
        <li><B>Login com Facebook:</B> quando você entra com a Meta, recebemos nome, e-mail e foto do perfil, de acordo com as permissões que você conceder.</li>
        <li><B>Dados da operação da loja:</B> produtos, pedidos, carrinhos, valores, endereços de entrega, nomes e números de WhatsApp dos Consumidores Finais, mensagens trocadas e informações de envio e cobrança.</li>
        <li><B>Integração com o Instagram:</B> quando o Lojista conecta sua conta comercial, coletamos nome de usuário, ID e foto do perfil comercial. Durante as Lives, lemos os comentários públicos para identificar códigos de produtos e enviamos uma mensagem direta (DM) ao comprador confirmando o item no carrinho e o link para finalizar a compra. Guardamos o ID de quem comentou, o texto do comentário ligado ao pedido e a DM enviada, apenas pelo tempo necessário para o pedido.</li>
        <li><B>Agendamento de reuniões:</B> nome, empresa, WhatsApp, @ do Instagram e o horário escolhido para a apresentação ou o onboarding.</li>
        <li><B>Programa de Indicação:</B> dos Afiliados, nome, e-mail, WhatsApp, senha e chave PIX para o pagamento das comissões; das empresas indicadas, os dados informados na indicação e o código do Afiliado que fez a indicação.</li>
        <li><B>Navegação e uso:</B> endereço IP, navegador, sistema operacional, páginas acessadas, datas e horários, e a origem do acesso (como parâmetros de campanha e código de indicação no link).</li>
      </UL>

      <H2>3. Para que usamos e com qual base legal</H2>
      <UL>
        <li><B>Criar a conta, cobrar a assinatura e prestar o serviço</B>: execução de contrato (art. 7º, V, da LGPD).</li>
        <li><B>Processar pedidos, mensagens, envios e cobranças das lojas</B>: em nome do Lojista, que é o controlador desses dados.</li>
        <li><B>Agendar reuniões, dar suporte e enviar avisos sobre a conta</B> (como boas-vindas, confirmação de pagamento e lembretes de reunião) pelo WhatsApp e por e-mail: execução de contrato e procedimentos preliminares a ele.</li>
        <li><B>Identificar quem indicou um novo Cliente e calcular e pagar comissões</B>: execução do contrato com o Afiliado.</li>
        <li><B>Prevenir fraudes, cadastros falsos e abusos, e manter a segurança</B> (incluindo limite de tentativas e verificação contra robôs): legítimo interesse (art. 7º, IX).</li>
        <li><B>Melhorar o produto e medir o desempenho de campanhas</B>: legítimo interesse, com dados mínimos e, sempre que possível, agregados.</li>
        <li><B>Cumprir obrigações fiscais e legais e nos defender em processos</B>: obrigação legal e exercício regular de direitos (art. 7º, II e VI).</li>
        <li><B>Enviar novidades e ofertas do Cartzy</B>: quando houver relação com você ou o seu consentimento; você pode pedir para não receber mais a qualquer momento.</li>
      </UL>

      <H2>4. Com quem compartilhamos</H2>
      <P>Nós <B>não vendemos</B> dados pessoais. Compartilhamos apenas o necessário com:</P>
      <UL>
        <li><B>Infraestrutura e hospedagem:</B> provedores de nuvem e banco de dados que mantêm a plataforma funcionando.</li>
        <li><B>Pagamentos:</B> Pagar.me, Mercado Pago, Asaas, InfinitePay e outros provedores escolhidos, para cobrar a assinatura e processar os pagamentos das vendas das lojas.</li>
        <li><B>Mensagens:</B> provedores de API de WhatsApp usados para enviar confirmações, avisos e as mensagens configuradas pelo Lojista.</li>
        <li><B>Meta (Facebook, Instagram e WhatsApp):</B> nos recursos integrados, conforme as Políticas de Plataforma da Meta.</li>
        <li><B>Agenda:</B> Google Agenda e Google Meet, para criar o evento e o link da reunião agendada.</li>
        <li><B>Envio e notas fiscais:</B> transportadoras, plataformas de frete e emissores de nota fiscal que o Lojista conectar.</li>
        <li><B>Afiliados:</B> o Afiliado vê o nome da empresa que indicou, a situação da indicação e o valor da comissão. Ele não tem acesso aos dados internos da loja.</li>
        <li><B>Autoridades:</B> quando exigido por lei, ordem judicial ou autoridade competente.</li>
      </UL>
      <P>
        Alguns desses fornecedores podem armazenar dados em servidores fora do Brasil. Nesses casos, exigimos medidas de
        proteção compatíveis com a LGPD, conforme os arts. 33 a 36.
      </P>

      <H2>5. Cookies e armazenamento no navegador</H2>
      <P>
        Usamos cookies e armazenamento local essenciais para manter você conectado, lembrar preferências e registrar o
        código de indicação de quem chegou por um link de Afiliado. Também podemos usar ferramentas de medição para
        entender o uso do site. Você pode apagar ou bloquear cookies no navegador, mas algumas funções podem deixar de
        funcionar.
      </P>

      <H2>6. Por quanto tempo guardamos</H2>
      <UL>
        <li><B>Conta ativa:</B> enquanto a assinatura estiver vigente.</li>
        <li><B>Após o cancelamento:</B> até 90 dias, para permitir a exportação ou a reativação; depois, os dados são excluídos ou anonimizados.</li>
        <li><B>Cadastros não pagos:</B> ficam marcados como expirados após 7 dias e podem ser excluídos mediante pedido.</li>
        <li><B>Indicações sem contratação:</B> até 12 meses.</li>
        <li><B>Dados fiscais, de cobrança e de comissões:</B> pelo prazo exigido pela legislação (em geral, 5 anos).</li>
        <li><B>Registros de acesso:</B> pelo menos 6 meses, como determina o Marco Civil da Internet.</li>
      </UL>

      <H2>7. Seus direitos</H2>
      <P>Pela LGPD, você pode pedir, a qualquer momento:</P>
      <UL>
        <li>confirmação de que tratamos seus dados e acesso a eles;</li>
        <li>correção de dados incompletos, errados ou desatualizados;</li>
        <li>anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei;</li>
        <li>portabilidade a outro fornecedor;</li>
        <li>eliminação dos dados tratados com base no consentimento e revogação desse consentimento;</li>
        <li>informação sobre com quem compartilhamos seus dados;</li>
        <li>revisão de decisões tomadas apenas de forma automatizada.</li>
      </UL>
      <P>
        Envie o pedido para <Contato />. Responderemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de
        Proteção de Dados (ANPD).
      </P>

      <H2>8. Exclusão de dados do Instagram e da Meta</H2>
      <P>
        Se você comentou em uma Live de uma loja que usa o Cartzy e quer apagar os dados dessa interação (comentário
        processado e DM enviada), envie para <Contato /> o seu nome de usuário do Instagram e a conta da loja. Excluiremos
        os dados em até 15 dias úteis, exceto o que a lei obrigar a guardar (por exemplo, registros fiscais de uma compra
        concluída). O Lojista pode revogar o acesso do Cartzy à conta comercial a qualquer momento, clicando em
        "Desconectar" na tela de Integrações, o que interrompe imediatamente a coleta de novos dados.
      </P>

      <H2>9. Segurança</H2>
      <P>
        Usamos conexão criptografada (HTTPS), senhas protegidas por criptografia, controle de acesso por conta e por
        empresa, registros de atividade e limites contra tentativas abusivas. Nenhum sistema é 100% invulnerável; se
        ocorrer um incidente de segurança com risco relevante, avisaremos os afetados e a ANPD, conforme a lei.
      </P>

      <H2>10. Crianças e adolescentes</H2>
      <P>
        O Cartzy é destinado a maiores de 18 anos e não coleta intencionalmente dados de menores de idade como usuários
        da plataforma.
      </P>

      <H2>11. Encarregado de dados (DPO)</H2>
      <P>
        O canal do encarregado pelo tratamento de dados pessoais do Cartzy é <Contato />.
      </P>

      <H2>12. Alterações desta Política</H2>
      <P>
        Podemos atualizar esta Política. A versão vigente fica sempre nesta página, com a data da última atualização. Se
        as mudanças forem relevantes, avisaremos por e-mail, WhatsApp ou dentro da plataforma.
      </P>
    </LegalLayout>
  );
};

export default PrivacyPolicy;
