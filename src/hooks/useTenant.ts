/**
 * Hook para obter tenant do usuário logado
 * Sistema simples: usuário faz login → sistema identifica tenant automaticamente
 * SEM slug, SEM subdomínio, SEM complicação!
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  is_active: boolean;
  enable_live?: boolean;
  enable_sendflow?: boolean;
  max_whatsapp_groups?: number | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  whatsapp_number?: string | null;
  email?: string | null;
}

export function useTenant() {
  const { profile, isLoading: authLoading } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTenant() {
      // Se ainda está carregando auth, aguarda
      if (authLoading) {
        return;
      }

      // Se não tem perfil ou não tem tenant_id, não há tenant
      if (!profile?.tenant_id) {
        setTenant(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Busca o tenant do usuário logado
        const { data, error: fetchError } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', profile.tenant_id)
          .single();

        if (fetchError) {
          console.error('Erro ao buscar tenant:', fetchError);
          setError('Erro ao carregar dados da empresa');
          setTenant(null);
          return;
        }

        setTenant(data);
      } catch (err) {
        console.error('Erro ao carregar tenant:', err);
        setError('Erro ao carregar dados da empresa');
        setTenant(null);
      } finally {
        setLoading(false);
      }
    }

    loadTenant();
  }, [profile, authLoading]);

  return {
    tenant,
    loading: loading || authLoading,
    error,
    isValidSubdomain: !!tenant, // Sempre true se tem tenant
  };
}
