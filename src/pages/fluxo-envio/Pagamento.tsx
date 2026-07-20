import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, LogOut, Sparkles } from "lucide-react";
import { PagarmeSubscribeDialog } from "@/components/billing/PagarmeSubscribeDialog";
import { FuturisticFX } from "@/components/landing/FuturisticFX";

type PlanId = "basic" | "pro" | "enterprise";

interface Plan {
  id: PlanId;
  name: string;
  price: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "basic",
    name: "Essencial",
    price: 49.9,
    tagline: "Comece a lucrar com o Fluxo de Envio",
    features: [
      "Envios em grupos e privado",
      "Relatórios de entradas e saídas",
      "Automação de retorno ao grupo",
      "Suporte por e-mail",
    ],
  },
  {
    id: "pro",
    name: "Profissional",
    price: 69.9,
    tagline: "O favorito de quem vende todo dia",
    highlight: true,
    features: [
      "Tudo do Essencial",
      "Campanhas ilimitadas",
      "Agendamento avançado",
      "Suporte prioritário no WhatsApp",
    ],
  },
  {
    id: "enterprise",
    name: "Alto Volume",
    price: 89.9,
    tagline: "Para operações em escala",
    features: [
      "Tudo do Profissional",
      "Múltiplas conexões WhatsApp",
      "Fila de espera inteligente",
      "Consultoria mensal 1:1",
    ],
  },
];

export default function FluxoEnvioPagamento() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [trialInfo, setTrialInfo] = useState<{ expired: boolean; endsAt: string | null }>({
    expired: false,
    endsAt: null,
  });

  useEffect(() => {
    (async () => {
      if (!profile?.tenant_id) {
        setLoading(false);
        return;
      }
      setTenantId(profile.tenant_id);
      const { data } = await supabase
        .from("tenants")
        .select("plan_type, subscription_ends_at, trial_ends_at")
        .eq("id", profile.tenant_id)
        .maybeSingle();
      if (data) {
        const ends = data.subscription_ends_at || data.trial_ends_at;
        const expired = ends ? new Date(ends).getTime() < Date.now() : false;
        setTrialInfo({ expired, endsAt: ends });
        // Se já tem assinatura ativa (não trial e não expirada), volta para o app
        if (data.plan_type && data.plan_type !== "trial" && !expired) {
          navigate("/fluxo-envio/app", { replace: true });
          return;
        }
      }
      setLoading(false);
    })();
  }, [profile?.tenant_id, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07080F]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#07080F] text-white overflow-hidden">
      <FuturisticFX />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-cyan-400" />
          <span className="font-semibold tracking-tight">Fluxo de Envio</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-white/60 hidden sm:block">{user?.email}</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white"
            onClick={async () => {
              await signOut();
              navigate("/fluxo-envio");
            }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <Badge className="bg-cyan-500/15 text-cyan-300 border-cyan-400/30 mb-4">
            {trialInfo.expired ? "Seu período grátis acabou" : "Escolha seu plano"}
          </Badge>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
            {trialInfo.expired
              ? "Continue vendendo sem parar"
              : "Ative sua assinatura para continuar"}
          </h1>
          <p className="text-white/60 mt-4 max-w-2xl mx-auto">
            Você testou o Fluxo de Envio por 3 dias. Escolha o plano que combina com o
            seu volume de vendas e mantenha tudo funcionando.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={`relative bg-white/[0.03] backdrop-blur-xl border ${
                plan.highlight
                  ? "border-cyan-400/50 shadow-[0_0_60px_-15px_rgba(34,211,238,0.6)]"
                  : "border-white/10"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-cyan-500 text-black font-semibold">
                    Mais escolhido
                  </Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription className="text-white/60">
                  {plan.tagline}
                </CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">
                    R$ {plan.price.toFixed(2).replace(".", ",")}
                  </span>
                  <span className="text-white/50 ml-1">/mês</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-cyan-400 mt-0.5 shrink-0" />
                      <span className="text-white/80">{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className={`w-full ${
                    plan.highlight
                      ? "bg-cyan-500 hover:bg-cyan-400 text-black"
                      : "bg-white/10 hover:bg-white/20 text-white"
                  }`}
                  onClick={() => setSelected(plan)}
                  disabled={!tenantId}
                >
                  Assinar {plan.name}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-center text-white/40 text-xs mt-8">
          Cobrança mensal recorrente no cartão via Pagar.me. Cancele quando quiser.
        </p>
      </main>

      {selected && tenantId && user?.email && (
        <PagarmeSubscribeDialog
          open={!!selected}
          onOpenChange={(v) => !v && setSelected(null)}
          tenantId={tenantId}
          planId={selected.id}
          planName={selected.name}
          planPrice={selected.price}
          intervalMonths={1}
          userEmail={user.email}
          onSuccess={() => {
            setSelected(null);
            navigate("/fluxo-envio/app", { replace: true });
          }}
        />
      )}
    </div>
  );
}
