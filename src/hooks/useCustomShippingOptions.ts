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
          delivery_time: opt.description 
            ? opt.description
            : opt.delivery_days === 0 
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
 * Filtra opções de frete customizadas com base na cobertura geográfica
 */
function filterByGeographicCoverage(options: any[], customerState?: string, customerCity?: string): any[] {
  if (!customerState) return options; // Sem estado, retorna todas (será refiltrado depois)

  const CAPITAIS: Record<string, string[]> = {
    AC: ['Rio Branco'], AL: ['Maceió'], AM: ['Manaus'], AP: ['Macapá'],
    BA: ['Salvador'], CE: ['Fortaleza'], DF: ['Brasília'], ES: ['Vitória'],
    GO: ['Goiânia'], MA: ['São Luís'], MG: ['Belo Horizonte'], MS: ['Campo Grande'],
    MT: ['Cuiabá', 'Várzea Grande'], PA: ['Belém'], PB: ['João Pessoa'],
    PE: ['Recife'], PI: ['Teresina'], PR: ['Curitiba'], RJ: ['Rio de Janeiro'],
    RN: ['Natal'], RO: ['Porto Velho'], RR: ['Boa Vista'], RS: ['Porto Alegre'],
    SC: ['Florianópolis'], SE: ['Aracaju'], SP: ['São Paulo'], TO: ['Palmas']
  };

  return options.filter((opt: any) => {
    const coverageType = opt.coverage_type || 'national';

    switch (coverageType) {
      case 'national':
        return true;

      case 'states':
        const allowedStates: string[] = opt.coverage_states || [];
        return allowedStates.includes(customerState);

      case 'city':
        const targetCity = (opt.coverage_city || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const custCity = (customerCity || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const targetState = opt.coverage_state || '';
        return custCity === targetCity && customerState === targetState;

      case 'capital':
        const capitalState = opt.coverage_state || '';
        const capitals = CAPITAIS[capitalState] || [];
        const normalizedCustCity = (customerCity || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return customerState === capitalState && capitals.some(c =>
          c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normalizedCustCity
        );

      case 'interior':
        const interiorState = opt.coverage_state || '';
        const interiorCapitals = CAPITAIS[interiorState] || [];
        const normCity = (customerCity || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const isCapital = interiorCapitals.some(c =>
          c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === normCity
        );
        return customerState === interiorState && !isCapital;

      default:
        return true;
    }
  });
}

/**
 * Função standalone para buscar opções de frete customizadas (para uso fora de componentes React)
 * Aceita estado e cidade do cliente para filtrar por cobertura geográfica,
 * e cartTotal para filtrar frete grátis por valor mínimo de pedido.
 */
export async function fetchCustomShippingOptions(
  tenantId: string,
  customerState?: string,
  customerCity?: string,
  cartTotal?: number
): Promise<CustomShippingOption[]> {
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
      // Filtrar por cobertura geográfica
      let filtered = filterByGeographicCoverage(data, customerState, customerCity);

      // Filtrar frete grátis por valor mínimo de pedido
      if (cartTotal !== undefined) {
        filtered = filtered.filter((opt: any) => {
          const minOrder = opt.free_shipping_min_order != null ? Number(opt.free_shipping_min_order) : null;
          if (minOrder !== null && cartTotal < minOrder) return false;
          return true;
        });
      }

      console.log(`📦 Frete customizado: ${data.length} total, ${filtered.length} após filtros (estado: ${customerState}, cidade: ${customerCity}, total: ${cartTotal})`);

      return filtered.map((opt: any) => ({
        id: `custom_${opt.id}`,
        name: opt.name,
        company: opt.delivery_days === 0 ? 'Retirada' : 'Envio',
        price: parseFloat(opt.price).toFixed(2),
        delivery_time: opt.description
          ? opt.description
          : opt.delivery_days === 0
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
