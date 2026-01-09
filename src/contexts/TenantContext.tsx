import { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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

interface TenantContextType {
  tenant: Tenant | null;
  loading: boolean;
  error: string | null;
  isValidSubdomain: boolean;
  tenantId: string | null;
  tenantSlug: string | null;
  isMainSite: boolean;
}

export const TenantContext = createContext<TenantContextType | undefined>(undefined);

interface TenantProviderProps {
  children: ReactNode;
}

const PREVIEW_TENANT_KEY = 'previewTenantId';

export const TenantProvider = ({ children }: TenantProviderProps) => {
  const { user, profile, isLoading: authLoading } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTenant() {
      // Aguarda auth carregar
      if (authLoading) {
        return;
      }

      // Se não tem profile ou user, não está logado
      if (!profile || !user) {
        setTenant(null);
        supabaseTenant.setTenantId(null);
        setLoading(false);
        return;
      }

      // =========================================
      // USUÁRIO NORMAL - DEVE VER APENAS SUA TENANT
      // Verificar PRIMEIRO se NÃO é super_admin
      // =========================================
      if (profile.role !== 'super_admin') {
        // Limpar qualquer preview tenant do localStorage (segurança absoluta)
        localStorage.removeItem(PREVIEW_TENANT_KEY);

        if (!profile.tenant_id) {
          setError('Usuário não está associado a nenhuma empresa');
          setTenant(null);
          supabaseTenant.setTenantId(null);
          setLoading(false);
          return;
        }

        try {
          console.log('🔐 [TenantContext] Carregando tenant para usuário normal:', user.id, 'tenant_id:', profile.tenant_id);
          
          const { data, error: fetchError } = await supabase
            .rpc('get_tenant_by_id', { tenant_id_param: profile.tenant_id })
            .maybeSingle();

          if (fetchError || !data) {
            setError('Empresa não encontrada ou inativa');
            setTenant(null);
            supabaseTenant.setTenantId(null);
          } else {
            console.log('✅ [TenantContext] Tenant carregado para usuário normal:', data.name, '(id:', data.id, ')');
            setTenant(data);
            supabaseTenant.setTenantId(data.id);
          }
        } catch (err) {
          console.error('Erro ao carregar tenant:', err);
          setError('Erro ao carregar dados da empresa');
          supabaseTenant.setTenantId(null);
        } finally {
          setLoading(false);
        }
        return;
      }

      // =========================================
      // SUPER ADMIN - pode usar preview tenant
      // =========================================
      const previewTenantId = localStorage.getItem(PREVIEW_TENANT_KEY);
      
      if (previewTenantId) {
        try {
          const { data, error: fetchError } = await supabase
            .rpc('get_tenant_by_id', { tenant_id_param: previewTenantId })
            .maybeSingle();

          if (!fetchError && data) {
            console.log('👁️ [TenantContext] Super admin usando preview tenant:', data.name, '(id:', data.id, ')');
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
        console.log('👁️ [TenantContext] Super admin carregou primeiro tenant:', firstTenant.name);
        setTenant(firstTenant);
        supabaseTenant.setTenantId(firstTenant.id);
      }
      setLoading(false);
    }

    loadTenant();
  }, [user?.id, profile?.tenant_id, profile?.role, authLoading]);

  const tenantId = tenant?.id || null;
  const tenantSlug = tenant?.slug || null;

  const value: TenantContextType = {
    tenant,
    loading: loading || authLoading,
    error,
    isValidSubdomain: !!tenant || profile?.role === 'super_admin',
    tenantId,
    tenantSlug,
    isMainSite: profile?.role === 'super_admin',
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenantContext = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenantContext deve ser usado dentro de um TenantProvider');
  }
  return context;
};