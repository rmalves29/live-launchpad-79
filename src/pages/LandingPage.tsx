import { 
  MessageSquare, 
  Package, 
  CreditCard, 
  Truck, 
  Gift, 
  BarChart3, 
  Check, 
  X, 
  Zap, 
  Users, 
  Clock, 
  TrendingUp,
  ArrowRight,
  Play,
  Star,
  ShoppingBag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function LandingPage() {
  const features = [
    {
      icon: Package,
      title: "Gestão de Pedidos",
      description: "Capture, organize e acompanhe todos os pedidos em tempo real"
    },
    {
      icon: MessageSquare,
      title: "WhatsApp Integrado",
      description: "Envio automático de mensagens, cobranças e rastreio via whatsapp"
    },
    {
      icon: CreditCard,
      title: "Pagamento",
      description: "Links de pagamento automáticos com confirmação instantânea"
    },
    {
      icon: Truck,
      title: "Sistema de Envio",
      description: "Etiquetas e rastreio automático integrado às transportadoras"
    },
    {
      icon: Gift,
      title: "Cupons e Brindes",
      description: "Sistema completo de promoções e fidelização de clientes"
    },
    {
      icon: BarChart3,
      title: "Relatórios",
      description: "Métricas de vendas, clientes e performance em tempo real"
    }
  ];

  const comparison = [
    { without: "Anotar pedidos em papel", with: "Captura automática na live" },
    { without: "Cobrar cliente por DM", with: "Link de pagamento automático" },
    { without: "Enviar rastreio manualmente", with: "Notificação automática" },
    { without: "Perder vendas por demora", with: "Resposta instantânea" },
    { without: "Horas organizando planilhas", with: "Dashboard em tempo real" },
  ];

  const steps = [
    { step: 1, title: "Configure sua loja", description: "Cadastre produtos, preços e personalize sua loja em minutos" },
    { step: 2, title: "Conecte o WhatsApp", description: "Integre seu número via Z-API para automação total" },
    { step: 3, title: "Venda na Live", description: "Sistema captura pedidos automaticamente durante a transmissão" },
    { step: 4, title: "Cobrança automática", description: "Links de pagamento enviados instantaneamente via WhatsApp" },
    { step: 5, title: "Envio e rastreio", description: "Etiquetas geradas e código de rastreio enviado ao cliente" },
  ];

  const audiences = [
    { icon: Play, title: "Lojas de Live", description: "Vendedores que fazem lives no Instagram, Facebook ou TikTok" },
    { icon: ShoppingBag, title: "Bazares e Brechós", description: "Negócios que vendem roupas, acessórios e produtos usados" },
    { icon: Users, title: "Revendedores", description: "Profissionais que trabalham com vendas diretas e catálogos" },
  ];

  const benefits = [
    { value: "10x", label: "Mais rápido", description: "Processo de venda automatizado" },
    { value: "0", label: "Pedidos perdidos", description: "Captura automática de tudo" },
    { value: "24/7", label: "Funcionando", description: "Sistema sempre disponível" },
    { value: "100%", label: "Integrado", description: "WhatsApp, pagamento e envio" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">OrderZap</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors">Funcionalidades</a>
            <a href="#how-it-works" className="text-sm text-gray-400 hover:text-white transition-colors">Como funciona</a>
            <a href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">Preços</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white">
                Entrar
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white">
                Começar Grátis
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/10 rounded-full blur-[120px]" />
        
        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
              <Star className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-400">Sistema #1 para vendas em lives e grupos de whatsapp</span>
            </div>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6">
              Venda na Live e grupos de whatsapp
              <br />
              <span className="bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent">
                sem perder vendas
              </span>
            </h1>
            
            <p className="text-lg md:text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
              Sistema completo de gestão de pedidos com WhatsApp integrado. 
              Capture pedidos, envie cobranças e rastreio automaticamente.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/auth">
                <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 h-12 text-base">
                  Começar Agora
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="border-gray-700 text-emerald-400 hover:bg-white/5 px-8 h-12 text-base">
                <Play className="mr-2 w-5 h-5" />
                Ver Demonstração
              </Button>
            </div>

            <div className="mt-12 flex flex-wrap items-center justify-center gap-6 md:gap-8 text-sm text-gray-500">
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                Sem cobrança adicional por mensagem enviada
              </span>
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500" />
                WhatsApp gratuito
              </span>
            </div>
          </div>

          {/* Dashboard Preview */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent to-transparent z-10" />
            <div className="bg-gradient-to-b from-gray-800/50 to-gray-900/50 rounded-xl border border-white/10 p-2 md:p-4 max-w-5xl mx-auto">
              <div className="bg-[#0d0d12] rounded-lg p-4 md:p-8">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[
                    { label: "Pedidos Hoje", value: "47", color: "emerald" },
                    { label: "Faturamento", value: "R$ 8.450", color: "blue" },
                    { label: "Ticket Médio", value: "R$ 179", color: "purple" },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white/5 rounded-lg p-4 border border-white/5">
                      <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
                      <p className={`text-xl md:text-2xl font-bold ${
                        stat.color === 'emerald' ? 'text-emerald-400' :
                        stat.color === 'blue' ? 'text-blue-400' : 'text-purple-400'
                      }`}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg p-3 border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <Package className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Pedido #{230 + i}</p>
                          <p className="text-xs text-gray-500">Maria Silva • R$ 189,90</p>
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400">
                        Pago
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              O problema das vendas em lives e grupos de whatsapp
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: MessageSquare, title: "Pedidos perdidos", description: "Chat caótico durante a live, mensagens que passam batido" },
              { icon: Clock, title: "Horas perdidas", description: "Copiar, colar, organizar... trabalho manual sem fim" },
              { icon: TrendingUp, title: "Vendas canceladas", description: "Clientes desistem pela demora no atendimento" },
            ].map((problem, i) => (
              <div key={i} className="bg-red-500/5 border border-red-500/20 rounded-xl p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                  <problem.icon className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="font-semibold mb-2">{problem.title}</h3>
                <p className="text-sm text-gray-400">{problem.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What is OrderZap */}
      <section className="py-20 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              O que é o <span className="text-emerald-400">OrderZap</span>?
            </h2>
            <p className="text-lg text-gray-400 mb-8">
              OrderZap é um sistema completo de gestão de pedidos desenvolvido especialmente 
              para quem vende em lives. Capture pedidos automaticamente, envie cobranças 
              e rastreio via WhatsApp, tudo integrado em uma única plataforma.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-sm">
                WhatsApp Nativo
              </span>
              <span className="px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm">
                Sistema de Pagamento Integrado
              </span>
              <span className="px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm">
                Sistema de Envio Integrado
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Funcionalidades completas
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Tudo que você precisa para gerenciar suas vendas em um só lugar
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {features.map((feature, i) => (
              <div 
                key={i} 
                className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 hover:border-emerald-500/30 transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-20 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Antes vs Depois do OrderZap
            </h2>
            <p className="text-gray-400">
              Veja como o OrderZap transforma sua operação de vendas
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
                <span className="text-red-400 font-semibold">Sem OrderZap</span>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
                <span className="text-emerald-400 font-semibold">Com OrderZap</span>
              </div>
            </div>
            
            {comparison.map((item, i) => (
              <div key={i} className="grid grid-cols-2 gap-4 mb-2">
                <div className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-center gap-3">
                  <X className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <span className="text-sm text-gray-300">{item.without}</span>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-center gap-3">
                  <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <span className="text-sm text-gray-300">{item.with}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Target Audience */}
      <section className="py-20 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Para quem é o OrderZap?
            </h2>
            <p className="text-gray-400">
              Ideal para profissionais que vendem online e precisam de agilidade
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {audiences.map((audience, i) => (
              <div key={i} className="bg-gradient-to-b from-white/10 to-white/5 border border-white/10 rounded-xl p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                  <audience.icon className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="font-semibold mb-2">{audience.title}</h3>
                <p className="text-sm text-gray-400">{audience.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-20 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Como funciona?
            </h2>
            <p className="text-gray-400">
              Em 5 passos simples você está pronto para vender
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-4 mb-8 last:mb-0">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold">
                    {step.step}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-0.5 h-full bg-emerald-500/30 mt-2" />
                  )}
                </div>
                <div className="pb-8">
                  <h3 className="font-semibold mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-400">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Resultados reais
            </h2>
            <p className="text-gray-400">
              O que nossos clientes alcançam com o OrderZap
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {benefits.map((benefit, i) => (
              <div key={i} className="text-center p-6">
                <p className="text-4xl md:text-5xl font-bold text-emerald-400 mb-2">
                  {benefit.value}
                </p>
                <p className="font-semibold mb-1">{benefit.label}</p>
                <p className="text-xs text-gray-500">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-emerald-500/20 rounded-2xl p-8 md:p-12 border border-emerald-500/20">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Pronto para revolucionar suas vendas?
              </h2>
              <p className="text-gray-400 mb-8">
                Comece agora mesmo e veja a diferença na sua próxima live
              </p>
              <Link to="/auth">
                <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white px-12 h-14 text-lg">
                  Criar Conta Grátis
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <p className="mt-4 text-sm text-gray-500">
                Sem cartão de crédito • Setup em 5 minutos
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-white/5">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold">OrderZap</span>
            </div>
            <p className="text-sm text-gray-500">
              © 2024 OrderZap. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
