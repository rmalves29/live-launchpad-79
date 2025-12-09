/**
 * Hook para buscar tenant por slug
 * Usado no sistema de path-based routing
 * Ex: /loja-da-maria => busca tenant com slug "loja-da-maria"
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  whatsapp_number: string | null;
  email: string | null;
  description: string | null;
  is_active: boolean;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export function useTenantBySlug(slug: string | undefined) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTenant() {
      if (!slug) {
        setTenant(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('tenants')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .single();

        if (fetchError) {
          if (fetchError.code === 'PGRST116') {
            setError('Loja não encontrada');
          } else {
            setError(fetchError.message);
          }
          setTenant(null);
          return;
        }

        setTenant(data);
      } catch (err) {
        console.error('Erro ao buscar tenant por slug:', err);
        setError('Erro ao carregar loja');
        setTenant(null);
      } finally {
        setLoading(false);
      }
    }

    loadTenant();
  }, [slug]);

  return { tenant, loading, error };
}
