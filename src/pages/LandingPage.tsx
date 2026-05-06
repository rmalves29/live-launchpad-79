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
  TrendingUp,
  ArrowRight,
  Play,
  Star,
  ChevronDown,
  ShieldCheck,
  Repeat,
  Smartphone,
  Globe,
  Tag,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useState } from "react";

const WHATSAPP_URL = "http://api.whatsapp.com/send?l=pt&phone=5531992904210";

function CartzyLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-7", md: "h-9", lg: "h-36" };
  return (
    <img
      src="/logo.png"
      alt="Cartzy"
      className={`${sizes[size]} w-auto object-contain`}
      onError={(e) => {
        const t = e.currentTarget;
        t.style.display = "none";
        const next = t.nextElementSibling as HTMLElement | null;
        if (next) next.style.display = "block";
      }}
    />
  );
}

function CartzyWordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-extrabold tracking-tight bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent ${className}`}
    >
      Cartzy
    </span>
  );
}

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const features = [
    {
      icon: Package,
      title: "Gestão de Pedidos",
      description:
        "Capture, organize e acompanhe todos os pedidos em tempo real durante suas Lives e Grupos de WhatsApp. Zero pedido perdido.",
    },
    {
      icon: MessageSquare,
      title: "WhatsApp Integrado",
      description:
        "Envio automático de confirmações, cobranças e código de rastreio. Seu cliente sempre informado.",
    },
    {
      icon: CreditCard,
      title: "Link de Pagamento",
      description:
        "Links gerados e enviados automaticamente. O cliente paga em segundos, você recebe na hora.",
    },
    {
      icon: Truck,
      title: "Logística Completa",
      description:
        "Etiquetas geradas e rastreio automático integrado às principais transportadoras do Brasil.",
    },
    {
      icon: Gift,
      title: "Cupons e Sorteios",
      description:
        "Sistema completo de promoções, cupons de desconto e sorteios para engajar seu público.",
    },
    {
      icon: BarChart3,
      title: "Relatórios em Tempo Real",
      description:
        "Métricas de vendas, faturamento e performance sempre atualizadas no seu painel.",
    },
    {
      icon: Repeat,
      title: "Automação de Campanhas",
      description:
        "Envie mensagens em massa para grupos de clientes com agendamento e personalização.",
    },
    {
      icon: Tag,
      title: "Catálogo de Produtos",
      description:
        "Gerencie estoque, preços, variações e imagens. Tudo sincronizado com suas vendas.",
    },
    {
      icon: Layers,
      title: "Multi-loja",
      description:
        "Gerencie várias lojas em uma única conta. Ideal para quem tem mais de um CNPJ ou marca.",
    },
  ];

  const comparison = [
    { without: "Anotar pedidos no papel ou excel", with: "Captura automática de pedidos" },
    { without: "Cobrar cliente um por um", with: "Link de pagamento automático via WhatsApp" },
    { without: "Enviar rastreio manualmente", with: "Notificação automática ao cliente" },
    { without: "Perder vendas pela demora", with: "Resposta instantânea para cada pedido" },
    { without: "Horas organizando planilhas", with: "Dashboard completo em tempo real" },
    { without: "Sem controle de estoque", with: "Estoque atualizado automaticamente" },
  ];

  const steps = [
    { step: 1, title: "Configure sua loja", description: "Cadastre seus produtos, preços e personalize em minutos. Sem conhecimento técnico." },
    { step: 2, title: "Conecte o WhatsApp", description: "Integre seu número em segundos. Sem precisar de API oficial ou custo extra por mensagem." },
    { step: 3, title: "Comece a vender", description: "Sistema captura pedidos automaticamente durante a Live e nos Grupos de WhatsApp." },
    { step: 4, title: "Cobrança automática", description: "Links de pagamento enviados instantaneamente. Cliente paga, sistema confirma." },
    { step: 5, title: "Envio com rastreio", description: "Etiquetas geradas automaticamente. Código de rastreio enviado ao cliente sem você fazer nada." },
  ];

  const testimonials = [
    {
      name: "Camila Rocha",
      role: "Loja de moda feminina",
      text: "Antes eu perdia pelo menos 30% dos pedidos nas Lives e no Grupo Vip. Com o Cartzy, zero pedido perdido. Meu faturamento dobrou em 2 meses.",
      stars: 5,
    },
    {
      name: "Ricardo Alves",
      role: "E-commerce de eletrônicos",
      text: "O que me convenceu foi a integração com Melhor Envio e o WhatsApp automático. Economizo 3 horas por dia que eu gastava no operacional.",
      stars: 5,
    },
    {
      name: "Fernanda Lima",
      role: "Artesanato e presentes",
      text: "Sistema incrível! Consigo fazer Lives e gerenciar o Grupo Vip ao mesmo tempo, acompanhando todos os pedidos em tempo real. Nunca mais errei um pedido.",
      stars: 5,
    },
  ];

  const integrations = [
    "Bling ERP", "Tiny ERP", "Omie ERP",
    "Mercado Pago", "Pagar.me", "InfinitePay",
    "Melhor Envio", "Mandae", "SuperFrete",
    "Correios", "Meus Correios",
  ];

  const plans = [
    {
      name: "Basic",
      price: "R$ 499,00",
      period: "30 dias de acesso",
      description: "Para quem está começando nas Lives e Grupos de WhatsApp",
      features: [
        "Acesso completo ao sistema",
        "Suporte por WhatsApp horário comercial",
        "1 mês de acesso",
      ],
      cta: "Selecionar Plano",
      highlight: false,
    },
    {
      name: "Pro",
      price: "6x de R$ 449,10",
      period: "185 dias de acesso",
      description: "Para vendedores em crescimento",
      features: [
        "Acesso completo ao sistema",
        "Suporte prioritário",
        "6 meses de acesso",
        "Relatórios avançados",
        "10% de desconto incluso",
      ],
      cta: "Selecionar Plano",
      highlight: true,
    },
    {
      name: "Enterprise",
      price: "12x de R$ 424,15",
      period: "365 dias de acesso",
      description: "Para grandes operações",
      features: [
        "Acesso completo ao sistema",
        "Suporte VIP 24/7",
        "12 meses de acesso",
        "Relatórios avançados",
        "15% de desconto incluso",
      ],
      cta: "Selecionar Plano",
      highlight: false,
    },
  ];

  const faqs = [
    {
      question: "Preciso ter API oficial do WhatsApp?",
      answer: "Não. O Cartzy integra com seu WhatsApp sem custo adicional por mensagem e sem precisar de aprovação do Meta.",
    },
    {
      question: "Como funciona a captura de pedidos na Live e nos Grupos?",
      answer: "Durante sua Live no Instagram, o sistema monitora os comentários e captura automaticamente os pedidos. Nos Grupos de WhatsApp, os pedidos são lançados de forma simples e organizada direto no painel.",
    },
    {
      question: "Funciona para vendas em Grupos de WhatsApp?",
      answer: "Sim! Além das Lives, o sistema é integrado a Grupos de WhatsApp. Você consegue lançar pedidos manualmente ou capturar de forma semi-automática.",
    },
    {
      question: "Como faço para contratar?",
      answer: "Entre em contato pelo WhatsApp e nossa equipe vai apresentar os planos disponíveis e fazer o onboarding completo da sua loja.",
    },
    {
      question: "Tem contrato de fidelidade?",
      answer: "Não. Nossos planos são mensais e você pode cancelar quando quiser, sem multa.",
    },
    {
      question: "Quais transportadoras são suportadas?",
      answer: "Integramos com Correios, Melhor Envio, Mandae e as principais transportadoras do Brasil. Etiquetas e rastreio automáticos.",
    },
  ];

  const benefits = [
    { value: "10x", label: "Mais rápido", description: "no processo de venda" },
    { value: "0", label: "Pedidos perdidos", description: "com captura automática" },
    { value: "24/7", label: "Funcionando", description: "sem interrupções" },
    { value: "100%", label: "Integrado", description: "WhatsApp, pagamento e envio" },
  ];

  return (
    <div className="min-h-screen bg-[#020c1b] text-white overflow-x-hidden">

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#020c1b]/85 backdrop-blur-xl border-b border-white/5">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CartzyLogo size="sm" />
            <span style={{ display: "none" }}>
              <CartzyWordmark className="text-xl" />
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors">Funcionalidades</a>
            <a href="#how-it-works" className="text-sm text-gray-400 hover:text-white transition-colors">Como funciona</a>
            <a href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">Planos</a>
            <a href="#faq" className="text-sm text-gray-400 hover:text-white transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white hidden md:flex">
                Entrar
              </Button>
            </Link>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/25">
                Fale conosco
              </Button>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-500/5 via-transparent to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-sky-500/8 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-600/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-72 h-72 bg-cyan-500/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto text-center">

            {/* Logo hero */}
            <div className="flex justify-center mb-8">
              <CartzyLogo size="lg" />
              <span style={{ display: "none" }}>
                <CartzyWordmark className="text-5xl" />
              </span>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-500/10 border border-sky-500/20 mb-8">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-sm text-cyan-300 font-medium">Sistema completo para vendas em lives do Instagram e Grupos de WhatsApp</span>
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.1] mb-6 tracking-tight">
              Venda em lives e Grupos{" "}
              <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-400 bg-clip-text text-transparent">
                sem perder um pedido
              </span>
            </h1>

            <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
              O Cartzy captura pedidos automaticamente em seu Grupo de WhatsApp, envia cobranças e rastreio via WhatsApp — tudo sem você precisar fazer nada manualmente.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="bg-sky-500 hover:bg-sky-400 text-white px-8 h-13 text-base font-semibold shadow-lg shadow-sky-500/30 transition-all hover:shadow-sky-400/40 hover:scale-105">
                  Quero conhecer o Cartzy
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sky-400" />
                WhatsApp sem custo extra por mensagem
              </span>
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sky-400" />
                Sem fidelidade
              </span>
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-sky-400" />
                Suporte via WhatsApp
              </span>
            </div>
          </div>

          {/* Dashboard screenshot */}
          <div className="mt-20 relative max-w-4xl mx-auto">
            <div className="absolute -inset-1 bg-gradient-to-r from-sky-500/20 via-cyan-500/5 to-blue-500/20 rounded-3xl blur-xl" />
            <div className="relative rounded-3xl border border-sky-500/15 shadow-2xl overflow-hidden">
              <img
                src="/dashboard.png"
                alt="Painel de Pedidos Cartzy"
                className="w-full h-auto rounded-3xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Integrations bar */}
      <section className="py-10 border-y border-white/5 bg-white/[0.015]">
        <div className="container mx-auto px-4">
          <p className="text-center text-xs text-gray-600 uppercase tracking-widest mb-6">Integrado com as principais plataformas do mercado</p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {integrations.map((name) => (
              <span key={name} className="text-gray-500 font-medium text-sm hover:text-sky-400 transition-colors">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="py-24 border-b border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-400 text-sm font-semibold uppercase tracking-widest mb-3">O problema</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Vender em live e Grupos Vip é caótico<br />sem a ferramenta certa</h2>
            <p className="text-gray-400 max-w-xl mx-auto">Milhares de vendedores perdem dinheiro todo dia por falta de organização durante as lives e ações de Grupo Vip</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {[
              { icon: MessageSquare, title: "Pedidos perdidos no chat", description: "O chat corre rápido durante a Live e os Grupos ficam cheios de mensagens. Sem captura automática, pedidos somem." },
              { icon: Clock, title: "Horas de trabalho manual", description: "Copiar nome, produto, endereço, cobrar um a um... isso toma horas do seu dia após cada Live ou ação no Grupo Vip." },
              { icon: TrendingUp, title: "Clientes que desistem", description: "Quem espera resposta por muito tempo simplesmente vai embora e compra na concorrência." },
            ].map((p, i) => (
              <div key={i} className="group bg-red-500/5 border border-red-500/15 rounded-2xl p-6 hover:border-red-500/30 transition-all">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mb-5 group-hover:bg-red-500/15 transition-colors">
                  <p.icon className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{p.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What is Cartzy */}
      <section className="py-24 border-b border-white/5">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-sky-400 text-sm font-semibold uppercase tracking-widest mb-3">A solução</p>
                <h2 className="text-3xl md:text-4xl font-bold mb-5 leading-tight">
                  O sistema completo para quem vende em Live e Grupos de WhatsApp
                </h2>
                <p className="text-gray-400 mb-6 leading-relaxed">
                  O Cartzy automatiza todo o processo de venda — da captura do pedido ao rastreio de entrega. Integrado ao WhatsApp, seu cliente é notificado em cada etapa sem você precisar enviar uma mensagem sequer.
                </p>
                <div className="space-y-3">
                  {[
                    "Captura pedidos automaticamente durante a Live e nos Grupos de WhatsApp",
                    "Envia link de pagamento via WhatsApp",
                    "Gera etiqueta e envia rastreio ao cliente",
                    "Tudo registrado e organizado no seu painel",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-sky-500/20 flex items-center justify-center mt-0.5 flex-shrink-0">
                        <Check className="w-3 h-3 text-sky-400" />
                      </div>
                      <span className="text-sm text-gray-300">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {[
                  { icon: Smartphone, label: "WhatsApp Nativo", color: "cyan" },
                  { icon: CreditCard, label: "Pagamento Integrado", color: "blue" },
                  { icon: Truck, label: "Logística Completa", color: "sky" },
                  { icon: Globe, label: "11 Integrações", color: "indigo" },
                  { icon: ShieldCheck, label: "Dados Seguros", color: "violet" },
                  { icon: BarChart3, label: "Relatórios", color: "teal" },
                ].map((tag, i) => (
                  <div key={i} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium
                    ${tag.color === "cyan" ? "bg-cyan-500/10 border-cyan-500/25 text-cyan-400" :
                      tag.color === "blue" ? "bg-blue-500/10 border-blue-500/25 text-blue-400" :
                      tag.color === "sky" ? "bg-sky-500/10 border-sky-500/25 text-sky-400" :
                      tag.color === "indigo" ? "bg-indigo-500/10 border-indigo-500/25 text-indigo-400" :
                      tag.color === "violet" ? "bg-violet-500/10 border-violet-500/25 text-violet-400" :
                      "bg-teal-500/10 border-teal-500/25 text-teal-400"
                    }`}>
                    <tag.icon className="w-4 h-4" />
                    {tag.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 border-b border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-400 text-sm font-semibold uppercase tracking-widest mb-3">Funcionalidades</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Tudo que você precisa em um só lugar</h2>
            <p className="text-gray-400 max-w-xl mx-auto">Chega de usar 5 ferramentas diferentes. O Cartzy centraliza sua operação inteira.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {features.map((feature, i) => (
              <div key={i} className="group bg-white/[0.03] border border-white/8 rounded-2xl p-6 hover:bg-sky-500/5 hover:border-sky-500/25 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center mb-5 group-hover:bg-sky-500/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-sky-400" />
                </div>
                <h3 className="font-semibold text-base mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-24 border-b border-white/5 bg-white/[0.01]">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-400 text-sm font-semibold uppercase tracking-widest mb-3">Antes vs Depois</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">A diferença é visível desde o primeiro dia</h2>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                <span className="text-red-400 font-semibold text-sm">❌ Sem Cartzy</span>
              </div>
              <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-4 text-center">
                <span className="text-sky-400 font-semibold text-sm">✅ Com Cartzy</span>
              </div>
            </div>
            {comparison.map((item, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 mb-2">
                <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 flex items-center gap-3">
                  <X className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span className="text-sm text-gray-400">{item.without}</span>
                </div>
                <div className="bg-white/[0.03] border border-white/8 rounded-xl p-4 flex items-center gap-3">
                  <Check className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  <span className="text-sm text-gray-300">{item.with}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 border-b border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-400 text-sm font-semibold uppercase tracking-widest mb-3">Como funciona</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Do pedido à entrega em 5 passos</h2>
            <p className="text-gray-400">Configure uma vez e o sistema trabalha por você</p>
          </div>

          <div className="max-w-2xl mx-auto">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-5 mb-8 last:mb-0">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-sky-500/30">
                    {step.step}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-px flex-1 bg-gradient-to-b from-sky-500/50 to-transparent mt-2" />
                  )}
                </div>
                <div className="pb-8">
                  <h3 className="font-semibold text-lg mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Numbers */}
      <section className="py-20 border-b border-white/5 bg-gradient-to-r from-sky-500/5 via-transparent to-blue-500/5">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {benefits.map((b, i) => (
              <div key={i} className="text-center">
                <p className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-300 to-sky-400 bg-clip-text text-transparent mb-2">{b.value}</p>
                <p className="font-semibold text-white mb-1">{b.label}</p>
                <p className="text-xs text-gray-500">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 border-b border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-400 text-sm font-semibold uppercase tracking-widest mb-3">Depoimentos</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Quem usa, não volta atrás</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/8 rounded-2xl p-6 flex flex-col hover:border-sky-500/20 transition-all">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.stars }).map((_, s) => (
                    <Star key={s} className="w-4 h-4 fill-sky-400 text-sky-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-300 leading-relaxed flex-1 mb-5">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-sky-500/20 flex items-center justify-center text-sky-400 font-bold text-sm">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 border-b border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-400 text-sm font-semibold uppercase tracking-widest mb-3">Planos</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Planos para cada etapa do seu negócio</h2>
            <p className="text-gray-400">Entre em contato e nossa equipe vai encontrar o plano ideal para você.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {plans.map((plan, i) => (
              <div key={i} className={`relative rounded-2xl p-7 flex flex-col border transition-all ${
                plan.highlight
                  ? "bg-sky-500/10 border-sky-500/40 shadow-xl shadow-sky-500/10"
                  : "bg-white/[0.03] border-white/8"
              }`}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-sky-500 to-blue-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                      MAIS POPULAR
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="font-bold text-xl mb-1">{plan.name}</h3>
                  <p className="text-sm text-gray-500 mb-4">{plan.description}</p>
                  <p className="text-2xl font-bold text-gray-300">{plan.price}</p>
                </div>

                <div className="space-y-3 flex-1 mb-7">
                  {plan.features.map((f, fi) => (
                    <div key={fi} className="flex items-center gap-3">
                      <Check className={`w-4 h-4 flex-shrink-0 ${plan.highlight ? "text-sky-400" : "text-gray-400"}`} />
                      <span className="text-sm text-gray-300">{f}</span>
                    </div>
                  ))}
                </div>

                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  <Button className={`w-full font-semibold ${
                    plan.highlight
                      ? "bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/25"
                      : "bg-white/10 hover:bg-white/15 text-white border border-white/10"
                  }`}>
                    {plan.cta}
                  </Button>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 border-b border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-400 text-sm font-semibold uppercase tracking-widest mb-3">FAQ</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4">Dúvidas frequentes</h2>
          </div>

          <div className="max-w-2xl mx-auto space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-6 text-left hover:bg-sky-500/5 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-medium text-sm pr-4">{faq.question}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-6">
                    <p className="text-sm text-gray-400 leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="relative max-w-4xl mx-auto text-center">
            <div className="absolute inset-0 bg-sky-500/10 rounded-3xl blur-2xl" />
            <div className="relative bg-gradient-to-b from-white/[0.06] to-white/[0.02] rounded-3xl border border-sky-500/15 p-12 md:p-16">
              <div className="flex justify-center mb-6">
                <CartzyLogo size="md" />
                <span style={{ display: "none" }}>
                  <CartzyWordmark className="text-3xl" />
                </span>
              </div>
              <h2 className="text-3xl md:text-5xl font-bold mb-5 leading-tight">
                Pronto para nunca mais<br />perder um pedido?
              </h2>
              <p className="text-gray-400 mb-10 max-w-lg mx-auto">
                Fale com nossa equipe e descubra como o Cartzy pode transformar suas vendas em Live e nos Grupos de WhatsApp.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="bg-sky-500 hover:bg-sky-400 text-white px-10 h-14 text-base font-semibold shadow-xl shadow-sky-500/30 hover:scale-105 transition-all">
                    Falar com a equipe Cartzy
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </a>
                <Link to="/auth">
                  <Button size="lg" variant="ghost" className="text-gray-400 hover:text-white h-14 px-8">
                    Já tenho conta →
                  </Button>
                </Link>
              </div>
              <p className="mt-6 text-xs text-gray-600">Sem fidelidade • Cancele quando quiser • Suporte via WhatsApp</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <CartzyLogo size="sm" />
              <span style={{ display: "none" }}>
                <CartzyWordmark className="text-lg" />
              </span>
            </div>
            <div className="flex items-center gap-6">
              <Link to="/politica-de-privacidade" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
                Política de Privacidade
              </Link>
              <Link to="/termos-de-uso" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
                Termos de Uso
              </Link>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
                Contato
              </a>
            </div>
            <p className="text-sm text-gray-600">© 2026 Cartzy. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
