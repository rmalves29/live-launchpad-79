const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-primary py-6 text-center shadow-md">
        <div className="text-3xl font-extrabold text-primary-foreground tracking-wide">
          Order<span className="opacity-80">Zap</span>
        </div>
      </header>

      <nav className="bg-background border-b flex justify-center gap-8 py-3.5">
        <a href="/politica-de-privacidade" className="text-primary font-semibold text-sm border-b-2 border-primary">
          Política de Privacidade
        </a>
        <a href="/termos-de-uso" className="text-primary font-semibold text-sm hover:border-b-2 hover:border-primary/70 transition-colors">
          Termos de Uso
        </a>
      </nav>

      <div className="max-w-[860px] mx-auto my-12 bg-background rounded-xl shadow-lg px-14 py-12 max-sm:px-5 max-sm:py-7 max-sm:mx-3 max-sm:my-6">
        <h1 className="text-3xl font-bold text-primary mb-2 max-sm:text-xl">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-8">Última atualização: 23 de março de 2026</p>

        <p className="mb-3.5 leading-7">
          A presente Política de Privacidade descreve como o <strong className="text-primary/90">OrderZap</strong> ("nós", "nosso" ou "aplicativo") coleta, utiliza, compartilha e protege as informações pessoais dos usuários ("você", "seu") em conexão com o uso do nosso aplicativo e serviços relacionados. O OrderZap é uma ferramenta desenvolvida para a gestão de pedidos via WhatsApp, operada no Brasil.
        </p>
        <p className="mb-3.5 leading-7">
          Ao utilizar o OrderZap, você concorda com as práticas descritas nesta política. Esta Política de Privacidade foi elaborada em conformidade com a <strong className="text-primary/90">Lei Geral de Proteção de Dados Pessoais (LGPD – Lei nº 13.709/2018)</strong> do Brasil e com os requisitos da Política de Plataforma da Meta.
        </p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">1. Informações que Coletamos</h2>
        <p className="mb-3.5 leading-7">Para fornecer nossos serviços de gestão de pedidos, podemos coletar os seguintes tipos de informações:</p>
        <ul className="list-disc ml-6 mb-3.5 space-y-2">
          <li><strong className="text-primary/90">Informações de Conta e Perfil:</strong> Quando você se cadastra ou faz login no OrderZap utilizando o Facebook Login ou outras plataformas da Meta, coletamos informações públicas do seu perfil, como nome, endereço de e-mail e foto de perfil, conforme as permissões concedidas por você.</li>
          <li><strong className="text-primary/90">Dados de Pedidos e Clientes:</strong> Coletamos informações relacionadas aos pedidos gerenciados através do aplicativo, incluindo dados de contato de clientes (como números de WhatsApp), detalhes dos produtos ou serviços solicitados e histórico de transações.</li>
          <li><strong className="text-primary/90">Informações de Uso e Dispositivo:</strong> Coletamos automaticamente dados sobre como você interage com o aplicativo, incluindo endereço IP, tipo de navegador, sistema operacional, páginas visitadas e horários de acesso.</li>
        </ul>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">2. Como Utilizamos as Informações</h2>
        <p className="mb-3.5 leading-7">As informações coletadas são utilizadas para as seguintes finalidades:</p>
        <ul className="list-disc ml-6 mb-3.5 space-y-2">
          <li><strong className="text-primary/90">Fornecimento do Serviço:</strong> Para operar, manter e melhorar as funcionalidades do OrderZap.</li>
          <li><strong className="text-primary/90">Comunicação:</strong> Para enviar atualizações sobre o serviço, responder a solicitações de suporte e fornecer informações administrativas.</li>
          <li><strong className="text-primary/90">Segurança e Conformidade:</strong> Para monitorar atividades suspeitas, prevenir fraudes e cumprir obrigações legais.</li>
          <li><strong className="text-primary/90">Integração com a Meta:</strong> Para autenticar usuários e facilitar a integração com os serviços da Meta.</li>
        </ul>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">3. Compartilhamento de Informações</h2>
        <p className="mb-3.5 leading-7">Nós <strong className="text-primary/90">não vendemos</strong> suas informações pessoais. Podemos compartilhar nas seguintes circunstâncias:</p>
        <ul className="list-disc ml-6 mb-3.5 space-y-2">
          <li><strong className="text-primary/90">Com Provedores de Serviços:</strong> Empresas terceirizadas que auxiliam na operação do aplicativo, sujeitas a obrigações de confidencialidade.</li>
          <li><strong className="text-primary/90">Com a Meta Platforms, Inc.:</strong> Ao utilizar recursos integrados ao Facebook ou WhatsApp, certas informações podem ser compartilhadas com a Meta.</li>
          <li><strong className="text-primary/90">Requisitos Legais:</strong> Podemos divulgar informações se exigido por lei, ordem judicial ou regulamentação governamental.</li>
        </ul>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">4. Retenção e Exclusão de Dados</h2>
        <p className="mb-3.5 leading-7">
          Retemos suas informações pessoais apenas pelo tempo necessário para cumprir as finalidades descritas nesta política ou conforme exigido por lei.
        </p>
        <p className="mb-3.5 leading-7">
          <strong className="text-primary/90">Solicitação de Exclusão de Dados:</strong> Você tem o direito de solicitar a exclusão dos seus dados pessoais a qualquer momento. Entre em contato através do site <a href="https://app.orderzap.com.br" className="text-primary hover:underline">app.orderzap.com.br</a> ou utilize a opção de exclusão de conta dentro do aplicativo.
        </p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">5. Seus Direitos (LGPD)</h2>
        <p className="mb-3.5 leading-7">De acordo com a LGPD, você possui os seguintes direitos:</p>
        <ul className="list-disc ml-6 mb-3.5 space-y-2">
          <li>Confirmação da existência de tratamento;</li>
          <li>Acesso aos dados;</li>
          <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
          <li>Portabilidade dos dados a outro fornecedor de serviço;</li>
          <li>Eliminação dos dados pessoais tratados com o consentimento;</li>
          <li>Informação sobre o compartilhamento de dados.</li>
        </ul>
        <p className="mb-3.5 leading-7">Para exercer esses direitos, entre em contato através do site <a href="https://app.orderzap.com.br" className="text-primary hover:underline">app.orderzap.com.br</a>.</p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">6. Segurança das Informações</h2>
        <p className="mb-3.5 leading-7">
          Implementamos medidas de segurança técnicas e organizacionais adequadas para proteger suas informações pessoais contra acesso não autorizado, perda, destruição ou alteração.
        </p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">7. Alterações a esta Política</h2>
        <p className="mb-3.5 leading-7">
          Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos sobre quaisquer alterações significativas publicando a nova política em nosso site e atualizando a data de "Última atualização".
        </p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">8. Contato</h2>
        <p className="mb-3.5 leading-7">
          Se você tiver dúvidas, entre em contato conosco através do nosso site: <a href="https://app.orderzap.com.br" className="text-primary hover:underline">app.orderzap.com.br</a>.
        </p>
      </div>

      <footer className="text-center py-6 text-sm text-muted-foreground">
        &copy; 2026 OrderZap. Todos os direitos reservados.
      </footer>
    </div>
  );
};

export default PrivacyPolicy;
