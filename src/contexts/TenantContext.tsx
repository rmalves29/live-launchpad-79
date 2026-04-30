import { createContext, useContext, ReactNode, useEffect, useState, useRef } from 'react';
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

// Cache global para evitar re-fetch ao trocar de aba
const tenantCache = new Map<string, Tenant>();

export const TenantProvider = ({ children }: TenantProviderProps) => {
  const { user, profile, isLoading: authLoading } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Refs para evitar re-fetch desnecessário
  const lastUserId = useRef<string | null>(null);
  const lastTenantId = useRef<string | null>(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    async function loadTenant() {
      // Aguarda auth carregar
      if (authLoading) {
        return;
      }

      // Se não tem profile ou user, não está logado
      if (!profile || !user) {
        // Só limpa se realmente deslogou (tinha user antes)
        if (lastUserId.current && !user) {
          setTenant(null);
          supabaseTenant.setTenantId(null);
          lastUserId.current = null;
          lastTenantId.current = null;
        }
        setLoading(false);
        return;
      }

      // OTIMIZAÇÃO: Se já temos o tenant correto carregado, não recarrega
      const targetTenantId = profile.role === 'super_admin' 
        ? localStorage.getItem(PREVIEW_TENANT_KEY) || null
        : profile.tenant_id;

      if (
        isInitialized.current &&
        lastUserId.current === user.id &&
        lastTenantId.current === targetTenantId &&
        tenant
      ) {
        // Já temos o tenant correto, não precisa recarregar
        setLoading(false);
        return;
      }

      // =========================================
      // USUÁRIO NORMAL - DEVE VER APENAS SUA TENANT
      // =========================================
      if (profile.role !== 'super_admin') {
        localStorage.removeItem(PREVIEW_TENANT_KEY);

        if (!profile.tenant_id) {
          setError('Usuário não está associado a nenhuma empresa');
          setTenant(null);
          supabaseTenant.setTenantId(null);
          setLoading(false);
          return;
        }

        // Verificar cache primeiro
        const cachedTenant = tenantCache.get(profile.tenant_id);
        if (cachedTenant) {
          console.log('✅ [TenantContext] Usando tenant do cache:', cachedTenant.name);
          setTenant(cachedTenant);
          supabaseTenant.setTenantId(cachedTenant.id);
          lastUserId.current = user.id;
          lastTenantId.current = profile.tenant_id;
          isInitialized.current = true;
          setLoading(false);
          return;
        }

        try {
          console.log('🔐 [TenantContext] Carregando tenant para usuário normal:', user.id);
          
          const { data, error: fetchError } = await supabase
            .rpc('get_tenant_by_id', { tenant_id_param: profile.tenant_id })
            .maybeSingle();

          if (fetchError || !data) {
            setError('Empresa não encontrada ou inativa');
            setTenant(null);
            supabaseTenant.setTenantId(null);
          } else {
            console.log('✅ [TenantContext] Tenant carregado:', data.name);
            tenantCache.set(data.id, data);
            setTenant(data);
            supabaseTenant.setTenantId(data.id);
            lastUserId.current = user.id;
            lastTenantId.current = data.id;
            isInitialized.current = true;
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
        // Verificar cache primeiro
        const cachedTenant = tenantCache.get(previewTenantId);
        if (cachedTenant) {
          console.log('👁️ [TenantContext] Super admin usando tenant do cache:', cachedTenant.name);
          setTenant(cachedTenant);
          supabaseTenant.setTenantId(cachedTenant.id);
          lastUserId.current = user.id;
          lastTenantId.current = previewTenantId;
          isInitialized.current = true;
          setLoading(false);
          return;
        }

        try {
          const { data, error: fetchError } = await supabase
            .rpc('get_tenant_by_id', { tenant_id_param: previewTenantId })
            .maybeSingle();

          if (!fetchError && data) {
            console.log('👁️ [TenantContext] Super admin usando preview tenant:', data.name);
            tenantCache.set(data.id, data);
            setTenant(data);
            supabaseTenant.setTenantId(data.id);
            lastUserId.current = user.id;
            lastTenantId.current = data.id;
            isInitialized.current = true;
            setLoading(false);
            return;
          }
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
        tenantCache.set(firstTenant.id, firstTenant);
        console.log('👁️ [TenantContext] Super admin carregou primeiro tenant:', firstTenant.name);
        setTenant(firstTenant);
        supabaseTenant.setTenantId(firstTenant.id);
        lastUserId.current = user.id;
        lastTenantId.current = firstTenant.id;
        isInitialized.current = true;
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