import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeForStorage } from '@/lib/phone-utils';

export interface MergeableOrder {
  id: number;
  created_at: string;
  total_amount: number;
}

export interface OrderMergeResult {
  hasPaidOrderWithinPeriod: boolean;
  mergeableOrders: MergeableOrder[];
  orderMergeDays: number;
  loading: boolean;
  error: string | null;
}

/**
 * Hook para verificar se o cliente tem pedidos PAGOS recentes que permitem juntar frete
 * 
 * @param tenantId - ID do tenant
 * @param customerPhone - Telefone do cliente (normalizado internamente)
 * @returns Resultado da verificação de pedidos para merge
 */
export function useOrderMerge(
  tenantId: string | null,
  customerPhone: string | null
): OrderMergeResult {
  const [hasPaidOrderWithinPeriod, setHasPaidOrderWithinPeriod] = useState(false);
  const [mergeableOrders, setMergeableOrders] = useState<MergeableOrder[]>([]);
  const [orderMergeDays, setOrderMergeDays] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkMergeableOrders = useCallback(async () => {
    if (!tenantId || !customerPhone) {
      setHasPaidOrderWithinPeriod(false);
      setMergeableOrders([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Buscar configuração order_merge_days do tenant
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .select('order_merge_days')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantError) {
        console.error('Erro ao buscar configuração do tenant:', tenantError);
        throw tenantError;
      }

      const mergeDays = (tenantData as any)?.order_merge_days ?? 0;
      setOrderMergeDays(mergeDays);

      // Se merge está desabilitado (0 dias), não há pedidos para juntar
      if (mergeDays <= 0) {
        setHasPaidOrderWithinPeriod(false);
        setMergeableOrders([]);
        return;
      }

      // Calcular data limite (X dias atrás)
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - mergeDays);
      const limitDateISO = limitDate.toISOString();

      const normalizedPhone = normalizeForStorage(customerPhone);

      // Buscar pedidos PAGOS do cliente dentro do período
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, created_at, total_amount, customer_phone')
        .eq('tenant_id', tenantId)
        .eq('is_paid', true)
        .eq('is_cancelled', false)
        .gte('created_at', limitDateISO)
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.error('Erro ao buscar pedidos pagos:', ordersError);
        throw ordersError;
      }

      // Filtrar pedidos que correspondem ao telefone normalizado
      const matchingOrders = (orders || []).filter(order => {
        const orderPhone = normalizeForStorage(order.customer_phone);
        return orderPhone === normalizedPhone;
      });

      if (matchingOrders.length > 0) {
        setHasPaidOrderWithinPeriod(true);
        setMergeableOrders(matchingOrders.map(o => ({
          id: o.id,
          created_at: o.created_at,
          total_amount: o.total_amount
        })));
        console.log(`✅ Cliente tem ${matchingOrders.length} pedido(s) pago(s) nos últimos ${mergeDays} dias - frete grátis disponível`);
      } else {
        setHasPaidOrderWithinPeriod(false);
        setMergeableOrders([]);
        console.log(`ℹ️ Nenhum pedido pago nos últimos ${mergeDays} dias para este cliente`);
      }
    } catch (err: any) {
      console.error('Erro ao verificar pedidos para merge:', err);
      setError(err.message);
      setHasPaidOrderWithinPeriod(false);
      setMergeableOrders([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, customerPhone]);

  useEffect(() => {
    checkMergeableOrders();
  }, [checkMergeableOrders]);

  return {
    hasPaidOrderWithinPeriod,
    mergeableOrders,
    orderMergeDays,
    loading,
    error
  };
}

/**
 * Opção de frete grátis para juntar com pedido anterior (pago)
 */
export const MERGE_ORDER_SHIPPING_OPTION = {
  id: 'merge_order',
  name: 'Juntar com pedido anterior',
  company: 'Frete Grátis',
  price: '0.00',
  delivery_time: 'Mesmo envio do pedido anterior',
  custom_price: '0.00',
  isMergeOption: true
};
