/**
 * Hook para obter tenant do usuário logado
 * - Super admin: pode usar preview tenant do localStorage
 * - Tenant admin/staff: usa tenant do profile automaticamente
 */

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { supabaseTenant } from '@/lib/supabase-tenant';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  enable_live?: boolean;
  enable_sendflow?: boolean;
  max_whatsapp_groups?: number | null;
}

const PREVIEW_TENANT_KEY = 'previewTenantId';

// Cache global para evitar refetch desnecessário
let cachedTenant: Tenant | null = null;
let cachedTenantId: string | null = null;

export function useTenant() {
  const { profile, isLoading: authLoading } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(cachedTenant);
  const [loading, setLoading] = useState(!cachedTenant);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    async function loadTenant() {
      // Se ainda está carregando auth, aguarda
      if (authLoading) {
        return;
      }

      // Se não tem perfil, não está logado
      if (!profile) {
        cachedTenant = null;
        cachedTenantId = null;
        setTenant(null);
        setLoading(false);
        return;
      }

      // Super admin pode usar preview tenant
      if (profile.role === 'super_admin') {
        const previewTenantId = localStorage.getItem(PREVIEW_TENANT_KEY);
        
        // Se já temos cache para este tenant, usar
        if (previewTenantId && cachedTenantId === previewTenantId && cachedTenant) {
          setTenant(cachedTenant);
          setLoading(false);
          return;
        }

        if (previewTenantId) {
          try {
            const { data, error: fetchError } = await supabase
              .rpc('get_tenant_by_id', { tenant_id_param: previewTenantId })
              .maybeSingle();

            if (!fetchError && data) {
              cachedTenant = data;
              cachedTenantId = data.id;
              setTenant(data);
              supabaseTenant.setTenantId(data.id);
              setLoading(false);
              return;
            }
            // Se o tenant preview não existe, limpa
            localStorage.removeItem(PREVIEW_TENANT_KEY);
          } catch (err) {
            console.error('Erro ao carregar preview tenant:', err);
          }
        }
        
        // Super admin sem preview - carrega primeiro tenant disponível
        const { data: tenants } = await supabase.rpc('list_active_tenants_basic');
        if (tenants && tenants.length > 0) {
          const firstTenant = tenants[0];
          localStorage.setItem(PREVIEW_TENANT_KEY, firstTenant.id);
          cachedTenant = firstTenant;
          cachedTenantId = firstTenant.id;
          setTenant(firstTenant);
          supabaseTenant.setTenantId(firstTenant.id);
        }
        setLoading(false);
        return;
      }

      // Usuário normal - usa tenant do profile
      if (!profile.tenant_id) {
        setError('Usuário não está associado a nenhuma empresa');
        cachedTenant = null;
        cachedTenantId = null;
        setTenant(null);
        setLoading(false);
        return;
      }

      // Se já buscou esse tenant, usar cache
      if (cachedTenantId === profile.tenant_id && cachedTenant) {
        setTenant(cachedTenant);
        supabaseTenant.setTenantId(cachedTenant.id);
        setLoading(false);
        return;
      }

      // Evitar fetch duplicado
      if (fetchedRef.current && cachedTenantId === profile.tenant_id) {
        return;
      }

      fetchedRef.current = true;

      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .rpc('get_tenant_by_id', { tenant_id_param: profile.tenant_id })
          .maybeSingle();

        if (fetchError || !data) {
          console.error('Erro ao buscar tenant:', fetchError);
          setError('Empresa não encontrada ou inativa');
          setTenant(null);
          return;
        }

        // Atualiza cache
        cachedTenant = data;
        cachedTenantId = profile.tenant_id;
        setTenant(data);
        supabaseTenant.setTenantId(data.id);
      } catch (err) {
        console.error('Erro ao carregar tenant:', err);
        setError('Erro ao carregar dados da empresa');
        setTenant(null);
      } finally {
        setLoading(false);
      }
    }

    loadTenant();
  }, [profile?.tenant_id, profile?.role, authLoading]);

  return {
    tenant,
    loading: loading || authLoading,
    error,
    isValidSubdomain: !!tenant || profile?.role === 'super_admin',
  };
}
