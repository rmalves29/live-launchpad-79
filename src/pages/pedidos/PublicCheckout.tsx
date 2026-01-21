import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, User, MapPin, Search, ShoppingCart, Package, Store, Phone, AlertTriangle, Truck, CreditCard, Percent, Gift, Eye, History, CheckCircle2, Ban, Merge } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneForDisplay, normalizeForStorage } from '@/lib/phone-utils';
import { formatBrasiliaDate, formatBrasiliaDateLong } from '@/lib/date-utils';
import { formatCurrency, formatCPF } from '@/lib/utils';
import { ZoomableImage } from '@/components/ui/zoomable-image';
import { fetchCustomShippingOptions, DEFAULT_SHIPPING_OPTION, CustomShippingOption } from '@/hooks/useCustomShippingOptions';
import { useOrderMerge, MERGE_ORDER_SHIPPING_OPTION } from '@/hooks/useOrderMerge';
import { getActiveShippingIntegration } from '@/lib/shipping-utils';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  phone: string | null;
}

interface OrderItem {
  id: number;
  product_name: string;
  product_code: string;
  qty: number;
  unit_price: number;
  image_url?: string;
  color?: string;
  size?: string;
}

interface Order {
  id: number;
  customer_phone: string;
  customer_name: string | null;
  event_type: string;
  event_date: string;
  total_amount: number;
  is_paid: boolean;
  is_cancelled?: boolean;
  payment_link: string | null;
  cart_id: number | null;
  items: OrderItem[];
}

