import { useState } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';

interface AppliedCoupon {
  id: number;
  code: string;
  discount_type: 'percentage' | 'fixed' | 'progressive';
  discount_value: number;
  progressive_tiers?: Array<{min_value: number, max_value: number | null, discount: number}>;
  used_count: number;
  type: 'coupon';
}

interface AppliedGift {
  id: number;
  code: string;
  name: string;
  description?: string;
  minimum_purchase_amount: number;
  type: 'gift';
}

export type AppliedCodeType = AppliedCoupon | AppliedGift | null;

export const useCouponOrGift = (tenantId?: string) => {
  const { toast } = useToast();
  const [couponCode, setCouponCode] = useState('');
  const [appliedCode, setAppliedCode] = useState<AppliedCodeType>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);

  const applyCode = async (productsTotal: number) => {
    if (!couponCode.trim()) {
      toast({
        title: 'Erro',
        description: 'Digite um código de cupom ou presente',
        variant: 'destructive'
      });
      return;
    }

    setLoadingCode(true);
    try {
      const codeToSearch = couponCode.toUpperCase().trim();

      // Primeiro, tentar buscar como cupom de desconto (filtrado por tenant se houver)
      const { data: coupon, error: couponError } = await supabaseTenant
        .from('coupons')
        .select('*')
        .eq('code', codeToSearch)
        .eq('is_active', true)
        .maybeSingle();

      if (couponError && !couponError.message?.includes('tenant_id')) {
        throw couponError;
      }

      if (coupon) {
        // Verificar expiração
        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
          toast({
            title: 'Cupom Expirado',
            description: 'Este cupom já expirou',
            variant: 'destructive'
          });
          return;
        }

        // Verificar limite de uso
        if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
          toast({
            title: 'Cupom Esgotado',
            description: 'Este cupom atingiu o limite de uso',
            variant: 'destructive'
          });
          return;
        }

        // Calcular desconto baseado no tipo
        let discount = 0;
        if (coupon.discount_type === 'progressive') {
          const tiers = coupon.progressive_tiers as Array<{min_value: number, max_value: number | null, discount: number}>;
          const applicableTier = tiers?.find(tier => {
            if (tier.max_value === null) return productsTotal >= tier.min_value;
            return productsTotal >= tier.min_value && productsTotal <= tier.max_value;
          });
          if (applicableTier) discount = (productsTotal * applicableTier.discount) / 100;
        } else if (coupon.discount_type === 'percentage') {
          discount = (productsTotal * coupon.discount_value) / 100;
        } else if (coupon.discount_type === 'fixed') {
          discount = Math.min(coupon.discount_value, productsTotal);
        }

        setAppliedCode({
          ...coupon,
          type: 'coupon'
        } as AppliedCoupon);
        setCouponDiscount(discount);

        toast({
          title: 'Cupom Aplicado!',
          description: `Desconto de ${formatCurrency(discount)} aplicado`,
        });
        return;
      }

      // Se não encontrou cupom, tentar buscar como brinde pelo nome/código (filtrado por tenant)
      const { data: gifts, error: giftError } = await supabaseTenant
        .from('gifts')
        .select('*')
        .eq('is_active', true);

      if (giftError && !giftError.message?.includes('tenant_id')) {
        throw giftError;
      }

      // Buscar brinde pelo nome (comparação case insensitive)
      const gift = gifts?.find(g => 
        g.name.toUpperCase().replace(/\s+/g, '') === codeToSearch.replace(/\s+/g, '') ||
        g.name.toUpperCase() === codeToSearch
      );

      if (gift) {
        // Verificar se o cliente atingiu o valor mínimo
        if (productsTotal < gift.minimum_purchase_amount) {
          toast({
            title: 'Valor Mínimo não Atingido',
            description: `Para ganhar "${gift.name}", você precisa de ${formatCurrency(gift.minimum_purchase_amount)} em compras. Faltam ${formatCurrency(gift.minimum_purchase_amount - productsTotal)}`,
            variant: 'destructive'
          });
          return;
        }

        setAppliedCode({
          ...gift,
          code: gift.name.toUpperCase(),
          type: 'gift'
        } as AppliedGift);
        setCouponDiscount(0); // Brindes não dão desconto monetário

        toast({
          title: 'Brinde Aplicado! 🎁',
          description: `Você ganhou: ${gift.name}`,
        });
        return;
      }

      // Não encontrou nem cupom nem brinde
      toast({
        title: 'Código Inválido',
        description: 'Cupom ou brinde não encontrado',
        variant: 'destructive'
      });

    } catch (error: any) {
      console.error('Erro ao aplicar código:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao aplicar código',
        variant: 'destructive'
      });
    } finally {
      setLoadingCode(false);
    }
  };

  const removeCode = () => {
    setAppliedCode(null);
    setCouponDiscount(0);
    setCouponCode('');
    toast({
      title: 'Código Removido',
      description: 'O cupom ou brinde foi removido',
    });
  };

  const updateCouponUsage = async () => {
    if (appliedCode?.type === 'coupon') {
      const coupon = appliedCode as AppliedCoupon;
      await supabaseTenant
        .from('coupons')
        .update({ used_count: coupon.used_count + 1 })
        .eq('id', coupon.id);
    }
  };

  return {
    couponCode,
    setCouponCode,
    appliedCode,
    setAppliedCode,
    loadingCode,
    couponDiscount,
    setCouponDiscount,
    applyCode,
    removeCode,
    updateCouponUsage,
  };
};