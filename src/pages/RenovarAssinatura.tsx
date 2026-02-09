import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, Check, Crown, Rocket, Building2, Loader2, Zap } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Plan {
  id: string;
  name: string;
  days: number;
  price: number;
  displayPrice?: string;
  features: string[];
  popular?: boolean;
  icon: React.ReactNode;
}

const PLANS: Plan[] = [
  {
    id: "basic",
    name: "Basic",
    days: 30,
    price: 499.00,
    displayPrice: "R$ 499,00",
    features: [
      "Acesso completo ao sistema",
      "Suporte por WhatsApp Horário Comercial",
      "1 mês de acesso",
    ],
    icon: <Rocket className="h-6 w-6" />,
  },
  {
    id: "pro",
    name: "Pro",
    days: 185,
    price: 2694.60,
    displayPrice: "6x de R$ 449,10",
    features: [
      "Acesso completo ao sistema",
      "Suporte prioritário",
      "6 meses de acesso",
      "Relatórios avançados",
      "10% de desconto incluso",
    ],
    popular: true,
    icon: <Crown className="h-6 w-6" />,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    days: 365,
    price: 5089.80,
    displayPrice: "12x de R$ 424,15",
    features: [
      "Acesso completo ao sistema",
      "Suporte VIP 24/7",
      "12 meses de acesso",
      "Relatórios avançados",
      "15% de desconto incluso",
    ],
    icon: <Building2 className="h-6 w-6" />,
  },
];

export default function RenovarAssinatura() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [tenantInfo, setTenantInfo] = useState<{
    name: string;
    subscription_ends_at: string | null;
  } | null>(null);

  useEffect(() => {
    document.title = "Renovar Assinatura - OrderZap";
  }, []);

  useEffect(() => {
    const fetchTenantInfo = async () => {
      // Tentar buscar pelo profile.tenant_id primeiro
      let tenantId = profile?.tenant_id;
      
      // Se não tiver, buscar direto do usuário logado
      if (!tenantId && user) {
        const { data: userProfile } = await supabase
          .from("profiles")
          .select("tenant_id")
          .eq("id", user.id)
          .maybeSingle();
        
        tenantId = userProfile?.tenant_id;
      }
      
      if (!tenantId) {
        console.log('[RenovarAssinatura] Nenhum tenant_id encontrado');
        return;
      }

      console.log('[RenovarAssinatura] Buscando info do tenant:', tenantId);
      
      const { data } = await supabase
        .from("tenants")
        .select("name, subscription_ends_at")
        .eq("id", tenantId)
        .maybeSingle();

      if (data) {
        console.log('[RenovarAssinatura] Tenant info:', data);
        setTenantInfo(data);
      }
    };

    fetchTenantInfo();
  }, [profile?.tenant_id, user]);

  const handleSelectPlan = async (plan: Plan) => {
    if (!user) {
      toast({
        title: "Erro",
        description: "Usuário não autenticado",
        variant: "destructive",
      });
      return;
    }
    
    // Buscar tenant_id direto se não tiver no profile
    let tenantId = profile?.tenant_id;
    if (!tenantId) {
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .maybeSingle();
      
      tenantId = userProfile?.tenant_id;
    }
    
    if (!tenantId) {
      toast({
        title: "Erro",
        description: "Empresa não identificada",
        variant: "destructive",
      });
      return;
    }

    setLoading(plan.id);

    try {
      console.log('[RenovarAssinatura] Criando pagamento:', { tenantId, plan });
      
      const { data, error } = await supabase.functions.invoke("create-subscription-payment", {
        body: {
          tenant_id: tenantId,
          plan_id: plan.id,
          plan_name: plan.name,
          plan_days: plan.days,
          plan_price: plan.price,
          user_email: user.email,
        },
      });

      if (error) throw error;

      if (data?.init_point) {
        // Redirecionar para o link de pagamento
        window.location.href = data.init_point;
      } else {
        throw new Error("Link de pagamento não gerado");
      }
    } catch (err: any) {
      console.error("Erro ao criar pagamento:", err);
      toast({
        title: "Erro ao processar",
        description: err.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Não definido";
    return new Date(dateStr).toLocaleDateString("pt-BR");
  };

  const isExpired = tenantInfo?.subscription_ends_at
    ? new Date(tenantInfo.subscription_ends_at) < new Date()
    : false;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-gradient-to-br from-primary to-accent rounded-2xl shadow-lg">
              <Zap className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Renovar Assinatura
          </h1>
          {tenantInfo && (
            <p className="text-muted-foreground">
              Empresa: <span className="font-semibold">{tenantInfo.name}</span>
            </p>
          )}
        </div>

        {/* Alerta de expiração */}
        <Alert variant="destructive" className="mb-8 max-w-2xl mx-auto">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Acesso Expirado</AlertTitle>
          <AlertDescription>
            {isExpired ? (
              <>
                Seu plano expirou em{" "}
                <strong>{formatDate(tenantInfo?.subscription_ends_at ?? null)}</strong>.
                Selecione um dos planos abaixo para renovar seu acesso.
              </>
            ) : (
              <>
                Seu acesso está bloqueado. Selecione um plano para continuar
                utilizando o sistema.
              </>
            )}
          </AlertDescription>
        </Alert>

        {/* Cards de Planos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={`relative transition-all duration-300 hover:shadow-xl ${
                plan.popular
                  ? "border-primary shadow-lg scale-105 md:scale-110"
                  : "hover:border-primary/50"
              }`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                  Mais Popular
                </Badge>
              )}
              <CardHeader className="text-center pb-2">
                <div
                  className={`mx-auto p-3 rounded-xl mb-3 ${
                    plan.popular
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {plan.icon}
                </div>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>
                  {plan.days} dias de acesso
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <div className="mb-6">
                  <span className="text-3xl font-bold">
                    {plan.displayPrice || `R$ ${plan.price.toFixed(2).replace(".", ",")}`}
                  </span>
                </div>
                <ul className="space-y-3 text-left">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={plan.popular ? "default" : "outline"}
                  size="lg"
                  onClick={() => handleSelectPlan(plan)}
                  disabled={loading !== null}
                >
                  {loading === plan.id ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    "Selecionar Plano"
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Info adicional */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            Pagamento seguro processado via Mercado Pago.
            <br />
            Após a confirmação do pagamento, seu acesso será liberado
            automaticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
