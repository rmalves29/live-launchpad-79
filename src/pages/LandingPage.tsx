import {
  MessageSquare,
  Package,
  CreditCard,
  Truck,
  Gift,
  BarChart3,
  Check,
  X,
  Clock,
  ArrowRight,
  Star,
  ChevronDown,
  ShieldCheck,
  Repeat,
  Smartphone,
  Globe,
  Zap,
  Menu,
  AlertCircle,
  Heart,
  Moon,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useState } from "react";
import cartzyLogo from "@/assets/cartzy-logo.png";
import FuturisticFX from "@/components/landing/FuturisticFX";

const WHATSAPP_URL = "http://api.whatsapp.com/send?l=pt&phone=5531992904210";

function CartzyLogo({ size = "md", invert = false }: { size?: "sm" | "md" | "lg"; invert?: boolean }) {
  const sizes = { sm: "h-7", md: "h-10", lg: "h-20 md:h-24" };
  return (
    <img
      src={cartzyLogo}
      alt="Cartzy"
      className={`${sizes[size]} w-auto object-contain ${invert ? "brightness-0 invert" : ""}`}
    />
  );
}

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ─── Dores (na voz da cliente) ───
  const pains = [
    { icon: MessageSquare, title: "“Me passa o preço?” pela 40ª vez hoje", description: "Preço, frete, tamanho, forma de pagamento... as mesmas perguntas o dia inteiro, e você respondendo uma por uma enquanto as vendas escapam." },
    { icon: Clock, title: "Respondeu tarde? A cliente já comprou de outra", description: "Ela mandou “eu quero”, você estava ocupada com outro pedido, e quando respondeu... silêncio. Venda perdida por pura falta de braço." },
    { icon: AlertCircle, title: "O pós-live é um mutirão até de madrugada", description: "A live foi ótima — agora são 3 horas caçando “eu quero” no meio dos comentários, montando lista, conferindo quem pagou. Você termina querendo chorar." },
    { icon: CreditCard, title: "Conferir comprovante um por um é castigo", description: "Print errado, PIX que não caiu, cliente que some depois de pedir a chave... você perde mais tempo checando pagamento do que vendendo." },
    { icon: Package, title: "Pedido errado = reputação em risco", description: "Cor errada, tamanho errado, endereço trocado. Um erro no grupo e a cliente reclama na frente de todo mundo. Seu nome é tudo que você tem." },
    { icon: Moon, title: "Você não desliga nunca", description: "Na cama, no almoço, no domingo — o WhatsApp apita e a paz morre. A sensação constante de “tô devendo resposta pra alguém” não te deixa descansar." },
  ];

  // ─── Gambiarras que ela já tentou ───
  const failedFixes = [
    { title: "Planilha no Excel", quote: "“Planilha é linda... até chegar pedido em 3 lugares ao mesmo tempo. No fim do dia tá tudo desatualizado e eu fico com raiva de mim.”" },
    { title: "Caderninho / bloco de notas", quote: "“A letra vira garrancho no meio do caos. Se eu perco o caderno, acabou.”" },
    { title: "Respostas prontas no WhatsApp", quote: "“Eu copio, colo... e mesmo assim tem 20 perguntas diferentes. Fico parecendo robô, mas sem automatizar nada.”" },
    { title: "Chamar sobrinha / marido pra ajudar", quote: "“Gasto dinheiro, a pessoa não responde do meu jeito, e no fim eu fico supervisionando. Trabalho duas vezes.”" },
    { title: "CRM “profissional” cheio de botão", quote: "“Eu abro e já dá preguiça. Até eu configurar, já passou a promoção, já passou a vontade, já passou tudo.”" },
    { title: "Ficar 100% online pra não perder venda", quote: "“Eu virei escrava do celular. Meu negócio cresce... e a minha vida some.”" },
  ];

  const features = [
    { icon: Package, title: "Pedido capturado sozinho", description: "A cliente comenta o código do produto no grupo ou na live — e o pedido entra no sistema montado: nome, produto, quantidade, valor. Sem você anotar nada." },
    { icon: MessageSquare, title: "WhatsApp que trabalha por você", description: "Confirmação de item, cobrança, pagamento aprovado e código de rastreio: tudo enviado automaticamente, com jeito de gente — não de robô." },
    { icon: CreditCard, title: "Cobrança sem ser “a chata do PIX”", description: "Link de pagamento gerado e enviado na hora. O sistema confirma o pagamento sozinho — zero conferência de comprovante." },
    { icon: Truck, title: "Etiqueta e rastreio automáticos", description: "Pedido pago vira etiqueta pronta pra imprimir. A cliente recebe o rastreio no WhatsApp sem perguntar “já postou?”." },
    { icon: BarChart3, title: "Fila de pedidos clara", description: "Novo, aguardando pagamento, pago, enviado, finalizado. Você sabe exatamente onde cada pedido está — sem depender de memória." },
    { icon: Repeat, title: "Campanhas nos grupos", description: "Divulgue produtos em todos os seus grupos com agendamento, fotos e intervalo inteligente que protege seu número de bloqueios." },
    { icon: Gift, title: "Cupons e sorteios", description: "Promoção sem virar caos: cupons de desconto e sorteios com regras claras, direto no sistema." },
    { icon: ShieldCheck, title: "Proteção do seu chip", description: "Envios com ritmo humano, mensagens variadas e controle de consentimento — seu número de WhatsApp protegido contra bloqueio." },
    { icon: Globe, title: "+11 integrações", description: "Bling, Mercado Pago, Pagar.me, InfinitePay, Correios, Melhor Envio, Mandaê, Olist, Bagy, Omie e mais." },
  ];

  const integrations = [
    "WhatsApp", "Bling", "Mercado Pago", "Pagar.me", "InfinitePay", "Correios",
    "Melhor Envio", "Mandaê", "Olist", "Bagy", "Omie", "Instagram",
  ];

  const steps = [
    { step: "01", title: "Cliente comenta o código na live ou no grupo", description: "“C123” no comentário — pronto. O Cartzy captura e monta o pedido sozinho, mesmo no meio do caos da live." },
    { step: "02", title: "Ela recebe a confirmação no WhatsApp", description: "Mensagem automática com o item, valor e link pra finalizar. Rápido, organizado, com a sua cara." },
    { step: "03", title: "Paga em segundos, sem você cobrar", description: "PIX ou cartão pelo link. O sistema confirma o pagamento sozinho — nada de conferir print." },
    { step: "04", title: "Etiqueta pronta pra imprimir", description: "Pedido pago vira etiqueta na transportadora que você usa. Em lote, com um clique." },
    { step: "05", title: "Rastreio enviado automaticamente", description: "A cliente acompanha a entrega pelo WhatsApp. Você nem fica sabendo que ela ia perguntar." },
  ];

  const comparison = [
    { without: "Caçar “eu quero” em 200 comentários", with: "Pedido montado sozinho na hora do comentário" },
    { without: "Cobrar no privado, uma por uma", with: "Link de pagamento automático em segundos" },
    { without: "Conferir comprovante print por print", with: "Pagamento confirmado pelo sistema, sozinho" },
    { without: "Madrugada organizando o pós-live", with: "Live termina, pedidos já estão organizados" },
    { without: "“Já postou meu pedido?” 10x por dia", with: "Rastreio enviado automaticamente no WhatsApp" },
    { without: "Presa no celular pra não perder venda", with: "Venda rodando enquanto você vive sua vida" },
  ];

  const transformations = [
    { icon: Heart, before: "“Eu era a atendente, o caixa, o SAC e o estoque — tudo ao mesmo tempo.”", after: "“Agora eu sou a dona do negócio. O sistema é meu funcionário invisível — sem salário e sem drama.”" },
    { icon: Moon, before: "“Eu respondia mensagem até na cama. Não desligava nunca.”", after: "“Hoje eu durmo em paz. Não fico pensando ‘será que esqueci alguém?’.”" },
    { icon: Users, before: "“Minha família só via a minha correria. Metade da minha cabeça vivia no WhatsApp.”", after: "“Agora eu tô presente de verdade. E o negócio vende até quando eu não tô online.”" },
  ];

  const testimonials = [
    { name: "Mariana Silva", role: "Loja de Roupas — SP", stars: 5, text: "Antes eu terminava a live feliz e começava o pós-live querendo chorar. Hoje a live acaba e os pedidos já estão prontos, cobrados e organizados. Meu faturamento dobrou em 2 meses." },
    { name: "Carla Mendes", role: "Cosméticos — RJ", stars: 5, text: "Eu perdia venda porque demorava a responder. Agora a cliente comenta o código e recebe tudo na hora — parece que ganhei uma funcionária que nunca dorme. Economizo 4 horas por dia." },
    { name: "João Pedro", role: "Semijoias — MG", stars: 5, text: "Eu tinha medo de ser complicado — não sou bom com tecnologia. A equipe configurou tudo comigo e em uma semana eu já não vivia mais sem. Simples de verdade." },
  ];

  const faqs = [
    { question: "A automação não vai deixar meu atendimento frio?", answer: "Não — e essa é a nossa obsessão. As mensagens saem personalizadas com o nome da cliente, com variações naturais e no seu tom de voz. Suas clientes vão sentir que a loja ficou mais rápida e organizada, não robótica. E você continua entrando na conversa quando quiser — o sistema cuida do repetitivo, o encantamento continua sendo seu." },
    { question: "Não sou boa com tecnologia. Vou conseguir usar?", answer: "Vai. O Cartzy foi feito pra quem vende no WhatsApp, não pra quem entende de sistema. E você não configura nada sozinha: a implantação é feita com a nossa equipe, passo a passo, até o primeiro pedido rodar. Depois disso, o dia a dia é comentar código no grupo — igual você já faz hoje." },
    { question: "Isso não é coisa de empresa grande?", answer: "Pelo contrário: foi feito pra quem vende em grupo de WhatsApp e live — a loja que é tocada por uma pessoa (ou duas). É exatamente quando você NÃO tem equipe que precisa de um sistema fazendo o trabalho repetitivo." },
    { question: "E se der problema no meio de uma promoção?", answer: "O suporte é via WhatsApp, com gente de verdade respondendo. E o sistema roda na nuvem 24/7, com backups automáticos — sua operação não depende do seu computador estar ligado." },
    { question: "Tem contrato de fidelidade?", answer: "No plano mensal, não — você cancela quando quiser, sem multa. Também existem opções de período maior com condições especiais: fale com a equipe no WhatsApp que apresentamos os planos." },
    { question: "Tem custo extra por mensagem de WhatsApp?", answer: "Não. O Cartzy integra com o seu WhatsApp sem custo por mensagem e sem depender de aprovação da Meta. E com proteção anti-bloqueio: envios em ritmo humano, mensagens variadas e controle de consentimento das clientes." },
    { question: "Como funciona a implantação?", answer: "A configuração completa é feita com a nossa equipe: conexão do WhatsApp, cadastro no sistema, integração de pagamento e envio, e treinamento pra você começar vendendo — não apenas “com acesso”. Os detalhes e valores são apresentados na conversa com a equipe." },
    { question: "Funciona com a transportadora que eu já uso?", answer: "Integramos com Correios, Melhor Envio, Mandaê e as principais do Brasil — etiqueta e rastreio automáticos. No pagamento: Mercado Pago, Pagar.me, InfinitePay e mais." },
  ];

  const benefits = [
    { value: "10x", label: "Mais clientes atendidas", description: "sem contratar ninguém" },
    { value: "0", label: "Pedidos perdidos", description: "com captura automática" },
    { value: "4h", label: "Recuperadas por dia", description: "do trabalho manual repetitivo" },
    { value: "24/7", label: "Vendendo", description: "mesmo quando você não está online" },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden font-sans">

      {/* ─── NAVBAR ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#07080F]/80 backdrop-blur-xl">
        <div className="container mx-auto px-5 h-16 flex items-center justify-between">
          <CartzyLogo size="sm" invert />

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {[["#dores", "Isso é você?"], ["#features", "Funcionalidades"], ["#how-it-works", "Como funciona"], ["#faq", "FAQ"]].map(([href, label]) => (
              <a key={href} href={href} className="text-sm text-slate-400 hover:text-white transition-colors">{label}</a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link to="/auth" className="hidden md:block">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-white/10">
                Entrar
              </Button>
            </Link>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/20">
                Quero conhecer
              </Button>
            </a>
            {/* Mobile hamburger */}
            <button
              className="md:hidden text-slate-400 hover:text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#07080F] px-5 py-4 flex flex-col gap-4">
            {[["#dores", "Isso é você?"], ["#features", "Funcionalidades"], ["#how-it-works", "Como funciona"], ["#faq", "FAQ"]].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="text-sm text-slate-300 hover:text-white">{label}</a>
            ))}
            <Link to="/auth" onClick={() => setMobileMenuOpen(false)} className="text-sm text-slate-300 hover:text-white">Entrar</Link>
          </div>
        )}
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex items-center justify-center bg-[#07080F] overflow-hidden pt-16">
        {/* Background glow mesh */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] bg-indigo-700/20 rounded-full blur-[130px]" />
          <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-600/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-violet-600/10 rounded-full blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "60px 60px"}} />
        </div>

        <div className="container mx-auto px-5 relative text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 mb-10">
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs text-indigo-300 font-medium tracking-wide">
              Para quem vende em grupos de WhatsApp e lives no Instagram
            </span>
          </div>

          {/* Logo */}
          <div className="flex justify-center mb-8">
            <CartzyLogo size="lg" invert />
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight text-white mb-6 max-w-4xl mx-auto">
            Seu negócio virou um{" "}
            <span className="bg-gradient-to-r from-cyan-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
              emprego dentro do WhatsApp?
            </span>
          </h1>

          <p className="text-base md:text-lg text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            O Cartzy captura os pedidos da live e dos grupos, cobra, confirma o pagamento e envia o rastreio — <strong className="text-slate-200">sozinho</strong>. Você volta a ser a dona do negócio, não a atendente dele.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 h-12 text-sm font-semibold shadow-2xl shadow-indigo-600/40 transition-all hover:scale-105 hover:shadow-indigo-500/50">
                Quero vender sem caos
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </a>
            <Link to="/auth">
              <Button size="lg" variant="ghost" className="text-slate-400 hover:text-white hover:bg-white/10 h-12 px-8 text-sm border border-white/10">
                Já tenho conta
              </Button>
            </Link>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500 mb-16">
            {["Implantação acompanhada passo a passo", "Suporte humano via WhatsApp", "Sem custo extra por mensagem"].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-indigo-400" />
                {t}
              </span>
            ))}
          </div>

          {/* Dashboard preview */}
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute -inset-px bg-gradient-to-r from-indigo-500/30 via-cyan-400/20 to-violet-500/30 rounded-2xl blur-lg" />
            <div className="relative rounded-2xl border border-white/10 overflow-hidden shadow-2xl shadow-black/60 bg-slate-900">
              <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border-b border-white/10">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
                <div className="ml-2 h-5 flex-1 max-w-xs rounded-md bg-white/5 border border-white/10" />
              </div>
              <img src="/dashboard.png" alt="Painel do Cartzy — pedidos organizados em tempo real" className="w-full h-auto opacity-90" loading="lazy" />
            </div>
            <p className="mt-4 text-xs text-slate-600">☝️ Painel real do Cartzy: cada pedido da live entra aqui sozinho, com status e pagamento</p>
          </div>
        </div>
      </section>

      {/* ─── INTEGRATIONS BAR ─── */}
      <section className="py-10 bg-slate-950 border-y border-white/5">
        <div className="container mx-auto px-5">
          <p className="text-center text-xs text-slate-600 uppercase tracking-widest mb-6 font-medium">
            Integrado com as plataformas que você já usa
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {integrations.map((name) => (
              <span key={name} className="text-slate-500 font-medium text-sm hover:text-slate-300 transition-colors cursor-default">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DORES ─── */}
      <section id="dores" className="py-28 bg-white border-b border-slate-100">
        <div className="container mx-auto px-5">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full mb-4">Isso parece com o seu dia?</span>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 text-slate-900 tracking-tight leading-tight">
              Você acorda com 80 mensagens<br />e não sabe por onde começar
            </h2>
            <p className="text-slate-500 max-w-lg mx-auto text-base">
              Você é boa de venda. Tem produto, tem cliente, tem lábia. O problema nunca foi você — é fazer <strong className="text-slate-700">tudo</strong> na mão.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {pains.map((p, i) => (
              <div key={i} className="group rounded-2xl border border-slate-200 p-7 hover:border-red-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 bg-white">
                <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center mb-5">
                  <p.icon className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="font-semibold text-base mb-2 text-slate-900">{p.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{p.description}</p>
              </div>
            ))}
          </div>

          <p className="text-center mt-12 text-slate-600 max-w-xl mx-auto text-base leading-relaxed">
            Enquanto tudo depender de você estar online, o negócio não cresce — <strong>só você se esgota.</strong>
          </p>
        </div>
      </section>

      {/* ─── GAMBIARRAS ─── */}
      <section className="py-28 bg-slate-950 border-b border-white/5">
        <div className="container mx-auto px-5">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full mb-4">Você já tentou de tudo</span>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 text-white tracking-tight leading-tight">
              Planilha, caderninho, sobrinha...<br />nada resolveu, né?
            </h2>
            <p className="text-slate-400 max-w-lg mx-auto">
              Você não é desorganizada. Essas soluções falham por um único motivo: <strong className="text-white">nenhuma delas tira você do centro da operação.</strong> Elas só mudam a forma do caos.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {failedFixes.map((f, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-6 hover:border-red-500/20 transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <X className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <h3 className="font-semibold text-sm text-white">{f.title}</h3>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed italic">{f.quote}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHAT IS CARTZY ─── */}
      <section className="py-28 bg-white border-b border-slate-100">
        <div className="container mx-auto px-5">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16 items-center">
            <div>
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full mb-6">A solução</span>
              <h2 className="text-3xl md:text-4xl font-bold mb-6 leading-tight text-slate-900">
                Um funcionário invisível que nunca dorme, não erra pedido e não pede salário
              </h2>
              <p className="text-slate-500 mb-8 leading-relaxed">
                O Cartzy assume o trabalho repetitivo da venda — captura, cobrança, confirmação, etiqueta, rastreio — e deixa pra você só o que você faz de melhor: <strong className="text-slate-700">vender e encantar.</strong>
              </p>
              <div className="space-y-4">
                {[
                  "A cliente comenta o código → pedido montado sozinho",
                  "Cobrança e confirmação de pagamento automáticas",
                  "Etiqueta e rastreio sem trabalho manual",
                  "Tudo organizado numa fila clara de pedidos",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center mt-0.5 flex-shrink-0">
                      <Check className="w-3 h-3 text-indigo-600" />
                    </div>
                    <span className="text-sm text-slate-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tags grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Smartphone, label: "WhatsApp Nativo" },
                { icon: CreditCard, label: "Pagamento Integrado" },
                { icon: Truck, label: "Logística Completa" },
                { icon: Globe, label: "+11 Integrações" },
                { icon: ShieldCheck, label: "Chip Protegido" },
                { icon: BarChart3, label: "Relatórios Simples" },
              ].map((tag, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 transition-all group">
                  <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 group-hover:border-indigo-300 transition-colors">
                    <tag.icon className="w-4 h-4 text-indigo-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">{tag.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="py-28 bg-slate-950 border-b border-white/5">
        <div className="container mx-auto px-5">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full mb-4">Como funciona</span>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white tracking-tight">Da live à entrega, em 5 passos automáticos</h2>
            <p className="text-slate-400">Configure uma vez com a nossa equipe. Depois, o sistema trabalha e você vive.</p>
          </div>

          <div className="max-w-lg mx-auto">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-6 group">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-indigo-600/30 group-hover:bg-indigo-500 transition-colors">
                    {step.step}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-px flex-1 bg-gradient-to-b from-indigo-500/50 to-transparent my-2" style={{ minHeight: "2rem" }} />
                  )}
                </div>
                <div className="pb-10">
                  <h3 className="font-semibold text-base mb-1.5 text-white">{step.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="py-28 bg-white border-b border-slate-100">
        <div className="container mx-auto px-5">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full mb-4">Funcionalidades</span>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900 tracking-tight">Sua operação inteira em um só lugar</h2>
            <p className="text-slate-500 max-w-md mx-auto">Chega de malabarismo com 5 ferramentas. Do “eu quero” ao “chegou, amei!” — tudo no Cartzy.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {features.map((feature, i) => (
              <div
                key={i}
                className="group relative rounded-2xl border border-slate-200 p-7 hover:border-indigo-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/0 to-indigo-50/0 group-hover:from-indigo-50/60 group-hover:to-transparent transition-all duration-300" />
                <div className="relative">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mb-5 transition-colors">
                    <feature.icon className="w-5 h-5 text-slate-500 group-hover:text-indigo-600 transition-colors" />
                  </div>
                  <h3 className="font-semibold text-base mb-2 text-slate-900">{feature.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── COMPARISON ─── */}
      <section className="py-28 bg-[#07080F] border-b border-white/5">
        <div className="container mx-auto px-5">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full mb-4">Antes vs Depois</span>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white tracking-tight">O seu dia, antes e depois<br />do Cartzy</h2>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
                <span className="text-red-400 font-semibold text-sm">❌ Hoje (tudo na mão)</span>
              </div>
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-center">
                <span className="text-indigo-300 font-semibold text-sm">✅ Com Cartzy</span>
              </div>
            </div>
            {comparison.map((item, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 mb-2">
                <div className="rounded-xl border border-white/5 bg-white/5 p-4 flex items-center gap-3">
                  <X className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="text-sm text-slate-400">{item.without}</span>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/5 p-4 flex items-center gap-3 hover:border-indigo-500/20 hover:bg-indigo-500/5 transition-colors">
                  <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  <span className="text-sm text-slate-200">{item.with}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TRANSFORMAÇÃO ─── */}
      <section className="py-28 bg-white border-b border-slate-100">
        <div className="container mx-auto px-5">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full mb-4">Mais que organização</span>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 text-slate-900 tracking-tight leading-tight">
              Não é só sobre vender mais.<br />É sobre ter a sua vida de volta.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {transformations.map((t, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl transition-all duration-300">
                <div className="p-6 bg-slate-50 border-b border-slate-200">
                  <p className="text-sm text-slate-500 leading-relaxed italic">{t.before}</p>
                </div>
                <div className="p-6 bg-white relative">
                  <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center absolute -top-[18px] left-6 shadow-lg shadow-indigo-600/30">
                    <t.icon className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-sm text-slate-800 leading-relaxed font-medium mt-3">{t.after}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── NUMBERS ─── */}
      <section className="py-24 bg-slate-950 border-b border-white/5">
        <div className="container mx-auto px-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {benefits.map((b, i) => (
              <div key={i} className="text-center group">
                <p className="text-4xl md:text-6xl font-bold bg-gradient-to-br from-cyan-400 to-indigo-400 bg-clip-text text-transparent mb-2 tabular-nums">{b.value}</p>
                <p className="font-semibold text-white text-sm mb-1">{b.label}</p>
                <p className="text-xs text-slate-500">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <section className="py-28 bg-white border-b border-slate-100">
        <div className="container mx-auto px-5">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full mb-4">Depoimentos</span>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900 tracking-tight">Quem usa, não volta pro caderninho</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {testimonials.map((t, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 p-7 flex flex-col hover:border-indigo-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white">
                <div className="flex gap-1 mb-5">
                  {Array.from({ length: t.stars }).map((_, s) => (
                    <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed flex-1 mb-6">"{t.text}"</p>
                <div className="flex items-center gap-3 pt-5 border-t border-slate-100">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="py-28 bg-white border-b border-slate-100">
        <div className="container mx-auto px-5">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full mb-4">FAQ</span>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900 tracking-tight">O que você deve estar pensando...</h2>
          </div>

          <div className="max-w-2xl mx-auto space-y-2">
            {faqs.map((faq, i) => (
              <div key={i} className="rounded-xl border border-slate-200 overflow-hidden hover:border-indigo-200 transition-colors">
                <button
                  className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-slate-50/80 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-medium text-sm pr-4 text-slate-900">{faq.question}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-180 text-indigo-500" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5">
                    <p className="text-sm text-slate-500 leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="py-28 bg-[#07080F]">
        <div className="container mx-auto px-5">
          <div className="relative max-w-4xl mx-auto">
            {/* Glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/20 via-violet-600/20 to-cyan-600/20 rounded-3xl blur-3xl" />

            <div className="relative rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-12 md:p-20 text-center overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-40 bg-indigo-500/20 blur-3xl rounded-full" />

              <div className="relative">
                <div className="flex justify-center mb-8">
                  <CartzyLogo size="md" invert />
                </div>

                <h2 className="text-3xl md:text-5xl font-bold mb-5 leading-tight text-white tracking-tight">
                  Pare de ser a atendente<br />do seu próprio negócio
                </h2>
                <p className="text-slate-400 mb-10 max-w-md mx-auto">
                  Chame a nossa equipe no WhatsApp. A gente te mostra o Cartzy funcionando com a sua operação — e você decide se faz sentido.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                    <Button size="lg" className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 h-12 text-sm font-semibold shadow-2xl shadow-indigo-600/40 hover:scale-105 transition-all">
                      Quero ver funcionando
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </a>
                  <Link to="/auth">
                    <Button size="lg" variant="ghost" className="text-slate-400 hover:text-white hover:bg-white/10 h-12 px-8 text-sm">
                      Já tenho conta →
                    </Button>
                  </Link>
                </div>

                <p className="mt-8 text-xs text-slate-600">Plano mensal sem fidelidade · Implantação acompanhada · Suporte humano via WhatsApp</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="py-10 border-t border-white/5 bg-slate-950">
        <div className="container mx-auto px-5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <CartzyLogo size="sm" invert />
            <div className="flex items-center gap-6">
              <Link to="/politica-de-privacidade" className="text-xs text-slate-600 hover:text-slate-300 transition-colors">
                Política de Privacidade
              </Link>
              <Link to="/termos-de-uso" className="text-xs text-slate-600 hover:text-slate-300 transition-colors">
                Termos de Uso
              </Link>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-600 hover:text-slate-300 transition-colors">
                Contato
              </a>
            </div>
            <p className="text-xs text-slate-600">© 2026 Cartzy. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
