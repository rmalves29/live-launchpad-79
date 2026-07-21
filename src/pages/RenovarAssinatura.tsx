import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, Check, Crown, Rocket, Building2, Loader2, Zap, RefreshCw, XCircle, CreditCard } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PagarmeSubscribeDialog } from "@/components/billing/PagarmeSubscribeDialog";

interface Plan {
  id: string;
  name: string;
  days: number;
  price: number;
  monthlyPrice?: number;
  totalCycles?: number;
  displayPrice?: string;
  discount?: string;
  features: string[];
  popular?: boolean;
  icon: React.ReactNode;
}

// Tenant IDs com preços personalizados
const JU_BIJOUX_TENANT_ID = "1761e19e-d04f-4ed2-8695-df1912441054";

const getPlans = (tenantId?: string | null): Plan[] => {
  const isJuBijoux = tenantId === JU_BIJOUX_TENANT_ID;

  return [
    {
      id: "basic",
      name: "Basic",
      days: 30,
      price: isJuBijoux ? 399.00 : 499.00,
      displayPrice: isJuBijoux ? "R$ 399,00" : "R$ 499,00",
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
      price: isJuBijoux ? 350.00 : 449.10,
      monthlyPrice: isJuBijoux ? 350.00 : 449.10,
      totalCycles: 6,
      displayPrice: isJuBijoux ? "6x de R$ 350,00" : "6x de R$ 449,10",
      discount: isJuBijoux ? "Preço especial" : "10% de desconto",
      features: [
        "Acesso completo ao sistema",
        "Suporte prioritário",
        "6 meses de acesso",
        "Relatórios avançados",
        isJuBijoux ? "Preço especial incluso" : "10% de desconto incluso",
      ],
      popular: true,
      icon: <Crown className="h-6 w-6" />,
    },
    {
      id: "enterprise",
      name: "Enterprise",
      days: 365,
      price: isJuBijoux ? 299.00 : 424.15,
      monthlyPrice: isJuBijoux ? 299.00 : 424.15,
      totalCycles: 12,
      displayPrice: isJuBijoux ? "12x de R$ 299,00" : "12x de R$ 424,15",
      discount: isJuBijoux ? "Preço especial" : "15% de desconto",
      features: [
        "Acesso completo ao sistema",
        "Suporte VIP 24/7",
        "12 meses de acesso",
        "Relatórios avançados",
        isJuBijoux ? "Preço especial incluso" : "15% de desconto incluso",
      ],
      icon: <Building2 className="h-6 w-6" />,
    },
  ];
};

export default function RenovarAssinatura() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [tenantInfo, setTenantInfo] = useState<{
    name: string;
    subscription_ends_at: string | null;
  } | null>(null);
  const [recurringDialog, setRecurringDialog] = useState<Plan | null>(null);
  const [activeRecurring, setActiveRecurring] = useState<any | null>(null);
  const [cancelingRec, setCancelingRec] = useState(false);

  const loadRecurring = async (tid: string) => {
    const { data } = await supabase
      .from("subscription_recurrences" as any)
      .select("*")
      .eq("tenant_id", tid)
      .in("status", ["active", "past_due", "pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveRecurring(data || null);
  };

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
        setCurrentTenantId(tenantId);
        loadRecurring(tenantId);
      }
    };

    fetchTenantInfo();
  }, [profile?.tenant_id, user]);

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
          {getPlans(currentTenantId).map((plan) => (
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
              <CardFooter className="flex-col gap-2">
                {plan.id === "basic" ? (
                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                    size="lg"
                    onClick={() => currentTenantId && setRecurringDialog(plan)}
                    disabled={!currentTenantId}
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pagar com cartão
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                    size="lg"
                    onClick={() => currentTenantId && setRecurringDialog(plan)}
                    disabled={!currentTenantId || !!activeRecurring}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Assinar (renovação automática)
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Status assinatura recorrente ativa */}
        {activeRecurring && currentTenantId && (
          <Card className="mt-8 max-w-2xl mx-auto border-primary/40">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-primary" />
                Renovação automática ativa
              </CardTitle>
              <CardDescription>
                Plano <strong className="capitalize">{activeRecurring.plan_id}</strong> —
                cobrança a cada {activeRecurring.interval_months} meses no cartão
                {activeRecurring.card_brand ? ` ${activeRecurring.card_brand}` : ""}
                {activeRecurring.card_last4 ? ` final ${activeRecurring.card_last4}` : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <div>Status: <span className="font-medium">{activeRecurring.status}</span></div>
              {activeRecurring.current_period_end && (
                <div>Próxima cobrança: <strong>{formatDate(activeRecurring.current_period_end)}</strong></div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                size="sm"
                disabled={cancelingRec}
                onClick={async () => {
                  if (!confirm("Cancelar renovação automática? Você manterá o acesso até o fim do ciclo já pago.")) return;
                  setCancelingRec(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("pagarme-cancel-subscription", {
                      body: { subscription_id: activeRecurring.id },
                    });
                    if (error) throw error;
                    if (!data?.success) throw new Error(data?.error || "Erro");
                    toast({ title: "Renovação cancelada" });
                    await loadRecurring(currentTenantId);
                  } catch (e: any) {
                    toast({ title: "Erro", description: e.message, variant: "destructive" });
                  } finally {
                    setCancelingRec(false);
                  }
                }}
              >
                {cancelingRec ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
                Cancelar renovação
              </Button>
            </CardFooter>
          </Card>
        )}

        {recurringDialog && currentTenantId && user?.email && (
          <PagarmeSubscribeDialog
            open={!!recurringDialog}
            onOpenChange={(v) => !v && setRecurringDialog(null)}
            tenantId={currentTenantId}
            planId={recurringDialog.id as "basic" | "pro" | "enterprise"}
            planName={recurringDialog.name}
            planPrice={recurringDialog.monthlyPrice ?? recurringDialog.price}
            intervalMonths={1}
            totalCycles={recurringDialog.totalCycles}
            planDays={recurringDialog.days}
            mode={recurringDialog.id === "basic" ? "one_time" : "subscription"}
            userEmail={user.email}
            onSuccess={() => loadRecurring(currentTenantId)}
          />
        )}

        {/* Info adicional */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            Pagamento seguro processado via Pagar.me.
            <br />
            Após a confirmação do pagamento, seu acesso será liberado
            automaticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
