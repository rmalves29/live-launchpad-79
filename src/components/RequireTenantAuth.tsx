import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/contexts/TenantContext";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface RequireTenantAuthProps {
  children: ReactNode;
}

export default function RequireTenantAuth({ children }: RequireTenantAuthProps) {
  const { user, profile, isLoading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading, tenantId, error: tenantError } = useTenantContext();
  const [subscriptionExpired, setSubscriptionExpired] = useState<boolean | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  
  // Ativar timeout de sessão apenas quando logado
  useSessionTimeout();

  // Verificar status da assinatura quando o tenant carregar
  useEffect(() => {
    const checkSubscription = async () => {
      if (!tenant?.id || !profile || profile.role === 'super_admin') {
        setSubscriptionExpired(false);
        return;
      }

      setCheckingSubscription(true);
      try {
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("is_active, is_blocked, subscription_ends_at")
          .eq("id", tenant.id)
          .single();

        if (tenantData) {
          // Verificar se assinatura expirou
          if (tenantData.subscription_ends_at) {
            const expirationDate = new Date(tenantData.subscription_ends_at);
            const now = new Date();
            console.log('[RequireTenantAuth] Verificando assinatura:', {
              expirationDate: expirationDate.toISOString(),
              now: now.toISOString(),
              expired: expirationDate < now
            });
            setSubscriptionExpired(expirationDate < now);
          } else {
            setSubscriptionExpired(false);
          }
        }
      } catch (error) {
        console.error('[RequireTenantAuth] Erro ao verificar assinatura:', error);
        setSubscriptionExpired(false);
      } finally {
        setCheckingSubscription(false);
      }
    };

    checkSubscription();
  }, [tenant?.id, profile]);

  // Debug logs para diagnóstico
  console.log('[RequireTenantAuth] Estado:', {
    authLoading,
    tenantLoading,
    hasUser: !!user,
    hasProfile: !!profile,
    profileRole: profile?.role,
    hasTenant: !!tenant,
    tenantId,
    tenantError,
    subscriptionExpired,
    checkingSubscription
  });

  // Se ainda está carregando auth ou tenant, mostrar loading
  if (authLoading || tenantLoading || checkingSubscription) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Se não há usuário logado, redireciona para login
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Se não tem profile carregado ainda
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Super admin pode acessar qualquer tenant
  if (profile.role === 'super_admin') {
    // Mas precisa ter um tenant selecionado
    if (!tenant || !tenantId) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando empresa...</p>
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  // Usuário normal - DEVE ter tenant do seu profile
  if (!profile.tenant_id) {
    return <Navigate to="/auth" replace />;
  }

  // Aguardar tenant carregar
  if (!tenant || !tenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando empresa...</p>
        </div>
      </div>
    );
  }

  // VERIFICAÇÃO CRÍTICA: O tenant carregado DEVE ser o mesmo do profile
  if (tenant.id !== profile.tenant_id) {
    console.error('❌ [RequireTenantAuth] ERRO CRÍTICO: Tenant carregado não corresponde ao tenant do usuário!', {
      tenantCarregado: tenant.id,
      tenantDoUsuario: profile.tenant_id
    });
    // Limpar localStorage e redirecionar
    localStorage.removeItem('previewTenantId');
    return <Navigate to="/auth" replace />;
  }

  // VERIFICAÇÃO DE ASSINATURA: Se expirada, redirecionar para renovação
  if (subscriptionExpired) {
    console.log('[RequireTenantAuth] Assinatura expirada, redirecionando para renovação');
    return <Navigate to="/renovar-assinatura" replace />;
  }

  return <>{children}</>;
}