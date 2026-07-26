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
  // Fallback: sessão lida diretamente do Supabase (evita corrida com o contexto)
  const [directSession, setDirectSession] = useState<'unknown' | 'yes' | 'no'>('unknown');
  const [directProfile, setDirectProfile] = useState<{ tenant_id: string | null; access_scope?: string | null } | null>(null);

  // Confere sessão/perfil direto no Supabase quando o contexto ainda não tem usuário
  useEffect(() => {
    let active = true;
    if (user) {
      setDirectSession('yes');
      return;
    }
    (async () => {
      // pequena espera para o SDK hidratar a sessão após o login
      for (let i = 0; i < 10; i++) {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (data.session?.user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('tenant_id, access_scope')
            .eq('id', data.session.user.id)
            .maybeSingle();
          if (!active) return;
          setDirectProfile(prof ?? null);
          setDirectSession('yes');
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (active) setDirectSession('no');
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const effectiveProfile = profile ?? directProfile;

  useEffect(() => {
    (async () => {
      if (!effectiveProfile?.tenant_id) {
        setChecking(false);
        return;
      }
      // super_admin e usuários 'full' passam direto
      if (effectiveProfile.access_scope !== 'fluxo_envio') {
        setChecking(false);
        return;
      }

      // Retry de provisionamento da instância uazapi (fire-and-forget)
      const key = `fluxo_wa_ensured_${effectiveProfile.tenant_id}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        supabase.functions.invoke('fluxo-ensure-whatsapp', { body: {} }).catch(() => {});
      }

      const { data } = await supabase
        .from('tenants')
        .select('plan_type, subscription_ends_at, trial_ends_at')
        .eq('id', effectiveProfile.tenant_id)
        .maybeSingle();
      if (data) {
        const ends = data.subscription_ends_at || data.trial_ends_at;
        const expired = ends ? new Date(ends).getTime() < Date.now() : true;
        const isTrial = !data.plan_type || data.plan_type === 'trial';
        if (isTrial && expired) setNeedsPayment(true);
      }
      setChecking(false);
    })();
  }, [effectiveProfile?.tenant_id, effectiveProfile?.access_scope]);

  const hasUser = !!user || directSession === 'yes';

  // Enquanto sessão carrega OU usuário existe mas profile ainda não veio, aguarda
  if (isLoading || directSession === 'unknown' || (hasUser && !effectiveProfile) || checking) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!hasUser) return <Navigate to="/fluxo-envio" replace />;
  if (!effectiveProfile?.tenant_id) return <Navigate to="/fluxo-envio" replace />;
  if (needsPayment) return <Navigate to="/fluxo-envio/pagamento" replace />;
  return <>{children}</>;
}
