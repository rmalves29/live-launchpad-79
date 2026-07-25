import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface FluxoPlanLimits {
  planId: 'trial' | 'basic' | 'pro' | 'enterprise' | string;
  planLabel: string;
  maxGroups: number; // Infinity = ilimitado
  maxCampaigns: number;
  loading: boolean;
}

const LIMITS: Record<string, { label: string; maxGroups: number; maxCampaigns: number }> = {
  trial: { label: 'Trial', maxGroups: 5, maxCampaigns: 15 },
  basic: { label: 'Essencial', maxGroups: 5, maxCampaigns: 15 },
  pro: { label: 'Profissional', maxGroups: 10, maxCampaigns: 30 },
  enterprise: { label: 'Alto Volume', maxGroups: Infinity, maxCampaigns: Infinity },
};

export function useFluxoPlanLimits(): FluxoPlanLimits {
  const { profile } = useAuth();
  const [planId, setPlanId] = useState<string>('trial');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!profile?.tenant_id) {
        setLoading(false);
        return;
      }
      // super_admin e usuários com escopo full ficam sem limites
      if ((profile as any)?.access_scope !== 'fluxo_envio') {
        setPlanId('enterprise');
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('tenants')
        .select('plan_type')
        .eq('id', profile.tenant_id)
        .maybeSingle();
      const pt = (data?.plan_type || 'trial').toLowerCase();
      setPlanId(LIMITS[pt] ? pt : 'trial');
      setLoading(false);
    })();
  }, [profile?.tenant_id, (profile as any)?.access_scope]);

  const cfg = LIMITS[planId] || LIMITS.trial;
  return {
    planId,
    planLabel: cfg.label,
    maxGroups: cfg.maxGroups,
    maxCampaigns: cfg.maxCampaigns,
    loading,
  };
}
