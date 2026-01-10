import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CustomShippingOption {
  id: string;
  name: string;
  company: string;
  price: string;
  delivery_time: string;
  custom_price: string;
}

/**
 * Hook para buscar opções de frete customizadas de um tenant
 */
export function useCustomShippingOptions(tenantId: string | null) {
  const [customOptions, setCustomOptions] = useState<CustomShippingOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomOptions = useCallback(async () => {
    if (!tenantId) {
      setCustomOptions([]);
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('custom_shipping_options' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (fetchError) {
        console.error('Erro ao buscar opções de frete customizadas:', fetchError);
        setError(fetchError.message);
        setCustomOptions([]);
        return [];
      }

      if (data && data.length > 0) {
        const options: CustomShippingOption[] = data.map((opt: any, index: number) => ({
          id: `custom_${opt.id}`,
          name: opt.name,
          company: opt.delivery_days === 0 ? 'Retirada' : 'Envio',
          price: parseFloat(opt.price).toFixed(2),
          delivery_time: opt.delivery_days === 0 
            ? 'Imediato' 
            : `${opt.delivery_days} dias para postagem + 5-10 dias úteis`,
          custom_price: parseFloat(opt.price).toFixed(2)
        }));

        console.log('📦 Opções de frete customizadas carregadas:', options);
        setCustomOptions(options);
        return options;
      }

      setCustomOptions([]);
      return [];
    } catch (err: any) {
      console.error('Erro ao buscar opções de frete:', err);
      setError(err.message);
      setCustomOptions([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchCustomOptions();
  }, [fetchCustomOptions]);

  return {
    customOptions,
    loading,
    error,
    refetch: fetchCustomOptions
  };
}

/**
 * Função standalone para buscar opções de frete customizadas (para uso fora de componentes React)
 */
export async function fetchCustomShippingOptions(tenantId: string): Promise<CustomShippingOption[]> {
  if (!tenantId) return [];

  try {
    const { data, error } = await supabase
      .from('custom_shipping_options' as any)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erro ao buscar opções de frete customizadas:', error);
      return [];
    }

    if (data && data.length > 0) {
      return data.map((opt: any) => ({
        id: `custom_${opt.id}`,
        name: opt.name,
        company: opt.delivery_days === 0 ? 'Retirada' : 'Envio',
        price: parseFloat(opt.price).toFixed(2),
        delivery_time: opt.delivery_days === 0 
          ? 'Imediato' 
          : `${opt.delivery_days} dias para postagem + 5-10 dias úteis`,
        custom_price: parseFloat(opt.price).toFixed(2)
      }));
    }

    return [];
  } catch (err) {
    console.error('Erro ao buscar opções de frete:', err);
    return [];
  }
}

/**
 * Opção padrão de frete (retirada grátis) quando não há opções customizadas
 */
export const DEFAULT_SHIPPING_OPTION: CustomShippingOption = {
  id: 'retirada',
  name: 'Retirada - Retirar na Fábrica',
  company: 'Retirada',
  price: '0.00',
  delivery_time: 'Imediato',
  custom_price: '0.00'
};
