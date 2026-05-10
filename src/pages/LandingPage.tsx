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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useState } from "react";
import cartzyLogo from "@/assets/cartzy-logo.png";

const WHATSAPP_URL = "http://api.whatsapp.com/send?l=pt&phone=5531992904210";

function CartzyLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8", md: "h-12", lg: "h-24 md:h-28" };
  return (
    <img
      src={cartzyLogo}
      alt="Cartzy"
      className={`${sizes[size]} w-auto object-contain`}
    />
  );
}

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const features = [
    { icon: Package, title: "Gestão de Pedidos", description: "Capture, organize e acompanhe todos os pedidos em tempo real durante suas Lives e Grupos de WhatsApp. Zero pedido perdido." },
    { icon: MessageSquare, title: "WhatsApp Integrado", description: "Envio automático de confirmações, cobranças e código de rastreio. Seu cliente sempre informado." },
    { icon: CreditCard, title: "Link de Pagamento", description: "Links gerados e enviados automaticamente. O cliente paga em segundos, você recebe na hora." },
    { icon: Truck, title: "Logística Completa", description: "Etiquetas geradas e rastreio automático integrado às principais transportadoras do Brasil." },
    { icon: Gift, title: "Cupons e Sorteios", description: "Sistema completo de promoções, cupons de desconto e sorteios para engajar seu público." },
    { icon: BarChart3, title: "Relatórios em Tempo Real", description: "Métricas de vendas, faturamento e performance sempre atualizadas no seu painel." },
    { icon: Repeat, title: "Automação de Campanhas", description: "Envie mensagens em massa para grupos de clientes com agendamento e personalização." },
    { icon: ShieldCheck, title: "Multi-tenant Seguro", description: "Dados isolados por loja com criptografia e backups automáticos." },
    { icon: Globe, title: "Mais de 11 Integrações", description: "Bling, Melhor Envio, Mercado Pago, Pagar.me, Correios, Mandaê, Olist, Bagy, Omie e mais." },
  ];

  const integrations = [
    "WhatsApp", "Bling", "Mercado Pago", "Pagar.me", "Correios",
    "Melhor Envio", "Mandaê", "Olist", "Bagy", "Omie", "Instagram",
  ];

  const steps = [
    { step: "1", title: "Cliente faz pedido na Live ou Grupo", description: "O Cartzy captura automaticamente o pedido, mesmo no meio do caos da Live." },
    { step: "2", title: "Sistema confirma com o cliente", description: "Mensagem automática via WhatsApp confirmando os itens do pedido." },
    { step: "3", title: "Link de pagamento enviado", description: "Cliente recebe o link e paga em segundos. Você recebe a confirmação na hora." },
    { step: "4", title: "Etiqueta gerada automaticamente", description: "Pedido pago vira etiqueta pronta para imprimir, integrado com sua transportadora." },
    { step: "5", title: "Rastreio enviado pelo WhatsApp", description: "Cliente acompanha a entrega em tempo real, sem precisar perguntar." },
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
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/70">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <CartzyLogo size="sm" />
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-slate-600 hover:text-sky-600 transition-colors">Funcionalidades</a>
            <a href="#how-it-works" className="text-sm text-slate-600 hover:text-sky-600 transition-colors">Como funciona</a>
            <a href="#pricing" className="text-sm text-slate-600 hover:text-sky-600 transition-colors">Planos</a>
            <a href="#faq" className="text-sm text-slate-600 hover:text-sky-600 transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost" size="sm" className="text-slate-600 hover:text-slate-900 hidden md:flex">
                Entrar
              </Button>
            </Link>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20">
                Fale conosco
              </Button>
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-50/80 via-white to-white" />
        <div className="absolute top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-sky-200/30 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-cyan-200/30 rounded-full blur-[80px] pointer-events-none" />

        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex justify-center mb-8">
              <CartzyLogo size="lg" />
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-50 border border-sky-200 mb-8">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
              <span className="text-sm text-sky-700 font-medium">Sistema completo para vendas em lives do Instagram e Grupos de WhatsApp</span>
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.1] mb-6 tracking-tight text-slate-900">
              Chega de 5 dias para fechar uma venda.{" "}
              <span className="bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 bg-clip-text text-transparent">
                Do pedido ao pagamento em minutos.
              </span>
            </h1>

            <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              O Cartzy captura pedidos automaticamente em seu Grupo de WhatsApp, envia cobranças e rastreio via WhatsApp — tudo sem você precisar fazer nada manualmente.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="bg-sky-500 hover:bg-sky-600 text-white px-8 h-13 text-base font-semibold shadow-xl shadow-sky-500/30 transition-all hover:scale-105">
                  Quero conhecer o Cartzy
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-sky-500" />WhatsApp sem custo extra por mensagem</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-sky-500" />Sem fidelidade</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-sky-500" />Suporte via WhatsApp</span>
            </div>
          </div>

          <div className="mt-20 relative max-w-4xl mx-auto">
            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400/30 via-sky-400/20 to-blue-500/30 rounded-3xl blur-xl" />
            <div className="relative rounded-3xl border border-slate-200 shadow-2xl overflow-hidden bg-white">
              <img src="/dashboard.png" alt="Painel de Pedidos Cartzy" className="w-full h-auto" />
            </div>
          </div>
        </div>
      </section>

      {/* Integrations bar */}
      <section className="py-10 border-y border-slate-200 bg-slate-50/60">
        <div className="container mx-auto px-4">
          <p className="text-center text-xs text-slate-500 uppercase tracking-widest mb-6">Integrado com as principais plataformas do mercado</p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {integrations.map((name) => (
              <span key={name} className="text-slate-500 font-medium text-sm hover:text-sky-600 transition-colors">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="py-24 border-b border-slate-100">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-600 text-sm font-semibold uppercase tracking-widest mb-3">O problema</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900">Vender em live e Grupos Vip é caótico<br />sem a ferramenta certa</h2>
            <p className="text-slate-600 max-w-xl mx-auto">Milhares de vendedores perdem dinheiro todo dia por falta de organização durante as lives e ações de Grupo Vip</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {[
              { icon: MessageSquare, title: "Pedidos perdidos no chat", description: "O chat corre rápido durante a Live e os Grupos ficam cheios de mensagens. Sem captura automática, pedidos somem." },
              { icon: Clock, title: "Horas de trabalho manual", description: "Copiar nome, produto, endereço, cobrar um a um... isso toma horas do seu dia após cada Live ou ação no Grupo Vip." },
              { icon: TrendingUp, title: "Clientes que desistem", description: "Quem espera resposta por muito tempo simplesmente vai embora e compra na concorrência." },
            ].map((p, i) => (
              <div key={i} className="group bg-white border border-slate-200 rounded-2xl p-6 hover:border-rose-300 hover:shadow-lg transition-all">
                <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center mb-5">
                  <p.icon className="w-6 h-6 text-rose-500" />
                </div>
                <h3 className="font-semibold text-lg mb-2 text-slate-900">{p.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What is Cartzy */}
      <section className="py-24 border-b border-slate-100">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-sky-600 text-sm font-semibold uppercase tracking-widest mb-3">A solução</p>
                <h2 className="text-3xl md:text-4xl font-bold mb-5 leading-tight text-slate-900">
                  O sistema completo para quem vende em Live e Grupos de WhatsApp
                </h2>
                <p className="text-slate-600 mb-6 leading-relaxed">
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
                      <div className="w-5 h-5 rounded-full bg-sky-100 flex items-center justify-center mt-0.5 flex-shrink-0">
                        <Check className="w-3 h-3 text-sky-600" />
                      </div>
                      <span className="text-sm text-slate-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {[
                  { icon: Smartphone, label: "WhatsApp Nativo" },
                  { icon: CreditCard, label: "Pagamento Integrado" },
                  { icon: Truck, label: "Logística Completa" },
                  { icon: Globe, label: "11 Integrações" },
                  { icon: ShieldCheck, label: "Dados Seguros" },
                  { icon: BarChart3, label: "Relatórios" },
                ].map((tag, i) => (
                  <div key={i} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sky-200 bg-sky-50 text-sky-700 text-sm font-medium">
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
      <section id="features" className="py-24 border-b border-slate-100">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-600 text-sm font-semibold uppercase tracking-widest mb-3">Funcionalidades</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900">Tudo que você precisa em um só lugar</h2>
            <p className="text-slate-600 max-w-xl mx-auto">Chega de usar 5 ferramentas diferentes. O Cartzy centraliza sua operação inteira.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {features.map((feature, i) => (
              <div key={i} className="group bg-white border border-slate-200 rounded-2xl p-6 hover:border-sky-300 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-100 to-cyan-100 flex items-center justify-center mb-5 group-hover:from-sky-500 group-hover:to-cyan-400 transition-all">
                  <feature.icon className="w-6 h-6 text-sky-600 group-hover:text-white transition-colors" />
                </div>
                <h3 className="font-semibold text-base mb-2 text-slate-900">{feature.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-24 border-b border-slate-100 bg-slate-50/60">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-600 text-sm font-semibold uppercase tracking-widest mb-3">Antes vs Depois</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900">A diferença é visível desde o primeiro dia</h2>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
                <span className="text-rose-600 font-semibold text-sm">❌ Sem Cartzy</span>
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-center">
                <span className="text-sky-700 font-semibold text-sm">✅ Com Cartzy</span>
              </div>
            </div>
            {comparison.map((item, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 mb-2">
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                  <X className="w-4 h-4 text-rose-500 flex-shrink-0" />
                  <span className="text-sm text-slate-600">{item.without}</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                  <Check className="w-4 h-4 text-sky-500 flex-shrink-0" />
                  <span className="text-sm text-slate-700">{item.with}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 border-b border-slate-100">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-600 text-sm font-semibold uppercase tracking-widest mb-3">Como funciona</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900">Do pedido à entrega em 5 passos</h2>
            <p className="text-slate-600">Configure uma vez e o sistema trabalha por você</p>
          </div>

          <div className="max-w-2xl mx-auto">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-5 mb-8 last:mb-0">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 to-sky-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-sky-500/30">
                    {step.step}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-px flex-1 bg-gradient-to-b from-sky-300 to-transparent mt-2" />
                  )}
                </div>
                <div className="pb-8">
                  <h3 className="font-semibold text-lg mb-1 text-slate-900">{step.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Numbers */}
      <section className="py-20 border-b border-slate-100 bg-gradient-to-r from-sky-50 via-white to-cyan-50">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {benefits.map((b, i) => (
              <div key={i} className="text-center">
                <p className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-500 to-sky-600 bg-clip-text text-transparent mb-2">{b.value}</p>
                <p className="font-semibold text-slate-900 mb-1">{b.label}</p>
                <p className="text-xs text-slate-500">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 border-b border-slate-100">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-600 text-sm font-semibold uppercase tracking-widest mb-3">Depoimentos</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900">Quem usa, não volta atrás</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col hover:border-sky-300 hover:shadow-lg transition-all">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.stars }).map((_, s) => (
                    <Star key={s} className="w-4 h-4 fill-sky-500 text-sky-500" />
                  ))}
                </div>
                <p className="text-sm text-slate-700 leading-relaxed flex-1 mb-5">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-sky-500 flex items-center justify-center text-white font-bold text-sm">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 border-b border-slate-100 bg-slate-50/60">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-600 text-sm font-semibold uppercase tracking-widest mb-3">Planos</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900">Planos para cada etapa do seu negócio</h2>
            <p className="text-slate-600">Entre em contato e nossa equipe vai encontrar o plano ideal para você.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {plans.map((plan, i) => (
              <div key={i} className={`relative rounded-2xl p-7 flex flex-col border transition-all ${
                plan.highlight
                  ? "bg-gradient-to-br from-sky-500 to-blue-600 border-sky-500 shadow-2xl shadow-sky-500/30 scale-105 text-white"
                  : "bg-white border-slate-200 hover:border-sky-300 hover:shadow-lg"
              }`}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-white text-sky-600 text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                      MAIS POPULAR
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className={`font-bold text-xl mb-1 ${plan.highlight ? "text-white" : "text-slate-900"}`}>{plan.name}</h3>
                  <p className={`text-sm mb-4 ${plan.highlight ? "text-sky-100" : "text-slate-500"}`}>{plan.description}</p>
                  <p className={`text-2xl font-bold ${plan.highlight ? "text-white" : "text-slate-700"}`}>{plan.price}</p>
                </div>

                <div className="space-y-3 flex-1 mb-7">
                  {plan.features.map((f, fi) => (
                    <div key={fi} className="flex items-center gap-3">
                      <Check className={`w-4 h-4 flex-shrink-0 ${plan.highlight ? "text-white" : "text-sky-500"}`} />
                      <span className={`text-sm ${plan.highlight ? "text-white" : "text-slate-700"}`}>{f}</span>
                    </div>
                  ))}
                </div>

                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  <Button className={`w-full font-semibold ${
                    plan.highlight
                      ? "bg-white hover:bg-slate-100 text-sky-600"
                      : "bg-slate-900 hover:bg-slate-800 text-white"
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
      <section id="faq" className="py-24 border-b border-slate-100">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-sky-600 text-sm font-semibold uppercase tracking-widest mb-3">FAQ</p>
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-slate-900">Dúvidas frequentes</h2>
          </div>

          <div className="max-w-2xl mx-auto space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-sky-300 transition-colors">
                <button
                  className="w-full flex items-center justify-between p-6 text-left hover:bg-sky-50/50 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-medium text-sm pr-4 text-slate-900">{faq.question}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-6">
                    <p className="text-sm text-slate-600 leading-relaxed">{faq.answer}</p>
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
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/20 to-sky-500/20 rounded-3xl blur-2xl" />
            <div className="relative bg-gradient-to-br from-sky-500 to-blue-600 rounded-3xl p-12 md:p-16 shadow-2xl shadow-sky-500/30">
              <div className="flex justify-center mb-6">
                <div className="bg-white/95 rounded-2xl p-4">
                  <CartzyLogo size="md" />
                </div>
              </div>
              <h2 className="text-3xl md:text-5xl font-bold mb-5 leading-tight text-white">
                Pronto para nunca mais<br />perder um pedido?
              </h2>
              <p className="text-sky-100 mb-10 max-w-lg mx-auto">
                Fale com nossa equipe e descubra como o Cartzy pode transformar suas vendas em Live e nos Grupos de WhatsApp.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="bg-white hover:bg-slate-100 text-sky-600 px-10 h-14 text-base font-semibold shadow-xl hover:scale-105 transition-all">
                    Falar com a equipe Cartzy
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </a>
                <Link to="/auth">
                  <Button size="lg" variant="ghost" className="text-white hover:bg-white/10 hover:text-white h-14 px-8">
                    Já tenho conta →
                  </Button>
                </Link>
              </div>
              <p className="mt-6 text-xs text-sky-100">Sem fidelidade • Cancele quando quiser • Suporte via WhatsApp</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-slate-200 bg-white">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <CartzyLogo size="sm" />
            <div className="flex items-center gap-6">
              <Link to="/politica-de-privacidade" className="text-sm text-slate-500 hover:text-sky-600 transition-colors">
                Política de Privacidade
              </Link>
              <Link to="/termos-de-uso" className="text-sm text-slate-500 hover:text-sky-600 transition-colors">
                Termos de Uso
              </Link>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-500 hover:text-sky-600 transition-colors">
                Contato
              </a>
            </div>
            <p className="text-sm text-slate-500">© 2026 Cartzy. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
