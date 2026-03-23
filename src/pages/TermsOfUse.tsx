const TermsOfUse = () => {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-primary py-6 text-center shadow-md">
        <div className="text-3xl font-extrabold text-primary-foreground tracking-wide">
          Order<span className="opacity-80">Zap</span>
        </div>
      </header>

      <nav className="bg-background border-b flex justify-center gap-8 py-3.5">
        <a href="/politica-de-privacidade" className="text-primary font-semibold text-sm hover:border-b-2 hover:border-primary/70 transition-colors">
          Política de Privacidade
        </a>
        <a href="/termos-de-uso" className="text-primary font-semibold text-sm border-b-2 border-primary">
          Termos de Uso
        </a>
      </nav>

      <div className="max-w-[860px] mx-auto my-12 bg-background rounded-xl shadow-lg px-14 py-12 max-sm:px-5 max-sm:py-7 max-sm:mx-3 max-sm:my-6">
        <h1 className="text-3xl font-bold text-primary mb-2 max-sm:text-xl">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-8">Última atualização: 23 de março de 2026</p>

        <p className="mb-3.5 leading-7">
          Bem-vindo ao <strong className="text-primary/90">OrderZap</strong>. Estes Termos de Uso ("Termos") regem o seu acesso e uso do aplicativo OrderZap, seus serviços, recursos e site associado (<a href="https://app.orderzap.com.br" className="text-primary hover:underline">app.orderzap.com.br</a>). O OrderZap é uma plataforma desenvolvida para facilitar a gestão de pedidos via WhatsApp, operada no Brasil.
        </p>
        <p className="mb-3.5 leading-7">
          Ao acessar ou utilizar o OrderZap, você concorda em ficar vinculado a estes Termos. Se você não concordar com qualquer parte destes Termos, não deverá utilizar nossos serviços.
        </p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">1. Aceitação dos Termos</h2>
        <p className="mb-3.5 leading-7">
          Ao criar uma conta, fazer login (incluindo via Facebook Login) ou utilizar o OrderZap de qualquer forma, você declara que leu, compreendeu e concorda com estes Termos de Uso e com a nossa <a href="/politica-de-privacidade" className="text-primary hover:underline">Política de Privacidade</a>.
        </p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">2. Descrição do Serviço</h2>
        <p className="mb-3.5 leading-7">
          O OrderZap fornece ferramentas para a gestão de pedidos recebidos via WhatsApp, permitindo que os usuários organizem, acompanhem e respondam a solicitações de clientes de forma eficiente. O serviço pode incluir integrações com plataformas de terceiros, como a Meta (Facebook, WhatsApp).
        </p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">3. Elegibilidade e Cadastro</h2>
        <ul className="list-disc ml-6 mb-3.5 space-y-2">
          <li><strong className="text-primary/90">Idade Mínima:</strong> Você deve ter pelo menos 18 anos de idade para utilizar o OrderZap.</li>
          <li><strong className="text-primary/90">Informações Precisas:</strong> Ao se cadastrar, você concorda em fornecer informações precisas, atuais e completas. Você é responsável por manter a confidencialidade de suas credenciais de login.</li>
          <li><strong className="text-primary/90">Uso Pessoal e Comercial:</strong> O OrderZap pode ser utilizado para fins pessoais ou comerciais, desde que em conformidade com estes Termos.</li>
        </ul>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">4. Uso Aceitável</h2>
        <p className="mb-3.5 leading-7">Você concorda em utilizar o OrderZap apenas para fins legais. Você não deve:</p>
        <ul className="list-disc ml-6 mb-3.5 space-y-2">
          <li>Utilizar o serviço para enviar spam, mensagens não solicitadas ou conteúdo abusivo;</li>
          <li>Violar os Termos de Serviço do WhatsApp, do Facebook ou de qualquer outra plataforma integrada;</li>
          <li>Tentar obter acesso não autorizado aos nossos sistemas;</li>
          <li>Interferir ou interromper o funcionamento do aplicativo;</li>
          <li>Utilizar o OrderZap para atividades fraudulentas, ilegais ou que violem os direitos de terceiros.</li>
        </ul>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">5. Integração com a Meta (Facebook e WhatsApp)</h2>
        <p className="mb-3.5 leading-7">
          O OrderZap pode utilizar APIs e serviços fornecidos pela Meta Platforms, Inc. Ao utilizar essas integrações, você também concorda em cumprir os Termos de Serviço da Meta. O OrderZap não é afiliado, endossado ou patrocinado pela Meta.
        </p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">6. Propriedade Intelectual</h2>
        <p className="mb-3.5 leading-7">
          Todos os direitos, títulos e interesses relativos ao OrderZap, incluindo seu design, código-fonte, logotipos e conteúdo são de propriedade exclusiva do OrderZap ou de seus licenciadores. Você não adquire nenhum direito de propriedade ao utilizar o serviço.
        </p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">7. Limitação de Responsabilidade</h2>
        <p className="mb-3.5 leading-7">Na extensão máxima permitida por lei, o OrderZap não será responsável por quaisquer danos indiretos decorrentes de:</p>
        <ul className="list-disc ml-6 mb-3.5 space-y-2">
          <li>Seu uso ou incapacidade de usar o serviço;</li>
          <li>Qualquer acesso não autorizado ou uso de nossos servidores;</li>
          <li>Qualquer interrupção ou cessação de transmissão;</li>
          <li>Quaisquer bugs, vírus ou similares transmitidos por terceiros.</li>
        </ul>
        <p className="mb-3.5 leading-7">O OrderZap não garante que o serviço será ininterrupto, livre de erros ou totalmente seguro.</p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">8. Modificações nos Termos</h2>
        <p className="mb-3.5 leading-7">
          Reservamo-nos o direito de modificar estes Termos a qualquer momento. Se uma revisão for material, tentaremos fornecer um aviso prévio de pelo menos 30 dias.
        </p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">9. Rescisão</h2>
        <p className="mb-3.5 leading-7">
          Podemos encerrar ou suspender seu acesso ao OrderZap imediatamente, sem aviso prévio, por qualquer motivo, incluindo violação destes Termos.
        </p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">10. Lei Aplicável e Foro</h2>
        <p className="mb-3.5 leading-7">
          Estes Termos serão regidos pelas leis da República Federativa do Brasil. Qualquer disputa será submetida à jurisdição exclusiva dos tribunais brasileiros.
        </p>

        <h2 className="text-lg font-semibold text-primary mt-9 mb-2.5 pb-1.5 border-b-2 border-primary/10">11. Contato</h2>
        <p className="mb-3.5 leading-7">
          Se você tiver alguma dúvida sobre estes Termos, entre em contato através do nosso site: <a href="https://app.orderzap.com.br" className="text-primary hover:underline">app.orderzap.com.br</a>.
        </p>
      </div>

      <footer className="text-center py-6 text-sm text-muted-foreground">
        &copy; 2026 OrderZap. Todos os direitos reservados.
      </footer>
    </div>
  );
};

export default TermsOfUse;
