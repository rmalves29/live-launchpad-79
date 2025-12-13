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
import { Loader2, User, MapPin, Search, ShoppingCart, Package, Store, Phone, AlertTriangle, Truck, CreditCard, Percent, Gift, Eye, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneForDisplay, normalizeForStorage } from '@/lib/phone-utils';

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
}

interface Order {
  id: number;
  customer_phone: string;
  customer_name: string | null;
  event_type: string;
  event_date: string;
  total_amount: number;
  is_paid: boolean;
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  
  // Histórico de pedidos pagos
  const [paidOrders, setPaidOrders] = useState<Order[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<Order | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  
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

  // Carregar tenant pelo slug
  useEffect(() => {
    const loadTenant = async () => {
      if (!slug) {
        setTenantError('Loja não especificada');
        setLoadingTenant(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .rpc('get_tenant_by_slug', { slug_param: slug });

        if (error) throw error;

        const tenantData = (Array.isArray(data) && data.length > 0 ? data[0] : null) as any;

        if (!tenantData || !tenantData.is_active) {
          setTenantError('Loja não encontrada');
        } else {
          setTenant({
            id: tenantData.id,
            name: tenantData.name,
            slug: tenantData.slug,
            logo_url: null,
            primary_color: null,
            phone: null,
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

  // Carregar brindes ativos
  useEffect(() => {
    const loadActiveGifts = async () => {
      try {
        const { data, error } = await supabase
          .from("gifts")
          .select("*")
          .eq("is_active", true)
          .order("minimum_purchase_amount", { ascending: true });

        if (error) throw error;
        setActiveGifts(data || []);
      } catch (error) {
        console.error("Erro ao carregar brindes:", error);
      }
    };
    loadActiveGifts();
  }, []);

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

  // Calcular brinde elegível quando pedido muda
  useEffect(() => {
    if (activeGifts.length === 0 || !selectedOrder) return;

    const productsTotal = selectedOrder.items.reduce((sum: number, item: any) => {
      return sum + (parseFloat(String(item.unit_price)) * item.qty);
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
  }, [selectedOrder, activeGifts]);

  const formatDeliveryTime = (originalTime: string, companyName: string) => {
    if (companyName === 'Retirada') return originalTime;
    const timeMatch = originalTime.match(/(\d+(?:-\d+)?)/);
    if (timeMatch) {
      return `${handlingDays} dias para postagem + ${timeMatch[1]} dias úteis`;
    }
    return `${handlingDays} dias para postagem + ${originalTime}`;
  };

  const filterShippingOptions = (options: any[]) => {
    return options.filter(option => {
      const companyName = option.company?.toLowerCase() || '';
      const serviceName = option.name?.toLowerCase() || '';
      if (option.id === 'retirada') return true;
      return (
        companyName.includes('j&t') ||
        companyName.includes('correios') ||
        serviceName.includes('pac') ||
        serviceName.includes('sedex') ||
        serviceName.includes('j&t')
      );
    });
  };

  const calculateShipping = async (cep: string, order: Order) => {
    if (!cep || !order || !tenant) return;
    if (cep.replace(/[^0-9]/g, '').length !== 8) return;

    const fallbackShipping = [{
      id: 'retirada',
      name: 'Retirada - Retirar na Fábrica',
      company: 'Retirada',
      price: '0.00',
      delivery_time: 'Imediato',
      custom_price: '0.00'
    }];

    setLoadingShipping(true);
    setShippingOptions(fallbackShipping);

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

      // Testar token Melhor Envio
      const tokenTestResponse = await supabase.functions.invoke('melhor-envio-test-token', {
        body: { tenant_id: tenant.id }
      });

      if (tokenTestResponse.error || !tokenTestResponse.data?.valid) {
        console.log('Token inválido, apenas retirada disponível');
        return;
      }

      // Calcular frete
      const products = order.items.map(item => ({
        id: String(item.id || Math.random()),
        width: 16,
        height: 2,
        length: 20,
        weight: 0.3,
        insurance_value: Number(item.unit_price) || 1,
        quantity: Number(item.qty) || 1
      }));

      const shippingResponse = await supabase.functions.invoke('melhor-envio-shipping', {
        body: {
          to_postal_code: cep.replace(/[^0-9]/g, ''),
          tenant_id: tenant.id,
          products: products
        }
      });

      if (shippingResponse.error) throw new Error('Erro ao calcular frete');

      const data = shippingResponse.data;
      if (data?.success && Array.isArray(data.shipping_options)) {
        const validOptions = data.shipping_options
          .filter((option: any) => option && !option.error && option.price)
          .map((option: any) => ({
            id: String(option.service_id || option.id || Math.random()),
            name: String(option.service_name || option.name || 'Transportadora'),
            company: String(option.company?.name || option.company || 'Melhor Envio'),
            price: parseFloat(option.price || 0).toFixed(2),
            delivery_time: String(option.delivery_time || '5-10 dias'),
            custom_price: parseFloat(option.custom_price || option.price || 0).toFixed(2)
          }));

        if (validOptions.length > 0) {
          const filteredOptions = filterShippingOptions(validOptions);
          setShippingOptions([...fallbackShipping, ...filteredOptions]);
          toast({
            title: 'Frete calculado',
            description: `${filteredOptions.length} opções de frete encontradas`,
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
    if (shippingId === 'retirada') {
      setSelectedShippingData({
        id: 'retirada',
        name: 'Retirada - Retirar na Fábrica',
        company: 'Retirada',
        price: '0.00',
        delivery_time: 'Imediato'
      });
    } else {
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
    }
  };

  const applyCoupon = async (order: Order) => {
    if (!couponCode.trim()) {
      toast({ title: 'Erro', description: 'Digite um código de cupom', variant: 'destructive' });
      return;
    }

    setLoadingCoupon(true);
    try {
      const { data: coupon, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', couponCode.toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (!coupon) {
        toast({ title: 'Cupom Inválido', description: 'Cupom não encontrado ou inativo', variant: 'destructive' });
        return;
      }

      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        toast({ title: 'Cupom Expirado', description: 'Este cupom já expirou', variant: 'destructive' });
        return;
      }

      if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
        toast({ title: 'Cupom Esgotado', description: 'Este cupom atingiu o limite de uso', variant: 'destructive' });
        return;
      }

      const productsTotal = order.items.reduce((sum, item) => sum + (Number(item.unit_price) * item.qty), 0);
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

      setAppliedCoupon(coupon);
      setCouponDiscount(discount);
      toast({ title: 'Cupom Aplicado!', description: `Desconto de R$ ${discount.toFixed(2)} aplicado` });
    } catch (error) {
      console.error('Erro ao aplicar cupom:', error);
      toast({ title: 'Erro', description: 'Erro ao aplicar cupom', variant: 'destructive' });
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

  const processPayment = async (order: Order) => {
    if (!tenant) {
      toast({ title: 'Erro', description: 'Loja não identificada', variant: 'destructive' });
      return;
    }

    if (!customerData.name || !customerData.cpf) {
      toast({ title: 'Dados obrigatórios', description: 'Nome e CPF são obrigatórios para finalizar o pedido', variant: 'destructive' });
      return;
    }

    if (selectedShipping !== 'retirada' && (!customerData.cep || !customerData.street)) {
      toast({ title: 'Endereço obrigatório', description: 'Endereço completo é obrigatório para entrega', variant: 'destructive' });
      return;
    }

    setLoadingPayment(true);

    try {
      let shippingCost = 0;
      if (selectedShipping !== 'retirada') {
        const selectedOption = shippingOptions.find(opt => opt.id === selectedShipping);
        shippingCost = selectedOption ? parseFloat(selectedOption.custom_price || selectedOption.price) : 0;
      }

      const productsTotal = Number(order.total_amount);
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

      const paymentData = {
        order_id: order.id,
        cartItems: order.items.map(item => ({
          product_name: item.product_name,
          product_code: item.product_code,
          qty: item.qty,
          unit_price: item.unit_price
        })),
        customerData: {
          name: customerData.name,
          phone: order.customer_phone
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
        tenant_id: tenant.id
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
    setSelectedOrder(null);

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
            .select('id, name, code, image_url')
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
              image_url: product?.image_url
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

        // Calcular frete automaticamente se tiver CEP
        if (customer.cep && customer.cep.replace(/[^0-9]/g, '').length === 8 && ordersWithItems.length > 0) {
          setTimeout(() => {
            calculateShipping(customer.cep, ordersWithItems[0]);
          }, 500);
        }
      }

      if ((customerOrders || []).length === 0) {
        toast({ title: 'Nenhum pedido encontrado', description: 'Não há pedidos em aberto para este telefone' });
      }

      // Carregar também histórico de pedidos pagos
      loadPaidOrdersHistory(normalizedPhone);
    } catch (error) {
      console.error('Erro ao buscar pedidos:', error);
      toast({ title: 'Erro', description: 'Erro ao buscar seus pedidos', variant: 'destructive' });
    } finally {
      setLoadingOrders(false);
    }
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
            .select('id, name, code, image_url')
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
              image_url: product?.image_url
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

  const currentOrder = selectedOrder || (orders.length === 1 ? orders[0] : null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Header da loja */}
      <div className="border-b py-4 px-4 bg-primary">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          {tenant.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} className="h-12 w-12 rounded-full object-cover bg-white" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
              <Store className="h-6 w-6 text-primary-foreground" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-primary-foreground">{tenant.name}</h1>
            <p className="text-primary-foreground/80 text-sm">Checkout</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Card de busca */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Consultar Meus Pedidos
            </CardTitle>
            <CardDescription>
              Digite seu telefone para visualizar seus pedidos em aberto
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="(XX) XXXXX-XXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchOrders()}
                className="flex-1"
              />
              <Button onClick={searchOrders} disabled={loadingOrders}>
                {loadingOrders ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-2">Buscar</span>
              </Button>
            </div>
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
            ) : orders.length > 1 && !selectedOrder ? (
              // Seleção de pedido quando há múltiplos
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5" />
                    Selecione o Pedido para Finalizar
                  </CardTitle>
                  <CardDescription>
                    Você possui {orders.length} pedidos em aberto. Selecione qual deseja finalizar:
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {orders.map((order) => (
                      <div 
                        key={order.id} 
                        className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <div className="flex justify-between items-center">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <Badge variant="secondary">Pedido #{order.id}</Badge>
                              <Badge variant="outline">{order.event_type}</Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                              <div><span className="font-medium">Data:</span> {new Date(order.event_date).toLocaleDateString('pt-BR')}</div>
                              <div><span className="font-medium">Items:</span> {order.items.length} produto(s)</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-primary">{formatCurrency(order.total_amount)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : currentOrder ? (
              // Checkout do pedido selecionado
              <Card className="glass-card">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        Pedido #{currentOrder.id}
                        <Badge variant="outline">{currentOrder.event_type}</Badge>
                        {orders.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(null)} className="ml-2">
                            ← Voltar
                          </Button>
                        )}
                      </CardTitle>
                      <CardDescription>
                        Data: {new Date(currentOrder.event_date).toLocaleDateString('pt-BR')}
                      </CardDescription>
                    </div>
                    <Badge variant={currentOrder.is_paid ? "default" : "secondary"}>
                      {currentOrder.is_paid ? 'Pago' : 'Aguardando Pagamento'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Itens do pedido */}
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Produtos do Pedido
                    </h4>
                    <div className="space-y-2">
                      {currentOrder.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            {item.image_url && (
                              <img src={item.image_url} alt={item.product_name} className="h-12 w-12 rounded object-cover" />
                            )}
                            <div>
                              <p className="font-medium">{item.product_name}</p>
                              <p className="text-sm text-muted-foreground">
                                Código: {item.product_code} | Qtd: {item.qty}
                              </p>
                            </div>
                          </div>
                          <span className="font-bold">{formatCurrency(item.unit_price * item.qty)}</span>
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
                        Faltam {formatCurrency(progressGift.minimum_purchase_amount - currentOrder.items.reduce((sum, i) => sum + i.unit_price * i.qty, 0))} para ganhar
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
                          onChange={(e) => setCustomerData({...customerData, cpf: e.target.value})}
                        />
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
                                calculateShipping(newCep, currentOrder);
                              }
                            }}
                          />
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => calculateShipping(customerData.cep, currentOrder)}
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

                  {/* Cupom de Desconto */}
                  <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Percent className="h-4 w-4 text-green-600" />
                      Cupom de Desconto
                    </h4>
                    
                    {!appliedCoupon ? (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Digite o código do cupom"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          className="flex-1"
                        />
                        <Button
                          onClick={() => applyCoupon(currentOrder)}
                          disabled={loadingCoupon || !couponCode.trim()}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {loadingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-white dark:bg-background border border-green-300 rounded">
                          <div>
                            <Badge className="bg-green-600">{appliedCoupon.code}</Badge>
                            <p className="text-sm text-muted-foreground mt-1">
                              {appliedCoupon.discount_type === 'progressive' ? 'Desconto Progressivo' :
                               appliedCoupon.discount_type === 'percentage' ? `${appliedCoupon.discount_value}% de desconto` :
                               `R$ ${appliedCoupon.discount_value.toFixed(2)} de desconto`}
                            </p>
                          </div>
                          <Button variant="outline" size="sm" onClick={removeCoupon} className="text-red-600">
                            Remover
                          </Button>
                        </div>
                        <div className="flex justify-between items-center text-green-700 font-semibold">
                          <span>Desconto Aplicado:</span>
                          <span>- {formatCurrency(couponDiscount)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Resumo */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span>{formatCurrency(currentOrder.items.reduce((sum, i) => sum + i.unit_price * i.qty, 0))}</span>
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
                          Math.max(0, currentOrder.items.reduce((sum, i) => sum + i.unit_price * i.qty, 0) - couponDiscount) +
                          (selectedShipping !== 'retirada' ? parseFloat(shippingOptions.find(opt => opt.id === selectedShipping)?.custom_price || '0') : 0)
                        )}
                      </span>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 text-lg"
                    onClick={() => processPayment(currentOrder)}
                    disabled={loadingPayment}
                  >
                    {loadingPayment ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CreditCard className="h-4 w-4 mr-2" />
                    )}
                    Finalizar Pedido - Mercado Pago
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </>
        )}

        {/* Histórico de Pedidos Pagos */}
        {searched && paidOrders.length > 0 && (
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Histórico de Pedidos Pagos ({paidOrders.length})
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                >
                  {showHistory ? 'Ocultar' : 'Ver Histórico'}
                </Button>
              </div>
            </CardHeader>
            {showHistory && (
              <CardContent className="space-y-4">
                {loadingHistory ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {paidOrders.map((order) => (
                      <div key={order.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">Pedido #{order.id}</Badge>
                              <Badge variant="default" className="bg-green-600">Pago</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Data: {new Date(order.event_date).toLocaleDateString('pt-BR')} • {order.event_type}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {order.items.length} {order.items.length === 1 ? 'produto' : 'produtos'}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-green-600">{formatCurrency(order.total_amount)}</div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="mt-2"
                              onClick={() => setSelectedHistoryOrder(
                                selectedHistoryOrder?.id === order.id ? null : order
                              )}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              {selectedHistoryOrder?.id === order.id ? 'Ocultar' : 'Ver Produtos'}
                            </Button>
                          </div>
                        </div>
                        
                        {/* Detalhes do pedido selecionado */}
                        {selectedHistoryOrder?.id === order.id && (
                          <div className="mt-4 pt-4 border-t space-y-3">
                            {order.items.map((item) => (
                              <div key={item.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                <div className="flex items-center gap-3">
                                  {item.image_url && (
                                    <img src={item.image_url} alt={item.product_name} className="h-12 w-12 rounded object-cover" />
                                  )}
                                  <div>
                                    <p className="font-medium">{item.product_name}</p>
                                    <p className="text-sm text-muted-foreground">
                                      Código: {item.product_code} | Qtd: {item.qty}
                                    </p>
                                  </div>
                                </div>
                                <span className="font-bold">{formatCurrency(item.unit_price * item.qty)}</span>
                              </div>
                            ))}
                            <div className="text-right pt-2 border-t">
                              <span className="font-bold text-lg">Total: {formatCurrency(order.total_amount)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            )}
          </Card>
        )}

        {/* Contato da loja */}
        {tenant.phone && (
          <Card className="glass-card">
            <CardContent className="pt-4 text-center text-sm text-muted-foreground">
              Dúvidas? Entre em contato: {formatPhoneForDisplay(tenant.phone)}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PublicCheckout;
