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
const SUBSCRIPTION_CHECK_TIMEOUT = 3000; // 3s fail-open

export default function RequireTenantAuth({ children }: RequireTenantAuthProps) {
  const { user, profile, isLoading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading, tenantId } = useTenantContext();
  const [subscriptionExpired, setSubscriptionExpired] = useState<boolean | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const lastCheckedTenantId = useRef<string | null>(null);

  useSessionTimeout();

  // Diagnóstico
  useEffect(() => {
    console.log('[LOGIN-DIAG] RequireTenantAuth state:', {
      authLoading,
      tenantLoading,
      checkingSubscription,
      hasUser: !!user,
      hasProfile: !!profile,
      role: profile?.role,
      hasTenant: !!tenant,
      tenantId,
      subscriptionExpired,
    });
  }, [authLoading, tenantLoading, checkingSubscription, user, profile, tenant, tenantId, subscriptionExpired]);

  useEffect(() => {
    const checkSubscription = async () => {
      if (!tenant?.id || !profile || profile.role === 'super_admin') {
        setSubscriptionExpired(false);
        setCheckingSubscription(false);
        return;
      }

      const cached = subscriptionCache.get(tenant.id);
      const now = Date.now();
      if (cached && (now - cached.checkedAt) < CACHE_DURATION) {
        setSubscriptionExpired(cached.expired);
        return;
      }

      if (lastCheckedTenantId.current === tenant.id && subscriptionExpired !== null) {
        return;
      }

      setSubscriptionExpired(null);
      setCheckingSubscription(true);

      // Fail-open: se demorar mais que 3s, libera acesso
      const timeoutId = setTimeout(() => {
        console.warn('[LOGIN-DIAG] Subscription check timeout — fail-open');
        setSubscriptionExpired(false);
        setCheckingSubscription(false);
      }, SUBSCRIPTION_CHECK_TIMEOUT);

      try {
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("is_active, is_blocked, subscription_ends_at")
          .eq("id", tenant.id)
          .single();

        clearTimeout(timeoutId);

        if (tenantData) {
          let expired = false;
          if (tenantData.subscription_ends_at) {
            const expirationDate = new Date(tenantData.subscription_ends_at);
            expired = expirationDate < new Date();
          }
          subscriptionCache.set(tenant.id, { expired, checkedAt: now });
          lastCheckedTenantId.current = tenant.id;
          setSubscriptionExpired(expired);
        } else {
          setSubscriptionExpired(false);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        console.error('[RequireTenantAuth] Erro ao verificar assinatura:', error);
        setSubscriptionExpired(false);
      } finally {
        setCheckingSubscription(false);
      }
    };

    checkSubscription();
  }, [tenant?.id, profile?.role]);

  // Aguardar auth carregar
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Sem usuário → login
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Sem profile ainda
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Super admin
  if (profile.role === 'super_admin') {
    if (tenantLoading || (!tenant && !tenantId)) {
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

  // Usuário normal
  if (!profile.tenant_id) {
    return <Navigate to="/auth" replace />;
  }

  // Aguardar tenant carregar
  if (tenantLoading || !tenant || !tenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando empresa...</p>
        </div>
      </div>
    );
  }

  // Tenant deve corresponder ao profile
  if (tenant.id !== profile.tenant_id) {
    localStorage.removeItem('previewTenantId');
    return <Navigate to="/auth" replace />;
  }

  // Verificação de assinatura ainda em andamento (sem cache)
  if (subscriptionExpired === null && checkingSubscription) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (subscriptionExpired === true) {
    return <Navigate to="/renovar-assinatura" replace />;
  }

  return <>{children}</>;
}
