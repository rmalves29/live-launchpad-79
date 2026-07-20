import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

/**
 * Guarda para usuários com access_scope='fluxo_envio'.
 * Se o trial de 3 dias expirou e não há assinatura ativa, redireciona para /fluxo-envio/pagamento.
 */
export default function RequireFluxoScope({ children }: { children: ReactNode }) {
  const { user, profile, isLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [needsPayment, setNeedsPayment] = useState(false);

  useEffect(() => {
    (async () => {
      if (!profile?.tenant_id) {
        setChecking(false);
        return;
      }
      // super_admin e usuários 'full' passam direto
      if (profile.access_scope !== 'fluxo_envio') {
        setChecking(false);
        return;
      }
      const { data } = await supabase
        .from('tenants')
        .select('plan_type, subscription_ends_at, trial_ends_at')
        .eq('id', profile.tenant_id)
        .maybeSingle();
      if (data) {
        const ends = data.subscription_ends_at || data.trial_ends_at;
        const expired = ends ? new Date(ends).getTime() < Date.now() : true;
        const isTrial = !data.plan_type || data.plan_type === 'trial';
        if (isTrial && expired) setNeedsPayment(true);
      }
      setChecking(false);
    })();
  }, [profile?.tenant_id, profile?.access_scope]);

  if (isLoading || checking) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/fluxo-envio" replace />;
  if (!profile?.tenant_id) return <Navigate to="/fluxo-envio" replace />;
  if (needsPayment) return <Navigate to="/fluxo-envio/pagamento" replace />;
  return <>{children}</>;
}
