import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/contexts/TenantContext";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { Loader2 } from "lucide-react";

interface RequireTenantAuthProps {
  children: ReactNode;
}

export default function RequireTenantAuth({ children }: RequireTenantAuthProps) {
  const { user, profile, isLoading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading, tenantId, error: tenantError } = useTenantContext();
  
  // Ativar timeout de sessão apenas quando logado
  useSessionTimeout();

  // Debug logs para diagnóstico
  console.log('[RequireTenantAuth] Estado:', {
    authLoading,
    tenantLoading,
    hasUser: !!user,
    hasProfile: !!profile,
    profileRole: profile?.role,
    hasTenant: !!tenant,
    tenantId,
    tenantError
  });

  // Se ainda está carregando auth ou tenant, mostrar loading
  if (authLoading || tenantLoading) {
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

  return <>{children}</>;
}