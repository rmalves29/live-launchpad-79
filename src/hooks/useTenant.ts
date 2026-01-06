/**
 * Hook para obter tenant do usuário logado
 * - Super admin: pode usar preview tenant do localStorage
 * - Tenant admin/staff: usa tenant do profile automaticamente
 * 
 * IMPORTANTE: Cada usuário deve ver APENAS os dados da sua própria tenant
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

// Cache por usuário - key = user_id, value = { tenantId, tenant }
const userTenantCache: Map<string, { tenantId: string; tenant: Tenant }> = new Map();

export function useTenant() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    async function loadTenant() {
      // Se ainda está carregando auth, aguarda
      if (authLoading) {
        return;
      }

      // Se não tem perfil ou usuário, não está logado
      if (!profile || !user) {
        setTenant(null);
        setLoading(false);
        supabaseTenant.setTenantId(null);
        return;
      }

      const userId = user.id;

      // Super admin pode usar preview tenant
      if (profile.role === 'super_admin') {
        const previewTenantId = localStorage.getItem(PREVIEW_TENANT_KEY);
        
        // Se já temos cache para este usuário e tenant, usar
        const cached = userTenantCache.get(userId);
        if (previewTenantId && cached?.tenantId === previewTenantId) {
          setTenant(cached.tenant);
          supabaseTenant.setTenantId(cached.tenantId);
          setLoading(false);
          return;
        }

        if (previewTenantId) {
          try {
            const { data, error: fetchError } = await supabase
              .rpc('get_tenant_by_id', { tenant_id_param: previewTenantId })
              .maybeSingle();

            if (!fetchError && data) {
              userTenantCache.set(userId, { tenantId: data.id, tenant: data });
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
          userTenantCache.set(userId, { tenantId: firstTenant.id, tenant: firstTenant });
          setTenant(firstTenant);
          supabaseTenant.setTenantId(firstTenant.id);
        }
        setLoading(false);
        return;
      }

      // =========================================
      // USUÁRIO NORMAL - DEVE VER APENAS SUA TENANT
      // =========================================
      
      // Limpar qualquer preview tenant do localStorage (segurança)
      localStorage.removeItem(PREVIEW_TENANT_KEY);
      
      if (!profile.tenant_id) {
        setError('Usuário não está associado a nenhuma empresa');
        setTenant(null);
        supabaseTenant.setTenantId(null);
        setLoading(false);
        return;
      }

      // Verificar cache específico deste usuário
      const cached = userTenantCache.get(userId);
      if (cached?.tenantId === profile.tenant_id) {
        setTenant(cached.tenant);
        supabaseTenant.setTenantId(cached.tenantId);
        setLoading(false);
        return;
      }

      // Evitar fetch duplicado para o mesmo profile.tenant_id
      if (fetchedRef.current === profile.tenant_id) {
        return;
      }

      fetchedRef.current = profile.tenant_id;

      try {
        setLoading(true);
        setError(null);

        console.log('🔐 Carregando tenant para usuário:', userId, 'tenant_id:', profile.tenant_id);

        const { data, error: fetchError } = await supabase
          .rpc('get_tenant_by_id', { tenant_id_param: profile.tenant_id })
          .maybeSingle();

        if (fetchError || !data) {
          console.error('Erro ao buscar tenant:', fetchError);
          setError('Empresa não encontrada ou inativa');
          setTenant(null);
          supabaseTenant.setTenantId(null);
          return;
        }

        // Atualiza cache por usuário
        userTenantCache.set(userId, { tenantId: profile.tenant_id, tenant: data });
        setTenant(data);
        supabaseTenant.setTenantId(data.id);
        
        console.log('✅ Tenant carregado:', data.name, '(id:', data.id, ')');
      } catch (err) {
        console.error('Erro ao carregar tenant:', err);
        setError('Erro ao carregar dados da empresa');
        setTenant(null);
        supabaseTenant.setTenantId(null);
      } finally {
        setLoading(false);
      }
    }

    loadTenant();
  }, [user?.id, profile?.tenant_id, profile?.role, authLoading]);

  return {
    tenant,
    loading: loading || authLoading,
    error,
    isValidSubdomain: !!tenant || profile?.role === 'super_admin',
  };
}
