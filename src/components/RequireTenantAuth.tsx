import { ReactNode, useEffect, useState, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/contexts/TenantContext";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface RequireTenantAuthProps {
  children: ReactNode;
}

// Cache global para status de assinatura - evita verificação repetida
const subscriptionCache = new Map<string, { expired: boolean; checkedAt: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

export default function RequireTenantAuth({ children }: RequireTenantAuthProps) {
  const { user, profile, isLoading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading, tenantId, error: tenantError } = useTenantContext();
  const [subscriptionExpired, setSubscriptionExpired] = useState<boolean | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const lastCheckedTenantId = useRef<string | null>(null);
  
  // Ativar timeout de sessão apenas quando logado
  useSessionTimeout();

  // Verificar status da assinatura quando o tenant carregar
  useEffect(() => {
    const checkSubscription = async () => {
      if (!tenant?.id || !profile || profile.role === 'super_admin') {
        setSubscriptionExpired(false);
        return;
      }

      // Verificar cache primeiro
      const cached = subscriptionCache.get(tenant.id);
      const now = Date.now();
      if (cached && (now - cached.checkedAt) < CACHE_DURATION) {
        setSubscriptionExpired(cached.expired);
        return;
      }

      // Se já verificamos este tenant recentemente, não verificar de novo
      if (lastCheckedTenantId.current === tenant.id && subscriptionExpired !== null) {
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
          let expired = false;
          if (tenantData.subscription_ends_at) {
            const expirationDate = new Date(tenantData.subscription_ends_at);
            expired = expirationDate < new Date();
          }
          
          // Salvar no cache
          subscriptionCache.set(tenant.id, { expired, checkedAt: now });
          lastCheckedTenantId.current = tenant.id;
          setSubscriptionExpired(expired);
        } else {
          setSubscriptionExpired(false);
        }
      } catch (error) {
        console.error('[RequireTenantAuth] Erro ao verificar assinatura:', error);
        setSubscriptionExpired(false);
      } finally {
        setCheckingSubscription(false);
      }
    };

    checkSubscription();
  }, [tenant?.id, profile?.role]);

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
    console.error('❌ [RequireTenantAuth] ERRO CRÍTICO: Tenant carregado não corresponde ao tenant do usuário!');
    localStorage.removeItem('previewTenantId');
    return <Navigate to="/auth" replace />;
  }

  // VERIFICAÇÃO DE ASSINATURA: Se expirada, redirecionar para renovação
  if (subscriptionExpired) {
    return <Navigate to="/renovar-assinatura" replace />;
  }

  return <>{children}</>;
}