const PublicCheckout = () => {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [tenantError, setTenantError] = useState<string | null>(null);
  
  const [phone, setPhone] = useState('');
  const [historyPhone, setHistoryPhone] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [cpfError, setCpfError] = useState(false);
  
  // Histórico de pedidos pagos
  const [paidOrders, setPaidOrders] = useState<Order[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<Order | null>(null);
  const [historySearched, setHistorySearched] = useState(false);
  
  const [customerData, setCustomerData] = useState({
    name: '',
    email: '',
    cpf: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: ''
  });

  // Frete
  const [shippingOptions, setShippingOptions] = useState<any[]>([]);
  const [selectedShipping, setSelectedShipping] = useState('retirada');
  const [selectedShippingData, setSelectedShippingData] = useState<any>(null);
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [handlingDays, setHandlingDays] = useState<number>(3);

  // Pagamento
  const [loadingPayment, setLoadingPayment] = useState(false);

  // Cupom
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [loadingCoupon, setLoadingCoupon] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);

  // Brindes
  const [activeGifts, setActiveGifts] = useState<any[]>([]);
  const [eligibleGift, setEligibleGift] = useState<any>(null);
  const [progressGift, setProgressGift] = useState<any>(null);

  // Hook para verificar pedidos pagos recentes (juntar pedidos)
  const { hasPaidOrderWithinPeriod, mergeableOrders, orderMergeDays } = useOrderMerge(
    tenant?.id || null,
    phone ? normalizeForStorage(phone) : null
  );

  // Carregar tenant pelo slug
  useEffect(() => {
    const loadTenant = async () => {
      if (!slug) {
        setTenantError('Loja não especificada');
        setLoadingTenant(false);
        return;
      }

      try {
        // Buscar diretamente da tabela para obter todos os campos incluindo logo_url
        const { data: tenantData, error } = await supabase
          .from('tenants')
          .select('id, name, slug, logo_url, primary_color, phone, is_active')
          .eq('slug', slug)
          .eq('is_active', true)
          .maybeSingle();

        if (error) throw error;

        if (!tenantData) {
          setTenantError('Loja não encontrada');
        } else {
          setTenant({
            id: tenantData.id,
            name: tenantData.name,
            slug: tenantData.slug,
            logo_url: tenantData.logo_url,
            primary_color: tenantData.primary_color,
            phone: tenantData.phone,
          });
        }
      } catch (error) {
        console.error('Erro ao carregar loja:', error);
        setTenantError('Erro ao carregar dados da loja');
      } finally {
        setLoadingTenant(false);
      }
    };

    loadTenant();
  }, [slug]);

  // Carregar brindes ativos filtrados pelo tenant
  useEffect(() => {
    const loadActiveGifts = async () => {
      if (!tenant?.id) return;
      
      try {
        const { data, error } = await supabase
          .from("gifts")
          .select("*")
          .eq("tenant_id", tenant.id)
          .eq("is_active", true)
          .order("minimum_purchase_amount", { ascending: true });

        if (error) throw error;
        setActiveGifts(data || []);
      } catch (error) {
        console.error("Erro ao carregar brindes:", error);
      }
    };
    loadActiveGifts();
  }, [tenant?.id]);

  // Carregar handling days
  useEffect(() => {
    const loadHandlingDays = async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('handling_days')
          .single();

        if (data?.handling_days) {
          setHandlingDays(data.handling_days);
        }
      } catch (error) {
        console.error('Error loading handling days:', error);
      }
    };
    loadHandlingDays();
  }, []);

  // Calcular brinde elegível quando pedidos selecionados mudam
  const selectedOrders = orders.filter(o => selectedOrderIds.includes(o.id));
  
  useEffect(() => {
    if (activeGifts.length === 0 || selectedOrders.length === 0) return;

    const productsTotal = selectedOrders.reduce((total, order) => {
      return total + order.items.reduce((sum: number, item: any) => {
        return sum + (parseFloat(String(item.unit_price)) * item.qty);
      }, 0);
    }, 0);

    const eligible = activeGifts
      .filter(gift => productsTotal >= gift.minimum_purchase_amount)
      .sort((a, b) => b.minimum_purchase_amount - a.minimum_purchase_amount)[0];

    if (eligible) {
      setEligibleGift(eligible);
      setProgressGift(null);
    } else {
      const nextGift = activeGifts
        .filter(gift => productsTotal < gift.minimum_purchase_amount)
        .sort((a, b) => a.minimum_purchase_amount - b.minimum_purchase_amount)[0];

      if (nextGift) {
        const percentageAchieved = (productsTotal / nextGift.minimum_purchase_amount) * 100;
        setProgressGift({
          ...nextGift,
          percentageAchieved: Math.min(percentageAchieved, 100),
          percentageMissing: Math.max(100 - percentageAchieved, 0)
        });
      } else {
        setProgressGift(null);
      }
      setEligibleGift(null);
    }
  }, [selectedOrderIds, orders, activeGifts]);

  // Adicionar opção de merge quando há pedido pago recente
  useEffect(() => {
    if (hasPaidOrderWithinPeriod && mergeableOrders.length > 0) {
      setShippingOptions(prev => {
        // Verificar se já tem a opção de merge
        if (prev.some(opt => opt.id === 'merge_order')) return prev;
        // Adicionar a opção de merge no início
        console.log(`🎁 Adicionando opção de frete grátis - cliente tem ${mergeableOrders.length} pedido(s) pago(s) nos últimos ${orderMergeDays} dias`);
        return [MERGE_ORDER_SHIPPING_OPTION, ...prev];
      });
    } else {
      setShippingOptions(prev => prev.filter(opt => opt.id !== 'merge_order'));
    }
  }, [hasPaidOrderWithinPeriod, mergeableOrders, orderMergeDays]);

  const formatDeliveryTime = (originalTime: string, companyName: string) => {
    if (companyName === 'Retirada') return originalTime;
    const timeMatch = originalTime.match(/(\d+(?:-\d+)?)/);
    if (timeMatch) {
      return `${handlingDays} dias para postagem + ${timeMatch[1]} dias úteis`;
    }
    return `${handlingDays} dias para postagem + ${originalTime}`;
  };

  const filterShippingOptions = (options: any[], activeProvider: 'melhor_envio' | 'mandae' | null) => {
    return options.filter(option => {
      const companyName = option.company?.toLowerCase() || '';
      const serviceName = option.name?.toLowerCase() || '';
      
      // Allow pickup option
      if (option.id === 'retirada') return true;
      
      // IMPORTANTE: só permitir serviços "Mandae" quando a integração ativa do tenant for Mandae.
      // (No Melhor Envio pode aparecer a transportadora Mandaê, mas isso NÃO significa integração Mandae ativa.)
      const isMandaeService =
        companyName.includes('mandae') ||
        serviceName.includes('econômico') ||
        serviceName.includes('rápido');
      if (isMandaeService) return activeProvider === 'mandae';
      
      // Filter for J&T and Correios services
      return (
        companyName.includes('j&t') ||
        companyName.includes('correios') ||
        serviceName.includes('pac') ||
        serviceName.includes('sedex') ||
        serviceName.includes('j&t')
      );
    });
  };

  const calculateShipping = async (cep: string, ordersToCalc: Order[]) => {
    if (!cep || ordersToCalc.length === 0 || !tenant) return;
    if (cep.replace(/[^0-9]/g, '').length !== 8) return;

    // Buscar opções de frete customizadas do banco de dados
    const customOptions = await fetchCustomShippingOptions(tenant.id);
    
    // Usar opções customizadas do banco ou fallback padrão
    const fallbackShipping = customOptions.length > 0 
      ? customOptions 
      : [DEFAULT_SHIPPING_OPTION];

    setLoadingShipping(true);
    // Preservar opção de merge se existir
    const mergeOption = hasPaidOrderWithinPeriod ? MERGE_ORDER_SHIPPING_OPTION : null;
    setShippingOptions(mergeOption ? [mergeOption, ...fallbackShipping] : fallbackShipping);

    try {
      // Buscar endereço pelo CEP
      const cepResponse = await fetch(`https://viacep.com.br/ws/${cep.replace(/[^0-9]/g, '')}/json/`);
      const cepData = await cepResponse.json();
      
      if (!cepData.erro && cepData.localidade) {
        setCustomerData(prev => ({
          ...prev,
          street: cepData.logradouro || prev.street,
          neighborhood: cepData.bairro || prev.neighborhood,
          city: cepData.localidade || prev.city,
          state: cepData.uf || prev.state
        }));
      }

      // Detectar qual integração de frete está ativa
      const activeIntegration = await getActiveShippingIntegration(tenant.id);
      console.log('[PublicCheckout] Integração de frete ativa:', activeIntegration);

      if (!activeIntegration.provider) {
        console.log('[PublicCheckout] Nenhuma integração de frete ativa, usando apenas opções customizadas');
        return;
      }

      // Se for Melhor Envio, testar token primeiro
      if (activeIntegration.testFunctionName) {
        const tokenTestResponse = await supabase.functions.invoke(activeIntegration.testFunctionName, {
          body: { tenant_id: tenant.id }
        });

        if (tokenTestResponse.error || !tokenTestResponse.data?.valid) {
          console.log('[PublicCheckout] Token inválido, apenas retirada disponível');
          return;
        }
      }

      // Calcular frete com todos os items dos pedidos selecionados
      const allItems = ordersToCalc.flatMap(order => order.items);
      const products = allItems.map(item => ({
        id: String(item.id || Math.random()),
        width: 16,
        height: 2,
        length: 20,
        weight: 0.3,
        insurance_value: Number(item.unit_price) || 1,
        quantity: Number(item.qty) || 1
      }));

      // Chamar a função de frete ativa (mandae-shipping ou melhor-envio-shipping)
      console.log(`[PublicCheckout] Chamando ${activeIntegration.functionName}...`);
      const shippingResponse = await supabase.functions.invoke(activeIntegration.functionName, {
        body: {
          to_postal_code: cep.replace(/[^0-9]/g, ''),
          tenant_id: tenant.id,
          products: products
        }
      });

      if (shippingResponse.error) {
        console.error('[PublicCheckout] Erro na função de frete:', shippingResponse.error);
        throw new Error('Erro ao calcular frete');
      }

      const data = shippingResponse.data;
      if (data?.success && Array.isArray(data.shipping_options)) {
        const validOptions = data.shipping_options
          .filter((option: any) => option && !option.error && option.price)
          .map((option: any) => ({
            id: String(option.service_id || option.id || Math.random()),
            name: String(option.service_name || option.name || 'Transportadora'),
            // ATENÇÃO: manter parênteses para não cair em precedência errada do operador ternário
            // (sem parênteses, qualquer company truthy faria aparecer "Mandae")
            company: String(
              option.company?.name ||
                option.company ||
                (activeIntegration.provider === 'mandae' ? 'Mandae' : 'Melhor Envio')
            ),
            price: parseFloat(option.price || 0).toFixed(2),
            delivery_time: String(option.delivery_time || '5-10 dias'),
            custom_price: parseFloat(option.custom_price || option.price || 0).toFixed(2)
          }));

        if (validOptions.length > 0) {
          const filteredOptions = filterShippingOptions(validOptions, activeIntegration.provider);
          // Preservar opção de merge + opções customizadas + opções da transportadora
          const allOptions = mergeOption 
            ? [mergeOption, ...fallbackShipping, ...filteredOptions]
            : [...fallbackShipping, ...filteredOptions];
          setShippingOptions(allOptions);
          toast({
            title: 'Frete calculado',
            description: `${allOptions.length} opções de frete encontradas`,
          });
        }
      }
    } catch (error) {
      console.error('Erro no cálculo de frete:', error);
    } finally {
      setLoadingShipping(false);
    }
  };

  const handleShippingChange = (shippingId: string) => {
    setSelectedShipping(shippingId);
    // Buscar a opção selecionada das opções disponíveis
    const selectedOption = shippingOptions.find(opt => opt.id === shippingId);
    if (selectedOption) {
      setSelectedShippingData({
        id: selectedOption.id,
        name: selectedOption.name,
        company: selectedOption.company,
        price: selectedOption.custom_price || selectedOption.price,
        delivery_time: selectedOption.delivery_time
      });
    }
  };

  const applyCouponToOrders = async (ordersToApply: Order[]) => {
    if (!couponCode.trim()) {
      toast({ title: 'Erro', description: 'Digite um código de cupom ou brinde', variant: 'destructive' });
      return;
    }

    setLoadingCoupon(true);
    try {
      const codeToSearch = couponCode.toUpperCase().trim();

      // Primeiro, tentar buscar como cupom de desconto (filtrado por tenant)
      const { data: coupon, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('code', codeToSearch)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (coupon) {
        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
          toast({ title: 'Cupom Expirado', description: 'Este cupom já expirou', variant: 'destructive' });
          return;
        }

        if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
          toast({ title: 'Cupom Esgotado', description: 'Este cupom atingiu o limite de uso', variant: 'destructive' });
          return;
        }

        const productsTotal = ordersToApply.reduce((total, order) => {
          return total + order.items.reduce((sum, item) => sum + (Number(item.unit_price) * item.qty), 0);
        }, 0);
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

        setAppliedCoupon({ ...coupon, appliedType: 'coupon' });
        setCouponDiscount(discount);
        toast({ title: 'Cupom Aplicado!', description: `Desconto de ${formatCurrency(discount)} aplicado` });
        return;
      }

      // Se não encontrou cupom, tentar buscar como brinde pelo nome (filtrado por tenant)
      const { data: gifts, error: giftError } = await supabase
        .from('gifts')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);

      if (giftError) throw giftError;

      // Buscar brinde pelo nome (comparação case insensitive)
      const gift = gifts?.find(g => 
        g.name.toUpperCase().replace(/\s+/g, '') === codeToSearch.replace(/\s+/g, '') ||
        g.name.toUpperCase() === codeToSearch
      );

      if (gift) {
        const productsTotal = ordersToApply.reduce((total, order) => {
          return total + order.items.reduce((sum, item) => sum + (Number(item.unit_price) * item.qty), 0);
        }, 0);

        // Verificar se o cliente atingiu o valor mínimo
        if (productsTotal < gift.minimum_purchase_amount) {
          toast({
            title: 'Valor Mínimo não Atingido',
            description: `Para ganhar "${gift.name}", você precisa de ${formatCurrency(gift.minimum_purchase_amount)} em compras. Faltam ${formatCurrency(gift.minimum_purchase_amount - productsTotal)}`,
            variant: 'destructive'
          });
          return;
        }

        // Aplicar brinde (não dá desconto monetário)
        setAppliedCoupon({ 
          code: gift.name.toUpperCase(), 
          name: gift.name,
          description: gift.description,
          appliedType: 'gift',
          id: gift.id
        });
        setCouponDiscount(0);

        toast({
          title: 'Brinde Aplicado! 🎁',
          description: `Você ganhou: ${gift.name}`,
        });
        return;
      }

      // Não encontrou nem cupom nem brinde
      toast({ title: 'Código Inválido', description: 'Cupom ou brinde não encontrado', variant: 'destructive' });

    } catch (error: any) {
      console.error('Erro ao aplicar código:', error);
      toast({ title: 'Erro', description: error?.message || 'Erro ao aplicar código', variant: 'destructive' });
    } finally {
      setLoadingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponCode('');
    toast({ title: 'Cupom Removido', description: 'O cupom foi removido do pedido' });
  };

  const processMultipleOrdersPayment = async (ordersToProcess: Order[]) => {
    if (!tenant) {
      toast({ title: 'Erro', description: 'Loja não identificada', variant: 'destructive' });
      return;
    }

    // Validação específica para CPF primeiro
    const cpfDigits = customerData.cpf?.replace(/\D/g, '') || '';
    if (!cpfDigits || cpfDigits.length !== 11) {
      setCpfError(true);
      toast({ title: 'CPF obrigatório', description: 'Informe um CPF válido (11 dígitos) para finalizar o pedido', variant: 'destructive' });
      return;
    }
    setCpfError(false);

    // Validação dos outros campos obrigatórios
    const missingFields: string[] = [];
    if (!customerData.name) missingFields.push('Nome');
    if (!customerData.cep) missingFields.push('CEP');
    if (!customerData.street) missingFields.push('Rua');
    if (!customerData.number) missingFields.push('Número');
    if (!customerData.neighborhood) missingFields.push('Bairro');
    if (!customerData.city) missingFields.push('Cidade');
    if (!customerData.state) missingFields.push('Estado');

    if (missingFields.length > 0) {
      toast({ title: 'Dados incompletos', description: `Campos obrigatórios faltando: ${missingFields.join(', ')}`, variant: 'destructive' });
      return;
    }

    setLoadingPayment(true);

    try {
      let shippingCost = 0;
      if (selectedShipping !== 'retirada') {
        const selectedOption = shippingOptions.find(opt => opt.id === selectedShipping);
        shippingCost = selectedOption ? parseFloat(selectedOption.custom_price || selectedOption.price) : 0;
      }

      // Calcular total combinado de todos os pedidos
      const allItems = ordersToProcess.flatMap(order => order.items);
      const productsTotal = allItems.reduce((sum, item) => sum + (Number(item.unit_price) * item.qty), 0);
      const totalWithDiscount = Math.max(0, productsTotal - couponDiscount);
      const totalAmount = totalWithDiscount + shippingCost;

      if (appliedCoupon) {
        await supabase
          .from('coupons')
          .update({ used_count: appliedCoupon.used_count + 1 })
          .eq('id', appliedCoupon.id);
      }

      let shippingData = null;
      if (selectedShipping !== 'retirada') {
        const selectedOption = shippingOptions.find(opt => opt.id === selectedShipping);
        if (selectedOption) {
          shippingData = {
            service_id: selectedOption.id,
            service_name: selectedOption.name,
            company_name: selectedOption.company,
            price: parseFloat(selectedOption.custom_price || selectedOption.price),
            delivery_time: selectedOption.delivery_time
          };
        }
      }

      // Adicionar observação se for merge de pedidos
      const mergeObservation = selectedShipping === 'merge_order' 
        ? 'Cliente Possui outro Pedido' 
        : null;

      const paymentData = {
        order_ids: ordersToProcess.map(o => o.id),
        order_id: ordersToProcess[0].id, // Primary order for backwards compatibility
        cartItems: allItems.map(item => ({
          product_name: item.product_name,
          product_code: item.product_code,
          qty: item.qty,
          unit_price: item.unit_price
        })),
        customerData: {
          name: customerData.name,
          phone: ordersToProcess[0].customer_phone,
          cpf: customerData.cpf,
          email: customerData.email
        },
        addressData: {
          cep: customerData.cep,
          street: customerData.street,
          number: customerData.number,
          complement: customerData.complement,
          neighborhood: customerData.neighborhood,
          city: customerData.city,
          state: customerData.state
        },
        shippingCost: shippingCost,
        shippingData: shippingData,
        total: totalAmount.toString(),
        coupon_discount: couponDiscount,
        coupon_code: appliedCoupon?.code || null,
        tenant_id: tenant.id,
        merge_observation: mergeObservation
      };

      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: paymentData
      });

      if (error) throw error;

      if (data && (data.init_point || data.sandbox_init_point)) {
        const paymentUrl = data.init_point || data.sandbox_init_point;
        window.location.href = paymentUrl;
        toast({ title: 'Redirecionando para pagamento', description: 'Você será redirecionado para finalizar o pagamento' });
      } else if (data?.free_order) {
        toast({ title: 'Pedido confirmado', description: 'Pedido gratuito processado com sucesso!' });
      } else {
        throw new Error('Resposta inválida do servidor');
      }
    } catch (error: any) {
      console.error('Error processing payment:', error);
      toast({ title: 'Erro no pagamento', description: error.message || 'Não foi possível processar o pagamento.', variant: 'destructive' });
    } finally {
      setLoadingPayment(false);
    }
  };

  const searchOrders = async () => {
    if (!phone) {
      toast({ title: 'Erro', description: 'Informe seu telefone', variant: 'destructive' });
      return;
    }

    if (!tenant) {
      toast({ title: 'Erro', description: 'Loja não identificada', variant: 'destructive' });
      return;
    }

    const normalizedPhone = normalizeForStorage(phone);
    setLoadingOrders(true);
    setSearched(true);
    setSelectedOrderIds([]);
    setShowCheckout(false);

    try {
      const { data: customerOrders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('customer_phone', normalizedPhone)
        .eq('is_paid', false)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const ordersWithItems = await Promise.all(
        (customerOrders || []).map(async (order) => {
          if (!order.cart_id) return { ...order, items: [] };

          const { data: cartItems } = await supabase
            .from('cart_items')
            .select('id, qty, unit_price, product_id')
            .eq('cart_id', order.cart_id)
            .eq('tenant_id', tenant.id);

          if (!cartItems || cartItems.length === 0) return { ...order, items: [] };

          const productIds = cartItems.map(item => item.product_id);
          const { data: products } = await supabase
            .from('products')
            .select('id, name, code, image_url, color, size')
            .in('id', productIds)
            .eq('tenant_id', tenant.id);

          const items = cartItems.map(item => {
            const product = (products || []).find(p => p.id === item.product_id);
            return {
              id: item.id,
              product_name: product?.name || `Produto ID ${item.product_id}`,
              product_code: product?.code || '',
              qty: item.qty,
              unit_price: Number(item.unit_price),
              image_url: product?.image_url,
              color: product?.color,
              size: product?.size
            };
          });

          return { ...order, items };
        })
      );

      setOrders(ordersWithItems);

      // Carregar dados do cliente
      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', normalizedPhone)
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (customer) {
        setCustomerData({
          name: customer.name || '',
          email: customer.email || '',
          cpf: customer.cpf || '',
          cep: customer.cep || '',
          street: customer.street || '',
          number: customer.number || '',
          complement: customer.complement || '',
          neighborhood: customer.neighborhood || '',
          city: customer.city || '',
          state: customer.state || ''
        });
      }

      if ((customerOrders || []).length === 0) {
        toast({ title: 'Nenhum pedido encontrado', description: 'Não há pedidos em aberto para este telefone' });
      }
    } catch (error: any) {
      console.error('Erro ao buscar pedidos:', error);
      toast({ title: 'Erro', description: error?.message || 'Erro ao buscar seus pedidos', variant: 'destructive' });
    } finally {
      setLoadingOrders(false);
    }
  };

  const toggleOrderSelection = (orderId: number) => {
    const order = orders.find(o => o.id === orderId);
    // Não permitir selecionar pedidos cancelados
    if (order?.is_cancelled) return;
    
    setSelectedOrderIds(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const selectAllOrders = () => {
    // Filtrar apenas pedidos não cancelados
    const selectableOrders = orders.filter(o => !o.is_cancelled);
    if (selectedOrderIds.length === selectableOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(selectableOrders.map(o => o.id));
    }
  };

  const proceedToCheckout = () => {
    if (selectedOrderIds.length === 0) {
      toast({ title: 'Selecione pelo menos um pedido', description: 'Marque os pedidos que deseja finalizar', variant: 'destructive' });
      return;
    }
    setShowCheckout(true);
    
    // Calcular frete se tiver CEP
    if (customerData.cep && customerData.cep.replace(/[^0-9]/g, '').length === 8) {
      const ordersToCalc = orders.filter(o => selectedOrderIds.includes(o.id));
      setTimeout(() => {
        calculateShipping(customerData.cep, ordersToCalc);
      }, 300);
    }
  };

  const searchPaidOrdersHistory = async () => {
    if (!historyPhone.trim() || !tenant) return;
    
    const normalizedPhone = normalizeForStorage(historyPhone);
    setHistorySearched(true);
    loadPaidOrdersHistory(normalizedPhone);
  };

  const loadPaidOrdersHistory = async (normalizedPhone: string) => {
    if (!tenant) return;

    setLoadingHistory(true);
    try {
      const { data: paidOrdersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('customer_phone', normalizedPhone)
        .eq('is_paid', true)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const ordersWithItems = await Promise.all(
        (paidOrdersData || []).map(async (order) => {
          if (!order.cart_id) return { ...order, items: [] };

          const { data: cartItems } = await supabase
            .from('cart_items')
            .select('id, qty, unit_price, product_id')
            .eq('cart_id', order.cart_id)
            .eq('tenant_id', tenant.id);

          if (!cartItems || cartItems.length === 0) return { ...order, items: [] };

          const productIds = cartItems.map(item => item.product_id);
          const { data: products } = await supabase
            .from('products')
            .select('id, name, code, image_url, color, size')
            .in('id', productIds)
            .eq('tenant_id', tenant.id);

          const items = cartItems.map(item => {
            const product = (products || []).find(p => p.id === item.product_id);
            return {
              id: item.id,
              product_name: product?.name || `Produto ID ${item.product_id}`,
              product_code: product?.code || '',
              qty: item.qty,
              unit_price: Number(item.unit_price),
              image_url: product?.image_url,
              color: product?.color,
              size: product?.size
            };
          });

          return { ...order, items };
        })
      );

      setPaidOrders(ordersWithItems);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  // Loading tenant
  if (loadingTenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Carregando loja...</p>
        </div>
      </div>
    );
  }

  // Tenant error
  if (tenantError || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle className="text-destructive">Loja não encontrada</CardTitle>
            <CardDescription>
              {tenantError || 'A loja que você está procurando não existe ou está inativa.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Calcular totais combinados dos pedidos selecionados
  const combinedSubtotal = selectedOrders.reduce((total, order) => {
    return total + order.items.reduce((sum, item) => sum + (item.unit_price * item.qty), 0);
  }, 0);
  
  const allSelectedItems = selectedOrders.flatMap(order => order.items);

  // Função para formatar telefone com máscara
  const formatPhoneMask = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)})-${digits.slice(2)}`;
    if (digits.length <= 11) return `(${digits.slice(0, 2)})-${digits.slice(2, 7)}-${digits.slice(7)}`;
    return `(${digits.slice(0, 2)})-${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const handlePhoneChange = (value: string, setter: (val: string) => void) => {
    setter(formatPhoneMask(value));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header compacto com logo */}
      <div className="w-full py-8 md:py-10 flex justify-center">
        {tenant.logo_url ? (
          <div className="p-2 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200/60 dark:border-slate-700/60">
            <img 
              src={tenant.logo_url} 
              alt={tenant.name} 
              className="h-36 md:h-44 lg:h-52 w-auto object-contain max-w-[320px] md:max-w-[400px]" 
            />
          </div>
        ) : (
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
            <Store className="h-10 w-10 md:h-12 md:w-12 text-primary-foreground" />
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-6 pb-12 space-y-8">
        {/* Título da página */}
        <div className="text-center space-y-2 pt-4">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text">
            Finalizar Compra
          </h1>
          <p className="text-muted-foreground text-lg">
            Localize seus pedidos e finalize o pagamento
          </p>
        </div>

        {/* Card de busca pedidos em aberto */}
        <Card className="overflow-hidden border-0 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 bg-white dark:bg-slate-800/50 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-b border-slate-100 dark:border-slate-700/50 pb-5">
            <CardTitle className="flex items-center gap-3 text-lg">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              Buscar Pedidos em Aberto
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="(31) 99999-9999"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value, setPhone)}
                  onKeyPress={(e) => e.key === 'Enter' && searchOrders()}
                  className="pl-10 h-12 text-base border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <Button 
                onClick={searchOrders} 
                disabled={loadingOrders} 
                className="h-12 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/25 transition-all duration-200"
              >
                {loadingOrders ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                <span className="ml-2 font-medium">Buscar</span>
              </Button>
            </div>
            {!searched && (
              <div className="mt-6 text-center py-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                <Search className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-muted-foreground">
                  Digite seu telefone para localizar pedidos pendentes
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resultados */}
        {searched && (
          <>
            {orders.length === 0 ? (
              <Alert>
                <ShoppingCart className="h-4 w-4" />
                <AlertDescription>
                  Nenhum pedido em aberto encontrado para este telefone.
                </AlertDescription>
              </Alert>
            ) : !showCheckout ? (
              // Seleção de pedidos com checkboxes
              <Card className="overflow-hidden border-0 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 bg-white dark:bg-slate-800/50 backdrop-blur-sm">
                <CardHeader className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-b border-slate-100 dark:border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <CheckCircle2 className="h-5 w-5 text-violet-600" />
                        Selecione os Pedidos
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Você possui {orders.length} pedido(s) em aberto. Selecione quais deseja finalizar juntos:
                      </CardDescription>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={selectAllOrders}
                      className="shrink-0"
                    >
                      {selectedOrderIds.length === orders.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    {orders.map((order) => {
                      const isSelected = selectedOrderIds.includes(order.id);
                      const isCancelled = order.is_cancelled;
                      return (
                        <div 
                          key={order.id} 
                          className={`relative border-2 rounded-xl p-4 transition-all duration-200 ${
                            isCancelled 
                              ? 'border-slate-300 dark:border-slate-600 bg-slate-100/50 dark:bg-slate-800/30 opacity-60 cursor-not-allowed'
                              : isSelected 
                                ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 cursor-pointer' 
                                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer'
                          }`}
                          onClick={() => !isCancelled && toggleOrderSelection(order.id)}
                        >
                          <div className="flex items-start gap-4">
                            <div className="pt-1">
                              <Checkbox 
                                checked={isSelected}
                                onCheckedChange={() => toggleOrderSelection(order.id)}
                                disabled={isCancelled}
                                className={`h-5 w-5 ${isCancelled ? 'opacity-50' : 'data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500'}`}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                <Badge variant="secondary" className="font-medium">Pedido #{order.id}</Badge>
                                <Badge variant="outline">{order.event_type}</Badge>
                                {isCancelled && (
                                  <Badge variant="destructive" className="flex items-center gap-1">
                                    <Ban className="h-3 w-3" />
                                    Cancelado
                                  </Badge>
                                )}
                                {isSelected && !isCancelled && (
                                  <Badge className="bg-emerald-500 text-white">Selecionado</Badge>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mb-3">
                                <div><span className="font-medium">Data:</span> {formatBrasiliaDate(order.event_date)}</div>
                                <div><span className="font-medium">Itens:</span> {order.items.length} produto(s)</div>
                              </div>
                              {/* Lista de produtos */}
                              <div className="space-y-1.5">
                                {order.items.slice(0, 3).map((item) => (
                                  <div key={item.id} className="flex items-center gap-2 text-sm">
                                    {item.image_url && (
                                      <ZoomableImage src={item.image_url} alt={item.product_name} className="h-8 w-8" containerClassName="h-8 w-8 rounded" />
                                    )}
                                    <span className={`truncate flex-1 ${isCancelled ? 'line-through text-muted-foreground' : ''}`}>{item.product_name}</span>
                                    <span className="text-muted-foreground">x{item.qty}</span>
                                  </div>
                                ))}
                                {order.items.length > 3 && (
                                  <p className="text-xs text-muted-foreground">+ {order.items.length - 3} outros produtos</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className={`text-xl font-bold ${isCancelled ? 'text-muted-foreground line-through' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {isCancelled ? 'R$ 0,00' : formatCurrency(order.total_amount)}
                              </div>
                              {isCancelled && (
                                <p className="text-xs text-destructive mt-1">Pedido cancelado</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Resumo da seleção */}
                  {selectedOrderIds.length > 0 && (
                    <div className="mt-6 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium text-emerald-800 dark:text-emerald-300">
                          {selectedOrderIds.length} pedido(s) selecionado(s)
                        </span>
                        <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(combinedSubtotal)}
                        </span>
                      </div>
                      <Button 
                        className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold py-3 shadow-lg shadow-emerald-500/25"
                        onClick={proceedToCheckout}
                      >
                        <CreditCard className="h-5 w-5 mr-2" />
                        Continuar para Finalizar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : selectedOrders.length > 0 ? (
              // Checkout dos pedidos selecionados
              <Card className="overflow-hidden border-0 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 bg-white dark:bg-slate-800/50 backdrop-blur-sm">
                <CardHeader className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-b border-slate-100 dark:border-slate-700/50">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        Finalizar {selectedOrders.length} Pedido(s)
                        <Button variant="ghost" size="sm" onClick={() => setShowCheckout(false)} className="ml-2">
                          ← Voltar
                        </Button>
                      </CardTitle>
                      <CardDescription>
                        Pedidos: {selectedOrders.map(o => `#${o.id}`).join(', ')}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="text-lg px-3 py-1">
                      Total: {formatCurrency(combinedSubtotal)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Itens de todos os pedidos */}
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Produtos ({allSelectedItems.length} itens)
                    </h4>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {selectedOrders.map((order) => (
                        <div key={order.id} className="space-y-2">
                          {selectedOrders.length > 1 && (
                            <div className="text-xs font-medium text-muted-foreground bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded">
                              Pedido #{order.id}
                            </div>
                          )}
                          {order.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-center gap-3">
                                {item.image_url && (
                                  <ZoomableImage src={item.image_url} alt={item.product_name} className="h-12 w-12" containerClassName="h-12 w-12 rounded" />
                                )}
                                <div>
                                  <p className="font-medium">{item.product_name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    Código: {item.product_code} | Qtd: {item.qty}
                                    {(item.color || item.size) && (
                                      <> | {item.color && `Cor: ${item.color}`}{item.color && item.size && ' | '}{item.size && `Tam: ${item.size}`}</>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <span className="font-bold">{formatCurrency(item.unit_price * item.qty)}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Brinde Elegível */}
                  {eligibleGift && (
                    <div className="p-4 bg-green-50 dark:bg-green-950/30 border-2 border-green-500 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                          <Gift className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-green-700 dark:text-green-400">
                            🎉 Parabéns! Você ganhou um brinde
                          </h4>
                          <p className="text-sm font-medium text-green-900 dark:text-green-300">{eligibleGift.name}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Progresso para Próximo Brinde */}
                  {progressGift && (
                    <div className="p-4 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg">
                      <div className="flex items-center gap-3 mb-3">
                        <Gift className="w-5 h-5 text-purple-600" />
                        <span className="font-medium">Falta pouco para ganhar: {progressGift.name}</span>
                      </div>
                      <Progress value={progressGift.percentageAchieved} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-2">
                        Faltam {formatCurrency(progressGift.minimum_purchase_amount - combinedSubtotal)} para ganhar
                      </p>
                    </div>
                  )}

                  <Separator />

                  {/* Dados do Cliente */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Seus Dados
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block">Nome Completo *</label>
                        <Input
                          placeholder="Seu nome completo"
                          value={customerData.name}
                          onChange={(e) => setCustomerData({...customerData, name: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">CPF *</label>
                        <Input
                          placeholder="000.000.000-00"
                          value={customerData.cpf}
                          onChange={(e) => {
                            setCustomerData({...customerData, cpf: formatCPF(e.target.value)});
                            if (cpfError) setCpfError(false);
                          }}
                          maxLength={14}
                          className={cpfError ? 'border-red-500 focus-visible:ring-red-500' : ''}
                        />
                        {cpfError && (
                          <p className="text-xs text-red-500 mt-1">CPF obrigatório para gerar etiqueta de envio</p>
                        )}
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Email</label>
                        <Input
                          placeholder="seu@email.com"
                          value={customerData.email}
                          onChange={(e) => setCustomerData({...customerData, email: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Endereço */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Endereço de Entrega
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block">CEP</label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="00000-000"
                            value={customerData.cep}
                            onChange={(e) => {
                              const newCep = e.target.value;
                              setCustomerData({...customerData, cep: newCep});
                              if (newCep.replace(/[^0-9]/g, '').length === 8) {
                                calculateShipping(newCep, selectedOrders);
                              }
                            }}
                          />
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => calculateShipping(customerData.cep, selectedOrders)}
                            disabled={loadingShipping}
                          >
                            {loadingShipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Rua</label>
                        <Input
                          placeholder="Nome da rua"
                          value={customerData.street}
                          onChange={(e) => setCustomerData({...customerData, street: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Número</label>
                        <Input
                          placeholder="123"
                          value={customerData.number}
                          onChange={(e) => setCustomerData({...customerData, number: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Complemento</label>
                        <Input
                          placeholder="Apto, bloco, etc."
                          value={customerData.complement}
                          onChange={(e) => setCustomerData({...customerData, complement: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Bairro</label>
                        <Input
                          placeholder="Bairro"
                          value={customerData.neighborhood}
                          onChange={(e) => setCustomerData({...customerData, neighborhood: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Cidade</label>
                        <Input
                          placeholder="Cidade"
                          value={customerData.city}
                          onChange={(e) => setCustomerData({...customerData, city: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Estado</label>
                        <Input
                          placeholder="UF"
                          value={customerData.state}
                          onChange={(e) => setCustomerData({...customerData, state: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Opções de Frete */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <Truck className="h-4 w-4" />
                      Opções de Frete
                    </h4>
                    <div className="space-y-2">
                      {shippingOptions.map((option) => (
                        <div key={option.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              id={option.id}
                              name="frete"
                              value={option.id}
                              checked={selectedShipping === option.id}
                              onChange={(e) => handleShippingChange(e.target.value)}
                              className="w-4 h-4"
                            />
                            <label htmlFor={option.id} className="cursor-pointer">
                              <span className="font-medium">{option.name}</span>
                              <p className="text-sm text-muted-foreground">
                                {option.company} - {formatDeliveryTime(option.delivery_time, option.company)}
                              </p>
                            </label>
                          </div>
                          <span className="font-bold">{formatCurrency(parseFloat(option.custom_price || option.price))}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Cupom de Desconto ou Brinde */}
                  <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Percent className="h-4 w-4 text-green-600" />
                      Cupom de Desconto ou Brinde
                    </h4>
                    
                    {!appliedCoupon ? (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Digite o código do cupom ou nome do brinde"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          className="flex-1"
                        />
                        <Button
                          onClick={() => applyCouponToOrders(selectedOrders)}
                          disabled={loadingCoupon || !couponCode.trim()}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {loadingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-white dark:bg-background border border-green-300 rounded">
                          <div className="flex items-center gap-2">
                            {appliedCoupon.appliedType === 'gift' ? (
                              <Gift className="h-5 w-5 text-purple-600" />
                            ) : (
                              <Percent className="h-5 w-5 text-green-600" />
                            )}
                            <div>
                              <Badge className={appliedCoupon.appliedType === 'gift' ? 'bg-purple-600' : 'bg-green-600'}>
                                {appliedCoupon.appliedType === 'gift' ? '🎁 ' : ''}{appliedCoupon.code}
                              </Badge>
                              <p className="text-sm text-muted-foreground mt-1">
                                {appliedCoupon.appliedType === 'gift' ? (
                                  `Brinde: ${appliedCoupon.name}`
                                ) : appliedCoupon.discount_type === 'progressive' ? 'Desconto Progressivo' :
                                 appliedCoupon.discount_type === 'percentage' ? `${appliedCoupon.discount_value}% de desconto` :
                                 `${formatCurrency(appliedCoupon.discount_value || 0)} de desconto`}
                              </p>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={removeCoupon} className="text-red-600">
                            Remover
                          </Button>
                        </div>
                        {couponDiscount > 0 && (
                          <div className="flex justify-between items-center text-green-700 font-semibold">
                            <span>Desconto Aplicado:</span>
                            <span>- {formatCurrency(couponDiscount)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Resumo */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Subtotal ({allSelectedItems.length} itens):</span>
                      <span>{formatCurrency(combinedSubtotal)}</span>
                    </div>
                    
                    {selectedShipping !== 'retirada' && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Frete:</span>
                        <span>{formatCurrency(parseFloat(shippingOptions.find(opt => opt.id === selectedShipping)?.custom_price || '0'))}</span>
                      </div>
                    )}
                    
                    {couponDiscount > 0 && (
                      <div className="flex justify-between items-center text-green-600">
                        <span>Desconto:</span>
                        <span>- {formatCurrency(couponDiscount)}</span>
                      </div>
                    )}
                    
                    <Separator />
                    
                    <div className="flex justify-between items-center text-xl font-bold">
                      <span>Total:</span>
                      <span className="text-green-600">
                        {formatCurrency(
                          Math.max(0, combinedSubtotal - couponDiscount) +
                          (selectedShipping !== 'retirada' ? parseFloat(shippingOptions.find(opt => opt.id === selectedShipping)?.custom_price || '0') : 0)
                        )}
                      </span>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-3 text-lg shadow-lg shadow-emerald-500/25"
                    onClick={() => processMultipleOrdersPayment(selectedOrders)}
                    disabled={loadingPayment}
                  >
                    {loadingPayment ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CreditCard className="h-4 w-4 mr-2" />
                    )}
                    Finalizar {selectedOrders.length > 1 ? `${selectedOrders.length} Pedidos` : 'Pedido'} - Mercado Pago
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </>
        )}

        {/* Histórico de Pedidos Pagos - Card com busca separada */}
        <Card className="overflow-hidden border-0 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 bg-white dark:bg-slate-800/50 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-b border-slate-100 dark:border-slate-700/50 pb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-lg">Histórico de Pedidos</CardTitle>
                <CardDescription className="mt-1">Visualize pedidos já finalizados</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="(31) 99999-9999"
                  value={historyPhone}
                  onChange={(e) => handlePhoneChange(e.target.value, setHistoryPhone)}
                  onKeyPress={(e) => e.key === 'Enter' && searchPaidOrdersHistory()}
                  className="pl-10 h-12 text-base border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <Button 
                onClick={searchPaidOrdersHistory} 
                disabled={loadingHistory} 
                className="h-12 px-6 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-lg shadow-blue-500/25 transition-all duration-200"
              >
                {loadingHistory ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                <span className="ml-2 font-medium">Buscar</span>
              </Button>
            </div>

            {historySearched && (
              loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-3" />
                  <p className="text-muted-foreground">Buscando histórico...</p>
                </div>
              ) : paidOrders.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                  <History className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-muted-foreground font-medium">Nenhum pedido encontrado</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Não há pedidos pagos para este telefone</p>
                </div>
              ) : (
                <div className="space-y-4 mt-4">
                  {paidOrders.map((order) => (
                    <div key={order.id} className="group bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-800 dark:to-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-200">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-700 font-medium">
                              Pedido #{order.id}
                            </Badge>
                            <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0">
                              ✓ Pago
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {formatBrasiliaDateLong(order.event_date)} • {order.event_type}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {order.items.length} {order.items.length === 1 ? 'produto' : 'produtos'}
                          </p>
                        </div>
                        <div className="text-right space-y-2">
                          <div className="text-xl font-bold text-green-600 dark:text-green-400">
                            {formatCurrency(order.total_amount)}
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="border-slate-200 dark:border-slate-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            onClick={() => setSelectedHistoryOrder(
                              selectedHistoryOrder?.id === order.id ? null : order
                            )}
                          >
                            <Eye className="h-4 w-4 mr-1.5" />
                            {selectedHistoryOrder?.id === order.id ? 'Ocultar' : 'Detalhes'}
                          </Button>
                        </div>
                      </div>
                      
                      {/* Detalhes expandidos */}
                      {selectedHistoryOrder?.id === order.id && (
                        <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700 space-y-3 animate-fade-in">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                              <div className="flex items-center gap-4">
                                {item.image_url && (
                                  <ZoomableImage src={item.image_url} alt={item.product_name} className="h-14 w-14" containerClassName="h-14 w-14 rounded-lg shadow-sm" />
                                )}
                                <div>
                                  <p className="font-semibold">{item.product_name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {item.product_code} • Quantidade: {item.qty}
                                    {(item.color || item.size) && (
                                      <> • {item.color && `Cor: ${item.color}`}{item.color && item.size && ' | '}{item.size && `Tam: ${item.size}`}</>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <span className="font-bold text-lg">{formatCurrency(item.unit_price * item.qty)}</span>
                            </div>
                          ))}
                          <div className="flex justify-end pt-3">
                            <div className="bg-green-50 dark:bg-green-900/20 px-5 py-3 rounded-xl border border-green-200 dark:border-green-800">
                              <span className="text-sm text-green-600 dark:text-green-400 mr-2">Total pago:</span>
                              <span className="font-bold text-xl text-green-700 dark:text-green-300">{formatCurrency(order.total_amount)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center pt-6 pb-4">
          <p className="text-sm text-muted-foreground/60">
            Powered by <span className="font-semibold text-primary">OrderZap</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicCheckout;
