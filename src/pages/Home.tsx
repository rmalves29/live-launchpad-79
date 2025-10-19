import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Zap, Instagram, CheckCircle, ArrowRight, MessageCircle } from "lucide-react";

export default function Home() {
  const navigate = useNavigate();

  const features = [
    {
      icon: MessageSquare,
      title: "Reconhecimento Automático",
      description: "Sistema inteligente que identifica automaticamente comentários nos grupos do WhatsApp e registra pedidos sem intervenção manual.",
      benefits: ["Economia de tempo", "Zero erros de digitação", "Processamento instantâneo"]
    },
    {
      icon: Instagram,
      title: "Integração Instagram + WhatsApp",
      description: "Plataforma completa para gerenciar vendas em grupos e lives do Instagram",
      benefits: ["Lives integradas", "Grupos sincronizados", "Checkout automático"]
    },
    {
      icon: Zap,
      title: "Mensagens Automáticas",
      description: "Envie mensagens personalizadas e automatizadas para seus grupos de WhatsApp de forma programada.",
      benefits: ["Campanhas agendadas", "Segmentação de público", "Templates personalizados"]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <div className="text-2xl font-bold">OrderZaps</div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="inline-block px-4 py-2 bg-primary/10 rounded-full mb-4">
            <span className="text-sm font-medium text-primary">Sistema de Automação para Vendas</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            Automatize suas vendas em
            <span className="block text-primary mt-2">WhatsApp e Instagram</span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Reconhecimento automático de pedidos, integração completa com Instagram Lives e envio de mensagens em massa. Tudo em uma única plataforma.
          </p>
          
          <div className="flex justify-center mt-8">
            <Button 
              size="lg" 
              variant="outline"
              className="text-lg px-8 py-6"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Ver Recursos
            </Button>
          </div>
        </div>
      </section>


      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Recursos Poderosos</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Tudo o que você precisa para vender mais com automação inteligente
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <Card key={index} className="relative overflow-hidden hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/50">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">{feature.title}</CardTitle>
                <CardDescription className="text-base mt-2">
                  {feature.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {feature.benefits.map((benefit, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-muted/30 py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Como Funciona</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Processo simples e automatizado em 3 passos
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: "01",
                title: "Conecte seus Grupos",
                description: "Integre seus grupos de WhatsApp e Instagram ao sistema com apenas alguns cliques"
              },
              {
                step: "02",
                title: "Configure Automações",
                description: "Defina regras de reconhecimento automático e templates de mensagens personalizadas"
              },
              {
                step: "03",
                title: "Venda no Automático",
                description: "O sistema identifica pedidos, envia confirmações e gerencia todo o processo para você"
              }
            ].map((item, index) => (
              <div key={index} className="relative">
                <div className="text-6xl font-bold text-primary/20 mb-4">{item.step}</div>
                <h3 className="text-2xl font-semibold mb-3">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <Card className="max-w-4xl mx-auto bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/20">
          <CardContent className="p-12 text-center space-y-6">
            <h2 className="text-4xl font-bold">Pronto para Automatizar suas Vendas?</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Junte-se a centenas de vendedores que já automatizaram seus processos e aumentaram suas vendas
            </p>
            <Button 
              size="lg"
              onClick={() => window.open('https://api.whatsapp.com/send/?phone=5531992904210&text=Quero%20saber%20mais', '_blank')}
              className="text-lg px-10 py-6"
            >
              Contrate Agora
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 mt-20">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>© 2025 Order Zap - Sistema de Automação para Vendas</p>
        </div>
      </footer>

      {/* WhatsApp Floating Button */}
      <a
        href="https://api.whatsapp.com/send/?phone=5531992904210&text=Quero%20saber%20mais"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 bg-green-500 hover:bg-green-600 text-white rounded-full p-4 shadow-lg transition-all hover:scale-110 z-50"
        aria-label="Fale conosco no WhatsApp"
      >
        <MessageCircle size={32} />
      </a>
    </div>
  );
}
