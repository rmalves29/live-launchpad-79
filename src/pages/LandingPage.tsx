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
  Star,
  ChevronDown,
  ShieldCheck,
  Repeat,
  Smartphone,
  Globe,
  Zap,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useState } from "react";
import cartzyLogo from "@/assets/cartzy-logo.png";

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

  const features = [
    { icon: Package, title: "Gestão de Pedidos", description: "Capture, organize e acompanhe todos os pedidos em tempo real durante suas Lives e Grupos de WhatsApp. Zero pedido perdido." },
    { icon: MessageSquare, title: "WhatsApp Integrado", description: "Envio automático de confirmações, cobranças e código de rastreio. Seu cliente sempre informado." },
    { icon: CreditCard, title: "Link de Pagamento", description: "Links gerados e enviados automaticamente. O cliente paga em segundos, você recebe na hora." },
    { icon: Truck, title: "Logística Completa", description: "Etiquetas geradas e rastreio automático integrado às principais transportadoras do Brasil." },
    { icon: Gift, title: "Cupons e Sorteios", description: "Sistema completo de promoções, cupons de desconto e sorteios para engajar seu público." },
    { icon: BarChart3, title: "Relatórios em Tempo Real", description: "Métricas de vendas, faturamento e performance sempre atualizadas no seu painel." },
    { icon: Repeat, title: "Automação de Campanhas", description: "Envie mensagens em massa para grupos de clientes com agendamento e personalização." },
    { icon: ShieldCheck, title: "Multi-tenant Seguro", description: "Dados isolados por loja com criptografia e backups automáticos." },
    { icon: Globe, title: "+11 Integrações", description: "Bling, Melhor Envio, Mercado Pago, Pagar.me, Correios, Mandaê, Olist, Bagy, Omie e mais." },
  ];

  const integrations = [
    "WhatsApp", "Bling", "Mercado Pago", "Pagar.me", "Correios",
    "Melhor Envio", "Mandaê", "Olist", "Bagy", "Omie", "Instagram",
  ];

  const steps = [
    { step: "01", title: "Cliente faz pedido na Live ou Grupo", description: "O Cartzy captura automaticamente o pedido, mesmo no meio do caos da Live." },
    { step: "02", title: "Sistema confirma com o cliente", description: "Mensagem automática via WhatsApp confirmando os itens do pedido." },
    { step: "03", title: "Link de pagamento enviado", description: "Cliente recebe o link e paga em segundos. Você recebe a confirmação na hora." },
    { step: "04", title: "Etiqueta gerada automaticamente", description: "Pedido pago vira etiqueta pronta para imprimir, integrado com sua transportadora." },
    { step: "05", title: "Rastreio enviado pelo WhatsApp", description: "Cliente acompanha a entrega em tempo real, sem precisar perguntar." },
  ];

  const comparison = [
    { without: "Anotar pedidos um por um no caderno", with: "Captura automática direto da Live e Grupo" },
    { without: "Cobrar no PIX manualmente", with: "Link de pagamento enviado em segundos" },
    { without: "Gerar etiqueta uma a uma", with: "Etiquetas em lote, prontas pra imprimir" },
    { without: "Cliente perdido sem saber do envio", with: "Rastreio automático via WhatsApp" },
    { without: "Planilha bagunçada, sem controle", with: "Painel completo com tudo organizado" },
  ];

  const testimonials = [
    { name: "Mariana Silva", role: "Loja de Roupas — SP", stars: 5, text: "Antes eu perdia pelo menos 30% dos pedidos nas Lives e no Grupo Vip. Com o Cartzy, zero pedido perdido. Meu faturamento dobrou em 2 meses." },
    { name: "João Pedro", role: "Bijuterias — MG", stars: 5, text: "O suporte é fantástico e o sistema é simples de usar. Hoje consigo fazer Lives muito mais tranquilas sabendo que tudo é capturado." },
    { name: "Carla Mendes", role: "Cosméticos — RJ", stars: 5, text: "Economizo 4 horas por dia que eu gastava cobrando cliente no WhatsApp. Agora é tudo automático e eu foco só em vender." },
  ];

  const plans = [
    { name: "Starter", description: "Para quem está começando", price: "Sob consulta", cta: "Falar com a equipe", features: ["Até 200 pedidos/mês", "WhatsApp integrado", "Link de pagamento", "Suporte via WhatsApp"], highlight: false },
    { name: "Pro", description: "O mais escolhido", price: "Sob consulta", cta: "Quero o Pro", features: ["Pedidos ilimitados", "Tudo do Starter", "Etiquetas e rastreio", "Cupons e sorteios", "Relatórios avançados"], highlight: true },
    { name: "Business", description: "Para grandes operações", price: "Sob consulta", cta: "Falar com vendas", features: ["Tudo do Pro", "Multi-loja", "Integrações personalizadas", "Onboarding dedicado", "Suporte prioritário"], highlight: false },
  ];

  const faqs = [
    { question: "Preciso de internet boa para usar?", answer: "Sim, mas funciona perfeitamente com 4G ou Wi-Fi comum. Não exige nada complexo." },
    { question: "O WhatsApp é o oficial ou Z-API?", answer: "Você escolhe. Suportamos WhatsApp comum (via Z-API) ou WhatsApp Business API oficial." },
    { question: "Como faço para contratar?", answer: "Entre em contato pelo WhatsApp e nossa equipe vai apresentar os planos disponíveis e fazer o onboarding completo da sua loja." },
    { question: "Tem contrato de fidelidade?", answer: "Não. Nossos planos são mensais e você pode cancelar quando quiser, sem multa." },
    { question: "Quais transportadoras são suportadas?", answer: "Integramos com Correios, Melhor Envio, Mandae e as principais transportadoras do Brasil. Etiquetas e rastreio automáticos." },
    { question: "Tem custo extra de WhatsApp?", answer: "Não. O Cartzy integra com seu WhatsApp sem custo adicional por mensagem e sem precisar de aprovação do Meta." },
  ];

  const benefits = [
    { value: "10x", label: "Mais rápido", description: "no processo de venda" },
    { value: "0", label: "Pedidos perdidos", description: "com captura automática" },
    { value: "24/7", label: "Funcionando", description: "sem interrupções" },
    { value: "100%", label: "Integrado", description: "WhatsApp, pagamento e envio" },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden font-sans">

      {/* ─── NAVBAR ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#07080F]/80 backdrop-blur-xl">
        <div className="container mx-auto px-5 h-16 flex items-center justify-between">
          <CartzyLogo size="sm" invert />

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {[["#features", "Funcionalidades"], ["#how-it-works", "Como funciona"], ["#pricing", "Planos"], ["#faq", "FAQ"]].map(([href, label]) => (
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
                Fale conosco
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
            {[["#features", "Funcionalidades"], ["#how-it-works", "Como funciona"], ["#pricing", "Planos"], ["#faq", "FAQ"]].map(([href, label]) => (
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
          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "60px 60px"}} />
        </div>

        <div className="container mx-auto px-5 relative text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 mb-10">
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs text-indigo-300 font-medium tracking-wide">
              Sistema completo para lives do Instagram e Grupos de WhatsApp
            </span>
          </div>

          {/* Logo */}
          <div className="flex justify-center mb-8">
            <CartzyLogo size="lg" invert />
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight text-white mb-6 max-w-4xl mx-auto">
            Chega de 5 dias para{" "}
            <span className="relative">
              <span className="bg-gradient-to-r from-cyan-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
                fechar uma venda.
              </span>
            </span>
          </h1>

          <p className="text-base md:text-lg text-slate-400 mb-10 max-w-xl mx-auto leading-relaxed">
            O Cartzy captura pedidos automaticamente, envia cobranças e rastreio via WhatsApp — do pedido ao pagamento em minutos.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg" className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 h-12 text-sm font-semibold shadow-2xl shadow-indigo-600/40 transition-all hover:scale-105 hover:shadow-indigo-500/50">
                Conhecer o Cartzy
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
            {["Sem fidelidade", "Suporte via WhatsApp", "WhatsApp sem custo extra"].map((t) => (
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
              <img src="/dashboard.png" alt="Painel Cartzy" className="w-full h-auto opacity-90" />
            </div>
          </div>
        </div>
      </section>

      {/* ─── INTEGRATIONS BAR ─── */}
      <section className="py-10 bg-slate-950 border-y border-white/5">
        <div className="container mx-auto px-5">
          <p className="text-center text-xs text-slate-600 uppercase tracking-widest mb-6 font-medium">
            Integrado com as principais plataformas do mercado
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {integrations.map((name) => (
              <span key={name} className="text-slate-500 font-medium text-sm hover:text-slate-300 transition-colors cursor-default">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PROBLEM ─── */}
      <section className="py-28 bg-white border-b border-slate-100">
        <div className="container mx-auto px-5">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full mb-4">O problema</span>
            <h2 className="text-3xl md:text-5xl font-bold mb-5 text-slate-900 tracking-tight leading-tight">
              Vender em live e Grupos Vip<br />é caótico sem a ferramenta certa
            </h2>
            <p className="text-slate-500 max-w-lg mx-auto text-base">
              Milhares de vendedores perdem dinheiro todo dia por falta de organização durante as lives e ações de Grupo Vip
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              { icon: MessageSquare, title: "Pedidos perdidos no chat", description: "O chat corre rápido durante a Live e os Grupos ficam cheios de mensagens. Sem captura automática, pedidos somem." },
              { icon: Clock, title: "Horas de trabalho manual", description: "Copiar nome, produto, endereço, cobrar um a um... isso toma horas do seu dia após cada Live ou ação no Grupo Vip." },
              { icon: TrendingUp, title: "Clientes que desistem", description: "Quem espera resposta por muito tempo simplesmente vai embora e compra na concorrência." },
            ].map((p, i) => (
              <div key={i} className="group rounded-2xl border border-slate-200 p-7 hover:border-red-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 bg-white">
                <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center mb-5">
                  <p.icon className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="font-semibold text-base mb-2 text-slate-900">{p.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHAT IS CARTZY ─── */}
      <section className="py-28 bg-slate-950 border-b border-white/5">
        <div className="container mx-auto px-5">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16 items-center">
            <div>
              <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full mb-6">A solução</span>
              <h2 className="text-3xl md:text-4xl font-bold mb-6 leading-tight text-white">
                O sistema completo para quem vende em Live e Grupos de WhatsApp
              </h2>
              <p className="text-slate-400 mb-8 leading-relaxed">
                O Cartzy automatiza todo o processo de venda — da captura do pedido ao rastreio de entrega. Integrado ao WhatsApp, seu cliente é notificado em cada etapa sem você enviar uma mensagem sequer.
              </p>
              <div className="space-y-4">
                {[
                  "Captura pedidos automaticamente durante a Live e nos Grupos de WhatsApp",
                  "Envia link de pagamento via WhatsApp",
                  "Gera etiqueta e envia rastreio ao cliente",
                  "Tudo registrado e organizado no seu painel",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mt-0.5 flex-shrink-0">
                      <Check className="w-3 h-3 text-indigo-400" />
                    </div>
                    <span className="text-sm text-slate-300">{item}</span>
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
                { icon: Globe, label: "11 Integrações" },
                { icon: ShieldCheck, label: "Dados Seguros" },
                { icon: BarChart3, label: "Relatórios" },
              ].map((tag, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-indigo-500/30 transition-all group">
                  <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-500/20 transition-colors">
                    <tag.icon className="w-4 h-4 text-indigo-400" />
                  </div>
                  <span className="text-sm font-medium text-slate-300">{tag.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─── */}
      <section id="features" className="py-28 bg-white border-b border-slate-100">
        <div className="container mx-auto px-5">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full mb-4">Funcionalidades</span>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900 tracking-tight">Tudo que você precisa em um só lugar</h2>
            <p className="text-slate-500 max-w-md mx-auto">Chega de usar 5 ferramentas diferentes. O Cartzy centraliza sua operação inteira.</p>
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
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white tracking-tight">A diferença é visível<br />desde o primeiro dia</h2>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
                <span className="text-red-400 font-semibold text-sm">❌ Sem Cartzy</span>
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

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="py-28 bg-white border-b border-slate-100">
        <div className="container mx-auto px-5">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full mb-4">Como funciona</span>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900 tracking-tight">Do pedido à entrega em 5 passos</h2>
            <p className="text-slate-500">Configure uma vez e o sistema trabalha por você</p>
          </div>

          <div className="max-w-lg mx-auto">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-6 group">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-indigo-600/30 group-hover:bg-indigo-500 transition-colors">
                    {step.step}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-px flex-1 bg-gradient-to-b from-indigo-300 to-transparent my-2" style={{ minHeight: "2rem" }} />
                  )}
                </div>
                <div className="pb-10">
                  <h3 className="font-semibold text-base mb-1.5 text-slate-900">{step.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{step.description}</p>
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
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900 tracking-tight">Quem usa, não volta atrás</h2>
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

      {/* ─── PRICING ─── */}
      <section id="pricing" className="py-28 bg-[#07080F] border-b border-white/5">
        <div className="container mx-auto px-5">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full mb-4">Planos</span>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white tracking-tight">Planos para cada etapa<br />do seu negócio</h2>
            <p className="text-slate-400">Entre em contato e nossa equipe vai encontrar o plano ideal para você.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto items-start">
            {plans.map((plan, i) => (
              <div
                key={i}
                className={`relative rounded-2xl p-7 flex flex-col border transition-all ${
                  plan.highlight
                    ? "bg-indigo-600 border-indigo-500 shadow-2xl shadow-indigo-600/30 md:-mt-4 md:mb-0"
                    : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/8"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-white text-indigo-600 text-xs font-bold px-4 py-1.5 rounded-full shadow-lg tracking-wide">
                      MAIS POPULAR
                    </span>
                  </div>
                )}

                <div className="mb-7">
                  <h3 className={`font-bold text-xl mb-1 ${plan.highlight ? "text-white" : "text-white"}`}>{plan.name}</h3>
                  <p className={`text-sm mb-5 ${plan.highlight ? "text-indigo-200" : "text-slate-500"}`}>{plan.description}</p>
                  <p className={`text-2xl font-bold ${plan.highlight ? "text-white" : "text-white"}`}>{plan.price}</p>
                </div>

                <div className="space-y-3.5 flex-1 mb-8">
                  {plan.features.map((f, fi) => (
                    <div key={fi} className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${plan.highlight ? "bg-white/20" : "bg-indigo-500/20"}`}>
                        <Check className={`w-2.5 h-2.5 ${plan.highlight ? "text-white" : "text-indigo-400"}`} />
                      </div>
                      <span className={`text-sm ${plan.highlight ? "text-white" : "text-slate-300"}`}>{f}</span>
                    </div>
                  ))}
                </div>

                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  <Button className={`w-full font-semibold h-11 ${
                    plan.highlight
                      ? "bg-white hover:bg-slate-100 text-indigo-600"
                      : "bg-white/10 hover:bg-white/20 text-white border border-white/10"
                  }`}>
                    {plan.cta}
                  </Button>
                </a>
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
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900 tracking-tight">Dúvidas frequentes</h2>
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
              {/* Inner glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-40 bg-indigo-500/20 blur-3xl rounded-full" />

              <div className="relative">
                <div className="flex justify-center mb-8">
                  <CartzyLogo size="md" invert />
                </div>

                <h2 className="text-3xl md:text-5xl font-bold mb-5 leading-tight text-white tracking-tight">
                  Pronto para nunca mais<br />perder um pedido?
                </h2>
                <p className="text-slate-400 mb-10 max-w-md mx-auto">
                  Fale com nossa equipe e descubra como o Cartzy pode transformar suas vendas em Live e nos Grupos de WhatsApp.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                    <Button size="lg" className="bg-indigo-600 hover:bg-indigo-500 text-white px-10 h-12 text-sm font-semibold shadow-2xl shadow-indigo-600/40 hover:scale-105 transition-all">
                      Falar com a equipe Cartzy
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  </a>
                  <Link to="/auth">
                    <Button size="lg" variant="ghost" className="text-slate-400 hover:text-white hover:bg-white/10 h-12 px-8 text-sm">
                      Já tenho conta →
                    </Button>
                  </Link>
                </div>

                <p className="mt-8 text-xs text-slate-600">Sem fidelidade · Cancele quando quiser · Suporte via WhatsApp</p>
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
