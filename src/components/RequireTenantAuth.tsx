import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/contexts/TenantContext";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";

interface RequireTenantAuthProps {
  children: ReactNode;
}

export default function RequireTenantAuth({ children }: RequireTenantAuthProps) {
  const { user, profile, isLoading } = useAuth();
  const { tenant, isMainSite } = useTenantContext();
  
  // Ativar timeout de sessão apenas quando logado
  useSessionTimeout();

  if (isLoading) return null;

  // Se não há usuário logado, redireciona para login do tenant
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Se estamos no site principal (sem tenant), permite acesso
  if (isMainSite) {
    return <>{children}</>;
  }

  // Se há tenant mas o usuário não tem profile carregado ainda
  if (tenant && !profile) {
    return null; // Loading...
  }

  // Se há tenant, verificar se o usuário pode acessar
  if (tenant && profile) {
    // Super admin pode acessar qualquer tenant
    if (profile.role === 'super_admin') {
      return <>{children}</>;
    }
    
    // Usuário comum deve pertencer ao tenant
    if (profile.tenant_id === tenant.id) {
      return <>{children}</>;
    }
    
    // Usuário não tem permissão para este tenant
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}