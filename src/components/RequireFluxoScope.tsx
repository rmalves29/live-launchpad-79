import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

/**
 * Guarda para usuários com access_scope='fluxo_envio': só permite acesso a
 * /fluxo-envio/app. Se o usuário for do sistema completo (scope 'full'),
 * também libera — para permitir super_admin visualizar.
 */
export default function RequireFluxoScope({ children }: { children: ReactNode }) {
  const { user, profile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/fluxo-envio" replace />;
  if (!profile?.tenant_id) return <Navigate to="/fluxo-envio" replace />;
  return <>{children}</>;
}
