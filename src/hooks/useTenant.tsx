import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  enable_live?: boolean;
  enable_sendflow?: boolean;
  max_whatsapp_groups?: number | null;
}

interface UseTenantReturn {
  tenant: Tenant | null;
  loading: boolean;
  error: string | null;
  isValidSubdomain: boolean;
 }
 
 const PREVIEW_TENANT_KEY = 'previewTenantId';
 
 /**
  * Hook para detectar e carregar tenant baseado no subdomínio
 * Hook para detectar e carregar tenant baseado no subdomínio
 * 
 * Exemplos:
 * - empresa1.meusite.com -> slug: "empresa1"
 * - www.meusite.com -> slug: null (site principal)
 * - localhost:3000 -> slug: null (desenvolvimento)
 */
export const useTenant = (): UseTenantReturn => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isValidSubdomain, setIsValidSubdomain] = useState(false);

  useEffect(() => {
    const detectTenantFromSubdomain = async () => {
      try {
        setLoading(true);
        setError(null);

        // Detectar subdomínio
        const hostname = window.location.hostname;
        console.log('🔍 Detectando tenant do hostname:', hostname);

        // Lógica para extrair slug do subdomínio
        let slug: string | null = null;

        const isDevHost = hostname === 'localhost' || hostname === '127.0.0.1';
        const isLovablePreview =
          hostname.endsWith('.sandbox.lovable.dev') ||
          hostname.endsWith('.lovable.dev') ||
          hostname.endsWith('.lovable.app') ||
          hostname.endsWith('.lovableproject.com');

        if (isDevHost || isLovablePreview) {
          // Ambiente de desenvolvimento/preview
          const previewTenantId = localStorage.getItem(PREVIEW_TENANT_KEY);
          if (previewTenantId) {
            console.log('🧪 Preview - usando tenant selecionado:', previewTenantId);
            const { data: previewTenant, error: previewErr } = await supabase
              .rpc('get_tenant_by_id', { tenant_id_param: previewTenantId })
              .maybeSingle();

            if (!previewErr && previewTenant) {
              setTenant(previewTenant);
              setIsValidSubdomain(true);
              return;
            }

            console.warn('Preview tenant inválido ou não encontrado:', previewErr);
          }

          console.log(isLovablePreview ? '🧪 Preview Lovable - sem tenant' : '🏠 Modo desenvolvimento - sem tenant');
          setIsValidSubdomain(true);
          setTenant(null);
          return;
        }

        // Verificar se é um subdomínio
        const parts = hostname.split('.');
        if (parts.length >= 3) {
          // exemplo: empresa1.meusite.com -> empresa1
          slug = parts[0];
          
          // Filtrar subdomínios reservados
          const reservedSubdomains = ['www', 'api', 'admin', 'mail', 'ftp'];
          if (reservedSubdomains.includes(slug)) {
            slug = null;
          }
        }

        if (!slug) {
          console.log('🏢 Site principal - sem tenant específico');
          setIsValidSubdomain(true);
          setTenant(null);
          return;
        }

        console.log('🔎 Buscando tenant com slug:', slug);

        // Buscar tenant usando função segura (apenas dados básicos, sem informações sensíveis)
        const { data: tenantData, error: tenantError } = await supabase
          .rpc('get_tenant_by_slug', { slug_param: slug })
          .maybeSingle();

        if (tenantError) {
          console.error('❌ Erro ao buscar tenant:', tenantError);
          setError(`Erro ao carregar dados da empresa: ${tenantError.message}`);
          setIsValidSubdomain(false);
          return;
        }

        if (!tenantData) {
          console.warn('⚠️ Tenant não encontrado para slug:', slug);
          setError(`Empresa "${slug}" não encontrada ou inativa`);
          setIsValidSubdomain(false);
          return;
        }

        console.log('✅ Tenant encontrado:', tenantData.name);
        setTenant(tenantData);
        setIsValidSubdomain(true);

      } catch (err) {
        console.error('💥 Erro na detecção de tenant:', err);
        setError('Erro interno na detecção da empresa');
        setIsValidSubdomain(false);
      } finally {
        setLoading(false);
      }
    };

    detectTenantFromSubdomain();
  }, []);

  return { tenant, loading, error, isValidSubdomain };
};