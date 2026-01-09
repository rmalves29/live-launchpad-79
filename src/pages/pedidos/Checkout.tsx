import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useTenantContext } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, User, MapPin, Truck, Search, ShoppingCart, ArrowLeft, BarChart3, CreditCard, Eye, Package, Percent, Gift, AlertTriangle, ExternalLink } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneForDisplay, normalizeForStorage, normalizeForSending } from '@/lib/phone-utils';
import { formatCurrency, formatCPF } from '@/lib/utils';
import { ZoomableImage } from '@/components/ui/zoomable-image';


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
  event_type: string;
  event_date: string;
  total_amount: number;
  items: OrderItem[];
}

interface CustomerData {
  name: string;
  cpf: string;
}

const Checkout = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { tenantId } = useTenantContext();
  const [phone, setPhone] = useState('');
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingOpenOrders, setLoadingOpenOrders] = useState(false);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<Order | null>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'history' | 'checkout'>('dashboard');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showOrderSelection, setShowOrderSelection] = useState(false);
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
  const [shippingOptions, setShippingOptions] = useState<any[]>([]);
  const [selectedShipping, setSelectedShipping] = useState('retirada');
  const [selectedShippingData, setSelectedShippingData] = useState<{
    id: string;
    name: string;
    company: string;
    price: string;
    delivery_time: string;
  } | null>(null);
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [handlingDays, setHandlingDays] = useState<number>(3);
  
  // Estados para cupom de desconto
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [loadingCoupon, setLoadingCoupon] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(0);
  
  // Estados para brindes
  const [activeGifts, setActiveGifts] = useState<any[]>([]);
  const [eligibleGift, setEligibleGift] = useState<any>(null);
  const [progressGift, setProgressGift] = useState<any>(null);

  // Estado para slug do tenant (para link do checkout público)
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>('https://app.orderzaps.com');

  // Tenant específico OF Beauty - definição global
  const OF_BEAUTY_TENANT_ID = '4247aa21-4a46-4988-8845-fa15aa202310';

  // Detectar retorno da página de pagamento e limpar dados duplicados  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const isReturningFromPayment = urlParams.has('collection_id') || urlParams.has('preference_id') || urlParams.has('payment_id');
    
    if (isReturningFromPayment) {
      console.log('🔄 Detectado retorno da página de pagamento via URL, resetando dados de frete');
      
      // Verificar se é OF Beauty para usar valores corretos
      const isOfBeauty = tenantId === OF_BEAUTY_TENANT_ID;
      
      // Limpar qualquer dado de frete que possa causar duplicação
      setSelectedShipping('retirada');
      setSelectedShippingData(null);
      setShippingOptions(isOfBeauty ? [
        {
          id: 'retirada',
          name: 'Retirar no local',
          company: 'Retirada',
          price: '3.00',
          delivery_time: 'Imediato',
          custom_price: '3.00'
        },
        {
          id: 'frete_fixo',
          name: 'Frete Fixo - Envio',
          company: 'Envio',
          price: '19.90',
          delivery_time: '5-10 dias úteis',
          custom_price: '19.90'
        }
      ] : [{
        id: 'retirada',
        name: 'Retirada - Retirar na Fábrica', 
        company: 'Retirada',
        price: '0.00',
        delivery_time: 'Imediato',
        custom_price: '0.00'
      }]);
      
      // Limpar cupom de desconto
      setAppliedCoupon(null);
      setCouponDiscount(0);
      setCouponCode('');
      
      // Limpar a URL para evitar que o efeito rode novamente desnecessariamente
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [tenantId]);

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

  useEffect(() => {
    loadActiveGifts();
  }, []);

  // Carregar slug do tenant e URL base para gerar link do checkout público
  useEffect(() => {
    const loadTenantSlugAndBaseUrl = async () => {
      if (!tenantId) return;
      try {
        // Carregar slug do tenant
        const { data: tenantData } = await supabase
          .rpc('get_tenant_by_id', { tenant_id_param: tenantId });
        if (tenantData && tenantData.length > 0) {
          setTenantSlug(tenantData[0].slug);
        }
        
        // Carregar URL base das configurações
        const { data: settingsData } = await supabase
          .from('app_settings')
          .select('public_base_url')
          .single();
        if (settingsData?.public_base_url) {
          setPublicBaseUrl(settingsData.public_base_url);
        }
      } catch (error) {
        console.error('Erro ao carregar dados do tenant:', error);
      }
    };
    loadTenantSlugAndBaseUrl();
  }, [tenantId]);

  useEffect(() => {
    if (activeGifts.length === 0 || !selectedOrder) return;

    const order = selectedOrder || openOrders[0];
    if (!order) return;

    const productsTotal = order.items.reduce((sum: number, item: any) => {
      return sum + (parseFloat(item.unit_price) * item.qty);
    }, 0);

    // Encontrar o brinde elegível (maior valor mínimo que o cliente atingiu)
    const eligible = activeGifts
      .filter(gift => productsTotal >= gift.minimum_purchase_amount)
      .sort((a, b) => b.minimum_purchase_amount - a.minimum_purchase_amount)[0];

    if (eligible) {
      setEligibleGift(eligible);
      setProgressGift(null);
    } else {
      // Encontrar o próximo brinde (menor valor mínimo maior que o total)
      const nextGift = activeGifts
        .filter(gift => productsTotal < gift.minimum_purchase_amount)
        .sort((a, b) => a.minimum_purchase_amount - b.minimum_purchase_amount)[0];

      if (nextGift) {
        const percentageAchieved = (productsTotal / nextGift.minimum_purchase_amount) * 100;
        const percentageMissing = 100 - percentageAchieved;
        setProgressGift({
          ...nextGift,
          percentageAchieved: Math.min(percentageAchieved, 100),
          percentageMissing: Math.max(percentageMissing, 0)
        });
      } else {
        setProgressGift(null);
      }
      setEligibleGift(null);
    }
  }, [selectedOrder, openOrders, activeGifts]);

  const loadOpenOrders = async () => {
    if (!phone) {
      toast({
        title: 'Erro',
        description: 'Informe o telefone do cliente',
        variant: 'destructive'
      });
      return;
    }

    if (!tenantId) {
      toast({
        title: 'Erro - Tenant não identificado',
        description: 'Por favor, selecione uma empresa no modo preview ou acesse via subdomínio correto',
        variant: 'destructive'
      });
      console.error('❌ tenantId não definido. Não é possível carregar pedidos.');
      return;
    }

    console.log('📋 Carregando pedidos para tenant:', tenantId);

    // Normalizar o telefone para busca
    const normalizedPhone = normalizeForStorage(phone);
    
    setLoadingOpenOrders(true);
    
    try {
      // Buscar todos os pedidos não pagos do tenant
      const { data: allOrders, error } = await supabaseTenant
        .from('orders')
        .select('*')
        .eq('is_paid', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filtrar pedidos que correspondem ao telefone normalizado
      const orders = (allOrders || []).filter(order => {
        const orderPhone = normalizeForStorage(order.customer_phone);
        return orderPhone === normalizedPhone;
      });

      if (error) throw error;

      // Load cart items for each order
      const ordersWithItems = await Promise.all(
        (orders || []).map(async (order) => {
          if (!order.cart_id) {
            console.log(`⚠️ Pedido ${order.id} sem cart_id`);
            return { ...order, items: [] };
          }

          console.log(`🔍 Buscando items para pedido ${order.id}, cart_id: ${order.cart_id}, tenant_id: ${tenantId}`);

          // Buscar cart_items do tenant
          const { data: cartItems, error: itemsError } = await supabaseTenant.raw
            .from('cart_items')
            .select('id, qty, unit_price, product_id, tenant_id')
            .eq('cart_id', order.cart_id)
            .eq('tenant_id', tenantId);

          console.log(`📦 Cart items brutos encontrados:`, cartItems?.length || 0, cartItems);

          if (itemsError) {
            console.error(`❌ Erro ao carregar cart items:`, itemsError);
            return { ...order, items: [] };
          }

          if (!cartItems || cartItems.length === 0) {
            console.warn(`⚠️ Nenhum cart item encontrado para cart_id ${order.cart_id}`);
            return { ...order, items: [] };
          }

          // Buscar produtos correspondentes
          const productIds = cartItems.map(item => item.product_id);
          const { data: products, error: productsError } = await supabaseTenant.raw
            .from('products')
            .select('id, name, code, image_url, color, size, tenant_id')
            .in('id', productIds)
            .eq('tenant_id', tenantId);

          console.log(`📦 Produtos encontrados:`, products?.length || 0, products);

          if (productsError) {
            console.error(`❌ Erro ao carregar produtos:`, productsError);
            return { ...order, items: [] };
          }

          // Mapear cart_items com produtos
          const items = (cartItems || []).map(item => {
            const product = (products || []).find(p => p.id === item.product_id);
            console.log(`📦 Item ${item.id}:`, { 
              product_id: item.product_id,
              product_found: !!product,
              product_name: product?.name,
              qty: item.qty,
              unit_price: item.unit_price
            });
            
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

          console.log(`✅ Pedido ${order.id} processado com ${items.length} items`);
          return { ...order, items };
        })
      );

      setOpenOrders(ordersWithItems);
      
      if (orders.length === 0) {
        toast({
          title: 'Nenhum pedido encontrado',
          description: 'Este cliente não possui pedidos em aberto'
        });
      } else {
        // Carregar dados salvos do cliente quando encontrar pedidos
        const loadedCustomerData = await loadCustomerData(normalizeForStorage(phone));
        
        // Verificar se está voltando da página de pagamento
        const urlParams = new URLSearchParams(window.location.search);
        const isReturningFromPayment = urlParams.has('collection_id') || urlParams.has('preference_id') || urlParams.has('payment_id');
        
        // Se carregou dados do cliente com CEP válido E não está voltando do pagamento, calcular frete automaticamente
        if (loadedCustomerData && loadedCustomerData.cep && loadedCustomerData.cep.replace(/[^0-9]/g, '').length === 8 && !isReturningFromPayment) {
          // Sempre calcular frete automaticamente quando há pedidos
          if (ordersWithItems.length >= 1) {
            // Se há apenas um pedido, selecionar e calcular frete
            if (ordersWithItems.length === 1) {
              setTimeout(() => {
                calculateShipping(loadedCustomerData.cep, ordersWithItems[0]);
              }, 500);
            } else {
              // Se há múltiplos pedidos, calcular frete para todos
              ordersWithItems.forEach(order => {
                setTimeout(() => {
                  calculateShipping(loadedCustomerData.cep, order);
                }, 500);
              });
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Error loading open orders:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar pedidos em aberto',
        variant: 'destructive'
      });
    } finally {
      setLoadingOpenOrders(false);
    }
  };

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

  const formatDeliveryTime = (originalTime: string, companyName: string) => {
    if (companyName === 'Retirada') {
      return originalTime;
    }
    
    // Extract number from delivery time (e.g., "5-10" from "5-10 dias")
    const timeMatch = originalTime.match(/(\d+(?:-\d+)?)/);
    if (timeMatch) {
      const deliveryDays = timeMatch[1];
      return `${handlingDays} dias para postagem + ${deliveryDays} dias úteis`;
    }
    
    return `${handlingDays} dias para postagem + ${originalTime}`;
  };

  const filterShippingOptions = (options: any[]) => {
    return options.filter(option => {
      const companyName = option.company?.toLowerCase() || '';
      const serviceName = option.name?.toLowerCase() || '';
      
      // Allow pickup option
      if (option.id === 'retirada') return true;
      
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

  const calculateShipping = async (cep: string, order: Order) => {
    console.log('🚚 Iniciando cálculo de frete...', { 
      cep, 
      order_id: order.id, 
      tenantId,
      hasSupabaseTenant: !!supabaseTenant,
      hasRaw: !!supabaseTenant?.raw,
      hasFunctions: !!supabaseTenant?.raw?.functions
    });
    
    // Proteção inicial
    if (!cep || !order || !tenantId) {
      console.log('⚠️ Dados insuficientes para calcular frete:', { cep, order: !!order, tenantId });
      return;
    }

    if (cep.replace(/[^0-9]/g, '').length !== 8) {
      console.log('⚠️ CEP inválido:', cep);
      return;
    }

    // Verificar se já temos dados de frete salvos para este telefone
    const savedShipping = loadSelectedShippingData(order.customer_phone);
    if (savedShipping && savedShipping.id !== 'retirada') {
      console.log('✅ Dados de frete já salvos, restaurando seleção:', savedShipping);
      setSelectedShipping(savedShipping.id);
      setSelectedShippingData(savedShipping);
      // Continua para recalcular as opções disponíveis
    }
    
    console.log('🚚 Iniciando cálculo de frete para CEP:', cep);
    console.log('📋 Tenant ID:', tenantId);
    console.log('📦 Order items:', order.items);
    
    // Verificar se é OF Beauty (usando constante do escopo do componente)
    const isOfBeauty = tenantId === OF_BEAUTY_TENANT_ID;

    // Definir opções de frete baseadas no tenant
    const fallbackShipping = isOfBeauty ? [
      {
        id: 'retirada',
        name: 'Retirar no local',
        company: 'Retirada',
        price: '3.00',
        delivery_time: 'Imediato',
        custom_price: '3.00'
      },
      {
        id: 'frete_fixo',
        name: 'Frete Fixo - Envio',
        company: 'Envio',
        price: '19.90',
        delivery_time: '5-10 dias úteis',
        custom_price: '19.90'
      }
    ] : [{
      id: 'retirada',
      name: 'Retirada - Retirar na Fábrica',
      company: 'Retirada',
      price: '0.00',
      delivery_time: 'Imediato',
      custom_price: '0.00'
    }];

    setLoadingShipping(true);
    
    // Sempre garantir que há pelo menos as opções de frete padrão
    setShippingOptions(fallbackShipping);
    
    // Salvar opções customizadas do OF Beauty para adicionar junto com Melhor Envio
    const ofBeautyCustomOptions = isOfBeauty ? fallbackShipping : [];
    
    try {
      // Buscar endereço pelo CEP (ViaCEP) - forma segura
      if (cep.replace(/[^0-9]/g, '').length === 8) {
        try {
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
        } catch (cepError) {
          console.error('Error fetching address from ViaCEP:', cepError);
          // Não throw aqui, continua sem os dados do CEP
        }
      }

      // Verificar se supabaseTenant está disponível
      if (!supabaseTenant || !supabaseTenant.raw) {
        console.error('❌ supabaseTenant não disponível');
        console.error('❌ supabaseTenant:', supabaseTenant);
        console.error('❌ supabaseTenant.raw:', supabaseTenant?.raw);
        throw new Error('Sistema de integração não disponível');
      }

      if (!tenantId) {
        console.error('❌ tenantId não definido');
        throw new Error('ID do tenant não identificado');
      }

      console.log('🔍 Testando token Melhor Envio...');
      
      // Testar token primeiro
      const tokenTestResponse = await supabaseTenant.raw.functions.invoke('melhor-envio-test-token', {
        body: { tenant_id: tenantId }
      });
      
      console.log('🧪 Resposta do teste de token:', tokenTestResponse);
      
      if (tokenTestResponse.error) {
        console.error('❌ Erro na função de teste de token:', tokenTestResponse.error);
        throw new Error('Erro ao verificar token do Melhor Envio');
      }

      const tokenTest = tokenTestResponse.data;
      if (!tokenTest?.valid) {
        console.error('❌ Token inválido:', tokenTest);
        throw new Error(tokenTest?.error || 'Token do Melhor Envio inválido ou expirado');
      }
      
      console.log('✅ Token válido, calculando frete...');

      // Preparar dados do produto de forma segura
      const products = order.items.map(item => ({
        id: String(item.id || Math.random()),
        width: 16,
        height: 2,
        length: 20,
        weight: 0.3,
        insurance_value: Number(item.unit_price) || 1,
        quantity: Number(item.qty) || 1
      }));
      
      console.log('📦 Produtos preparados:', products);
      
      // Calcular frete
      console.log('📡 Enviando dados para cálculo de frete...');
      const shippingResponse = await supabaseTenant.raw.functions.invoke('melhor-envio-shipping', {
        body: {
          to_postal_code: cep.replace(/[^0-9]/g, ''),
          tenant_id: tenantId,
          products: products
        }
      });

      console.log('📡 Resposta da função de frete:', shippingResponse);

      if (shippingResponse.error) {
        console.error('❌ Erro na função de frete:', shippingResponse.error);
        throw new Error('Erro ao calcular frete');
      }

      const data = shippingResponse.data;
      if (data && data.success && data.shipping_options && Array.isArray(data.shipping_options)) {
        // Log para debug da estrutura de dados
        console.log('📊 Estrutura dos dados de frete recebidos:', data.shipping_options.slice(0, 2));
        
        // Processar opções de frete de forma segura
        const validOptions = data.shipping_options
          .filter((option: any) => option && !option.error && option.price)
          .map((option: any) => {
            console.log('🔧 Processando opção:', {
              service_id: option.service_id,
              id: option.id,
              service_name: option.service_name,
              name: option.name,
              company: option.company,
              company_type: typeof option.company,
              company_name: option.company?.name // Testa se company é objeto
            });
            
            return {
              id: String(option.service_id || option.id || Math.random()),
              name: String(option.service_name || option.name || 'Transportadora'),
              company: String(option.company?.name || option.company || 'Melhor Envio'),
              price: parseFloat(option.price || option.custom_price || 0).toFixed(2),
              delivery_time: String(option.delivery_time || option.custom_delivery_time || '5-10 dias'),
              custom_price: parseFloat(option.custom_price || option.price || 0).toFixed(2)
            };
          });

        if (validOptions.length > 0) {
          // Filter shipping options to show only desired services
          const filteredOptions = filterShippingOptions(validOptions);
          // Para OF Beauty, adiciona as opções customizadas (retirada R$3 + frete fixo R$19.90) junto com Melhor Envio
          // Para outros tenants, usa apenas a retirada grátis + Melhor Envio
          const baseOptions = isOfBeauty ? ofBeautyCustomOptions : [{
            id: 'retirada',
            name: 'Retirada - Retirar na Fábrica',
            company: 'Retirada',
            price: '0.00',
            delivery_time: 'Imediato',
            custom_price: '0.00'
          }];
          const allOptions = [...baseOptions, ...filteredOptions];
          setShippingOptions(allOptions);
          
          console.log('✅ Opções de frete filtradas:', filteredOptions.length);
          toast({
            title: 'Frete calculado',
            description: `${filteredOptions.length + baseOptions.length} opções de frete encontradas`,
          });
        } else {
          console.log('⚠️ Nenhuma opção válida retornada');
          toast({
            title: 'Frete não disponível',
            description: isOfBeauty ? 'Opções de frete fixo disponíveis' : 'Apenas retirada disponível para este CEP',
          });
        }
      } else {
        console.log('⚠️ Resposta inválida da API de frete');
        toast({
          title: 'Frete não disponível',
          description: 'Apenas retirada disponível para este CEP',
        });
      }
    } catch (error) {
      console.error('❌ Erro no cálculo de frete:', error);
      console.error('❌ Tipo do erro:', typeof error);
      console.error('❌ Stack do erro:', error?.stack);
      
      // Extrair mensagem de erro de forma segura
      let errorMessage = 'Não foi possível calcular o frete';
      try {
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        }
      } catch {
        // Se der erro até aqui, usa mensagem padrão
      }
      
      // Mostrar toast de erro de forma segura
      try {
        if (errorMessage.includes('inválido') || errorMessage.includes('expirado') || errorMessage.includes('Unauthenticated')) {
          toast({
            title: 'Token Expirado',
            description: 'É necessário reconfigurar a integração do Melhor Envio',
            variant: 'destructive'
          });
        } else {
          toast({
            title: 'Aviso',
            description: 'Apenas retirada disponível para este CEP',
          });
        }
      } catch (toastError) {
        console.error('❌ Erro ao mostrar toast:', toastError);
      }
    } finally {
      setLoadingShipping(false);
    }
  };

  const saveCustomerData = async (customerPhone: string, data: any) => {
    try {
      // Salvar no banco de dados
      const customerRecord = {
        phone: customerPhone,
        name: data.name,
        email: data.email,
        cpf: data.cpf,
        cep: data.cep,
        street: data.street,
        number: data.number,
        complement: data.complement,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
      };

      await supabaseTenant
        .from('customers')
        .upsert(customerRecord, { onConflict: 'phone' });

      // Salvar no localStorage
      localStorage.setItem(`customer_${customerPhone}`, JSON.stringify(data));
      
      toast({
        title: 'Dados salvos',
        description: 'Dados do cliente salvos com sucesso'
      });
    } catch (error) {
      console.error('Error saving customer data:', error);
    }
  };

  // Função para salvar/carregar dados do frete selecionado
  const saveSelectedShippingData = (phone: string, shippingData: any) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`shipping_${phone}`, JSON.stringify(shippingData));
    }
  };

  const loadSelectedShippingData = (phone: string) => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`shipping_${phone}`);
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  };

  // Função para atualizar frete selecionado
  const handleShippingChange = (shippingId: string, orderPhone: string) => {
    setSelectedShipping(shippingId);
    
    if (shippingId === 'retirada') {
      const retiradaData = {
        id: 'retirada',
        name: 'Retirada - Retirar na Fábrica',
        company: 'Retirada',
        price: '0.00',
        delivery_time: 'Imediato'
      };
      setSelectedShippingData(retiradaData);
      saveSelectedShippingData(orderPhone, retiradaData);
    } else {
      const selectedOption = shippingOptions.find(opt => opt.id === shippingId);
      if (selectedOption) {
        const shippingData = {
          id: selectedOption.id,
          name: selectedOption.name,
          company: selectedOption.company,
          price: selectedOption.custom_price || selectedOption.price,
          delivery_time: selectedOption.delivery_time
        };
        setSelectedShippingData(shippingData);
        saveSelectedShippingData(orderPhone, shippingData);
      }
    }
  };

  const loadCustomerData = async (customerPhone: string) => {
  // Verificar se o usuário está voltando da página de pagamento
    const urlParams = new URLSearchParams(window.location.search);
    const isReturningFromPayment = urlParams.has('collection_id') || urlParams.has('preference_id') || urlParams.has('payment_id');
    
    // Se está voltando do pagamento, limpar dados de frete salvos para evitar duplicação
    if (isReturningFromPayment) {
      console.log('🔄 Detectado retorno da página de pagamento, limpando dados de frete salvos');
      localStorage.removeItem(`shipping_${customerPhone}`);
      setSelectedShipping('retirada');
      setSelectedShippingData(null);
      setShippingOptions([{
        id: 'retirada',
        name: 'Retirada - Retirar na Fábrica',
        company: 'Retirada',
        price: '0.00',
        delivery_time: 'Imediato',
        custom_price: '0.00'
      }]);
    } else {
      // Carregar dados do frete salvos apenas se não estiver voltando do pagamento
      const savedShipping = loadSelectedShippingData(customerPhone);
      if (savedShipping) {
        setSelectedShipping(savedShipping.id);
        setSelectedShippingData(savedShipping);
        console.log('✅ Dados de frete carregados:', savedShipping);
      }
    }

    try {
      // Tentar carregar do banco primeiro
      const { data: customer } = await supabaseTenant
        .from('customers')
        .select('*')
        .eq('phone', customerPhone)
        .maybeSingle();

      if (customer) {
        const customerDataLoaded = {
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
        };
        
        setCustomerData(customerDataLoaded);
        
        toast({
          title: 'Dados carregados',
          description: 'Dados salvos do cliente foram carregados automaticamente'
        });
        
        return customerDataLoaded;
      }

      // Se não encontrou no banco, tentar localStorage
      const savedData = localStorage.getItem(`customer_${customerPhone}`);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        setCustomerData(parsedData);
        
        toast({
          title: 'Dados carregados',
          description: 'Dados locais do cliente foram carregados automaticamente'
        });
        
        return parsedData;
      }
      
      return null;
    } catch (error) {
      console.error('Error loading customer data:', error);
      // Se deu erro, tentar localStorage
      const savedData = localStorage.getItem(`customer_${customerPhone}`);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        setCustomerData(parsedData);
        
        toast({
          title: 'Dados carregados',
          description: 'Dados locais do cliente foram carregados automaticamente'
        });
        
        return parsedData;
      }
      
      return null;
    }
  };

  const applyCoupon = async (order: Order) => {
    if (!couponCode.trim()) {
      toast({
        title: 'Erro',
        description: 'Digite um código de cupom',
        variant: 'destructive'
      });
      return;
    }

    setLoadingCoupon(true);
    try {
      // Buscar cupom no banco
      const { data: coupon, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', couponCode.toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (!coupon) {
        toast({
          title: 'Cupom Inválido',
          description: 'Cupom não encontrado ou inativo',
          variant: 'destructive'
        });
        return;
      }

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

      // Calcular total dos produtos
      const productsTotal = order.items.reduce((sum, item) => {
        return sum + (Number(item.unit_price) * item.qty);
      }, 0);

      let discount = 0;

      // Calcular desconto baseado no tipo
      if (coupon.discount_type === 'progressive') {
        // Desconto progressivo
        const tiers = coupon.progressive_tiers as Array<{min_value: number, max_value: number | null, discount: number}>;
        const applicableTier = tiers.find(tier => {
          if (tier.max_value === null) {
            return productsTotal >= tier.min_value;
          }
          return productsTotal >= tier.min_value && productsTotal <= tier.max_value;
        });

        if (applicableTier) {
          discount = (productsTotal * applicableTier.discount) / 100;
        }
      } else if (coupon.discount_type === 'percentage') {
        discount = (productsTotal * coupon.discount_value) / 100;
      } else if (coupon.discount_type === 'fixed') {
        discount = Math.min(coupon.discount_value, productsTotal);
      }

      setAppliedCoupon(coupon);
      setCouponDiscount(discount);

      toast({
        title: 'Cupom Aplicado!',
        description: `Desconto de ${formatCurrency(discount)} aplicado`,
      });
    } catch (error: any) {
      console.error('Erro ao aplicar cupom:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao aplicar cupom',
        variant: 'destructive'
      });
    } finally {
      setLoadingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponCode('');
    toast({
      title: 'Cupom Removido',
      description: 'O cupom foi removido do pedido'
    });
  };

  const processPayment = async (order: Order) => {
    if (!tenantId) {
      toast({
        title: 'Erro',
        description: 'Tenant não identificado',
        variant: 'destructive'
      });
      return;
    }

    if (!customerData.name) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe seu nome para finalizar o pedido',
        variant: 'destructive'
      });
      return;
    }

    if (!customerData.cpf) {
      toast({
        title: 'CPF obrigatório',
        description: 'Informe seu CPF para finalizar o pedido',
        variant: 'destructive'
      });
      return;
    }

    // Validação completa de endereço para entregas (não retirada)
    if (selectedShipping !== 'retirada') {
      const missingFields: string[] = [];
      if (!customerData.name) missingFields.push('Nome');
      if (!customerData.cep) missingFields.push('CEP');
      if (!customerData.street) missingFields.push('Rua');
      if (!customerData.number) missingFields.push('Número');
      if (!customerData.neighborhood) missingFields.push('Bairro');
      if (!customerData.city) missingFields.push('Cidade');
      if (!customerData.state) missingFields.push('Estado');

      if (missingFields.length > 0) {
        toast({
          title: 'Endereço incompleto',
          description: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
          variant: 'destructive'
        });
        return;
      }
    }

    // Salvar dados do cliente
    await saveCustomerData(order.customer_phone, customerData);

    setLoadingPayment(true);

    try {
      // Calcular valor do frete
      let shippingCost = 0;
      if (selectedShipping !== 'retirada') {
        const selectedOption = shippingOptions.find(opt => opt.id === selectedShipping);
        shippingCost = selectedOption ? parseFloat(selectedOption.custom_price || selectedOption.price) : 0;
      }

      // Calcular total com desconto do cupom
      const productsTotal = Number(order.total_amount);
      const totalWithDiscount = Math.max(0, productsTotal - couponDiscount);
      const totalAmount = totalWithDiscount + shippingCost;

      // Incrementar uso do cupom se aplicado
      if (appliedCoupon) {
        const { error: couponError } = await supabase
          .from('coupons')
          .update({ used_count: appliedCoupon.used_count + 1 })
          .eq('id', appliedCoupon.id);
        
        if (couponError) {
          console.error('Erro ao atualizar contador do cupom:', couponError);
        }
      }

      // Preparar dados do frete selecionado
      let shippingData = null;
      if (selectedShipping !== 'retirada') {
        const selectedOption = shippingOptions.find(opt => opt.id === selectedShipping);
        if (selectedOption) {
          shippingData = {
            service_id: selectedOption.id,
            service_name: selectedOption.name,
            company_name: selectedOption.company, // Corrigido: remover .name
            price: parseFloat(selectedOption.custom_price || selectedOption.price),
            delivery_time: selectedOption.delivery_time,
            additional_services: selectedOption.additional_services
          };
        }
      }

      // Preparar dados no formato esperado pela edge function
      const paymentData = {
        order_id: order.id, // Enviar o ID do pedido específico
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
        shippingData: shippingData, // Informações detalhadas do frete
        total: totalAmount.toString(),
        coupon_discount: couponDiscount,
        coupon_code: appliedCoupon?.code || null,
        tenant_id: tenantId
      };

      console.log('Calling create-payment with data:', paymentData);

      // Criar pagamento no Mercado Pago
      const { data, error } = await supabaseTenant.raw.functions.invoke('create-payment', {
        body: paymentData
      });

      if (error) {
        console.error('Payment error:', error);
        throw error;
      }

      console.log('Payment response:', data);

      if (data && (data.init_point || data.sandbox_init_point)) {
        // Redirecionar diretamente para o checkout do Mercado Pago
        const paymentUrl = data.init_point || data.sandbox_init_point;
        
        // Redirecionar diretamente para o checkout transparente do Mercado Pago
        window.location.href = paymentUrl;
        
        toast({
          title: 'Redirecionando para pagamento',
          description: 'Você será redirecionado para finalizar o pagamento'
        });

        // Limpar dados após criar o pagamento apenas se o pagamento foi bem-sucedido
        // Não limpar os dados do frete para evitar recálculo
        setCustomerData({
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
        // NÃO limpar shippingOptions e selectedShipping para manter os dados

      } else if (data && data.free_order) {
        toast({
          title: 'Pedido confirmado',
          description: 'Pedido gratuito processado com sucesso!'
        });
      } else {
        throw new Error('Resposta inválida do servidor');
      }

    } catch (error: any) {
      console.error('Error processing payment:', error);
      toast({
        title: 'Erro no pagamento',
        description: error.message || 'Não foi possível processar o pagamento. Tente novamente.',
        variant: 'destructive'
      });
    } finally {
      setLoadingPayment(false);
    }
  };

  const finalizarPedido = (orderId: number) => {
    // Navegar para a mesma página mas com foco no pedido específico
    window.location.href = `/checkout?pedido=${orderId}`;
  };

  const loadCustomerHistory = async () => {
    if (!phone) {
      toast({
        title: 'Erro',
        description: 'Informe o telefone do cliente',
        variant: 'destructive'
      });
      return;
    }

    if (!tenantId) {
      toast({
        title: 'Erro',
        description: 'Tenant não identificado',
        variant: 'destructive'
      });
      return;
    }

    const normalizedPhone = normalizeForStorage(phone);
    setLoadingHistory(true);
    
    try {
      // Buscar pedidos pagos - usando raw para evitar problemas com wrapper
      const { data: allOrders, error } = await supabaseTenant.raw
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_paid', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filtrar pelo telefone normalizado
      const orders = (allOrders || []).filter(order => {
        const orderPhone = normalizeForStorage(order.customer_phone);
        return orderPhone === normalizedPhone;
      });

      // Load cart items for each order
      const ordersWithItems = await Promise.all(
        (orders || []).map(async (order) => {
          if (!order.cart_id) {
            console.log(`⚠️ Histórico: Pedido ${order.id} sem cart_id`);
            return { ...order, items: [] };
          }

          console.log(`🔍 Histórico: Buscando items para pedido ${order.id}, cart_id: ${order.cart_id}`);

          // Buscar cart_items usando raw
          const { data: cartItems, error: itemsError } = await supabaseTenant.raw
            .from('cart_items')
            .select('id, qty, unit_price, product_id, tenant_id')
            .eq('cart_id', order.cart_id)
            .eq('tenant_id', tenantId);

          console.log(`📦 Histórico: Cart items encontrados:`, cartItems?.length || 0);

          if (itemsError) {
            console.error('Error loading cart items:', itemsError);
            return { ...order, items: [] };
          }

          if (!cartItems || cartItems.length === 0) {
            console.warn(`⚠️ Nenhum cart item encontrado para cart_id ${order.cart_id}`);
            return { ...order, items: [] };
          }

          // Buscar produtos correspondentes
          const productIds = cartItems.map(item => item.product_id);
          const { data: products, error: productsError } = await supabaseTenant.raw
            .from('products')
            .select('id, name, code, image_url, color, size, tenant_id')
            .in('id', productIds)
            .eq('tenant_id', tenantId);

          console.log(`📦 Histórico: Produtos encontrados:`, products?.length || 0);

          if (productsError) {
            console.error('Error loading products:', productsError);
            return { ...order, items: [] };
          }

          // Mapear cart_items com produtos
          const items = (cartItems || []).map(item => {
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

          console.log(`✅ Histórico: Pedido ${order.id} processado com ${items.length} items`);
          return { ...order, items };
        })
      );

      setCustomerOrders(ordersWithItems);
      setActiveView('history');
      
      if (orders.length === 0) {
        toast({
          title: 'Nenhum pedido encontrado',
          description: 'Este cliente não possui histórico de pedidos'
        });
      }
    } catch (error: any) {
      console.error('Error loading order history:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar histórico de pedidos',
        variant: 'destructive'
      });
    } finally {
      setLoadingHistory(false);
    }
  };

  const renderCheckoutView = () => (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Checkout</h2>
        <p className="text-muted-foreground">Processe pagamentos e finalize pedidos</p>
      </div>


      {/* Alerta quando não há tenant selecionado no modo preview */}
      {!tenantId && (
        <Alert className="mb-6 mt-4 border-orange-500 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-900">
            <strong>Modo Preview:</strong> Você precisa selecionar uma empresa no seletor acima para visualizar e processar pedidos. 
            Os dados mostrados serão referentes à empresa selecionada.
          </AlertDescription>
        </Alert>
      )}

      {/* Link do Checkout Público */}
      {tenantSlug && (
        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm">
                <ExternalLink className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Link do checkout para clientes:</span>
                <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
                  {publicBaseUrl}/t/{tenantSlug}/checkout
                </code>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(`${publicBaseUrl}/t/${tenantSlug}/checkout`);
                  toast({ title: 'Link copiado!', description: 'Envie para seus clientes finalizarem os pedidos' });
                }}
              >
                <Copy className="h-4 w-4 mr-1" />
                Copiar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Search className="h-5 w-5 mr-2" />
            Buscar Pedidos em Aberto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="digite seu telefone completo incluindo o DDD"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1"
            />
            <Button onClick={loadOpenOrders} disabled={loadingOpenOrders}>
              {loadingOpenOrders ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Buscar Pedidos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Área de pedidos encontrados */}
      <div className="mt-8">        
        {/* Seleção de pedidos quando há múltiplos pedidos */}
        {openOrders.length > 1 && !selectedOrder && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <ShoppingCart className="h-5 w-5 mr-2" />
                Selecione o Pedido para Finalizar
              </CardTitle>
              <CardDescription>
                Este cliente possui {openOrders.length} pedidos em aberto. Selecione qual deseja finalizar:
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                 {openOrders.map((order) => (
                  <div key={order.id} className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors" 
                       onClick={() => setSelectedOrder(order)}>
                    <div className="flex justify-between items-center">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary">Pedido #{order.id}</Badge>
                          <Badge variant="outline">{order.event_type}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                          <div>
                            <span className="font-medium">Data:</span> {new Date(order.event_date).toLocaleDateString('pt-BR')}
                          </div>
                          <div>
                            <span className="font-medium">Total:</span> {formatCurrency(order.total_amount)}
                          </div>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Items:</span> {order.items.length} produto(s)
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary">{formatCurrency(order.total_amount)}</div>
                        <div className="text-sm text-muted-foreground">{order.items.length} item(s)</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 flex justify-end space-x-4">
                <Button variant="outline" onClick={() => {
                  setOpenOrders([]);
                  // Limpar cupom ao cancelar
                  setAppliedCoupon(null);
                  setCouponDiscount(0);
                  setCouponCode('');
                }}>
                  Cancelar
                </Button>
                <Button 
                  onClick={() => selectedOrder && setSelectedOrder(selectedOrder)} 
                  disabled={!selectedOrder}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Finalizar Pedido Selecionado
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Checkout único pedido ou pedido selecionado */}
        {((openOrders.length === 1 && !selectedOrder) || selectedOrder) && (
          (() => {
            const order = selectedOrder || openOrders[0];
            return (
              <Card className="hover:shadow-lg transition-shadow border-2 border-orange-200">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg flex items-center">
                        Pedido #{order.id}
                        <Badge variant="outline" className="ml-2 bg-orange-100 text-orange-800 border-orange-200">
                          {order.event_type}
                        </Badge>
                        {openOrders.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedOrder(null);
                              // Limpar cupom ao voltar para seleção de pedido
                              setAppliedCoupon(null);
                              setCouponDiscount(0);
                              setCouponCode('');
                            }}
                            className="ml-4"
                          >
                            <ArrowLeft className="h-4 w-4 mr-1" />
                            Voltar
                          </Button>
                        )}
                      </CardTitle>
                      <CardDescription>
                        Data: {new Date(order.event_date).toLocaleDateString('pt-BR')} • {order.event_type}
                      </CardDescription>
                      <div className="mt-2">
                        <p className="text-sm font-medium">Produtos do Pedido:</p>
                        {order.items.map((item, index) => (
                          <div key={index} className="flex items-center mt-2 p-2 bg-gray-50 rounded">
                            <div className="w-10 h-10 mr-3 flex-shrink-0">
                              <ZoomableImage
                                src={item.image_url || ''}
                                alt={item.product_name}
                                className="w-10 h-10"
                                containerClassName="w-10 h-10 rounded"
                                fallback={
                                  <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                                    <ShoppingCart className="h-5 w-5 text-gray-400" />
                                  </div>
                                }
                              />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{item.product_code} - {item.product_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Quantidade: {item.qty} • Preço unitário: {formatCurrency(item.unit_price)}
                                {(item.color || item.size) && (
                                  <> • {item.color && `Cor: ${item.color}`}{item.color && item.size && ' | '}{item.size && `Tam: ${item.size}`}</>
                                )}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold">{formatCurrency(item.qty * Number(item.unit_price))}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Brinde Elegível */}
                      {eligibleGift && (
                        <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-2 border-green-500 rounded-lg animate-fade-in">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                              <Gift className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-green-700 dark:text-green-400">
                                  🎉 Parabéns! Você ganhou um brinde
                                </h4>
                                <Badge variant="secondary" className="bg-green-600 text-white">
                                  GRÁTIS
                                </Badge>
                              </div>
                              <p className="text-sm font-medium text-green-900 dark:text-green-300 mt-1">
                                {eligibleGift.name}
                              </p>
                              {eligibleGift.description && (
                                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                                  {eligibleGift.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Progresso para Próximo Brinde */}
                      {progressGift && (
                        <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-200 dark:border-purple-800 rounded-lg animate-fade-in">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center flex-shrink-0">
                              <Gift className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-purple-900 dark:text-purple-300">
                                Falta {progressGift.percentageMissing.toFixed(0)}% para você ganhar{" "}
                                <span className="font-bold">{progressGift.name}</span>
                              </p>
                              {progressGift.description && (
                                <p className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">
                                  {progressGift.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="relative">
                            <Progress 
                              value={progressGift.percentageAchieved} 
                              className="h-3 bg-purple-100 dark:bg-purple-900/50"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xs font-bold text-white drop-shadow-md">
                                {progressGift.percentageAchieved.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-center text-purple-600 dark:text-purple-400 mt-2">
                            Compre mais R$ {(progressGift.minimum_purchase_amount - order.items.reduce((sum: number, item: any) => sum + (parseFloat(item.unit_price) * item.qty), 0)).toFixed(2)}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-primary">R$ {Number(order.total_amount).toFixed(2)}</div>
                      <div className="text-sm text-muted-foreground">{order.items.length} item(ns)</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Dados do Cliente */}
                  <div className="mb-6">
                    <h4 className="font-medium mb-4 flex items-center">
                      <User className="h-4 w-4 mr-2" />
                      Dados do Cliente
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block">Nome Completo *</label>
                        <Input
                          placeholder="Nome completo do cliente"
                          value={customerData.name}
                          onChange={(e) => {
                            const newData = {...customerData, name: e.target.value};
                            setCustomerData(newData);
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Email</label>
                        <Input
                          type="email"
                          placeholder="email@exemplo.com"
                          value={customerData.email}
                          onChange={(e) => {
                            const newData = {...customerData, email: e.target.value};
                            setCustomerData(newData);
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">CPF *</label>
                        <Input
                          placeholder="000.000.000-00"
                          value={customerData.cpf}
                          onChange={(e) => {
                            const formatted = formatCPF(e.target.value);
                            setCustomerData({...customerData, cpf: formatted});
                          }}
                          maxLength={14}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Endereço de Entrega */}
                  <div className="mb-6">
                    <h4 className="font-medium mb-4 flex items-center">
                      <MapPin className="h-4 w-4 mr-2" />
                      Endereço de Entrega
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-1">
                        <label className="text-sm font-medium mb-1 block">CEP</label>
                         <div className="flex gap-2">
                           <Input
                             placeholder="00000-000"
                             value={customerData.cep}
                             onChange={(e) => {
                               const newCep = e.target.value;
                               setCustomerData({...customerData, cep: newCep});
                               if (newCep.replace(/[^0-9]/g, '').length === 8) {
                                 calculateShipping(newCep, order);
                               }
                             }}
                             onBlur={(e) => {
                               const cep = e.target.value;
                               if (cep && cep.replace(/[^0-9]/g, '').length === 8) {
                                 calculateShipping(cep, order);
                               }
                             }}
                           />
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => calculateShipping(customerData.cep, order)}
                            disabled={loadingShipping}
                          >
                            {loadingShipping ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Truck className="h-4 w-4" />
                            )}
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

                  {/* Opções de Frete */}
                  <div className="mb-6">
                    <h4 className="font-medium mb-4 flex items-center">
                      <Truck className="h-4 w-4 mr-2" />
                      Opções de Frete
                    </h4>
                    
                    <div className="space-y-2">
                      {shippingOptions.length > 0 ? shippingOptions.map((option) => (
                        <div key={option.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                          <div>
                             <input 
                               type="radio" 
                               id={`${option.id}-${order.id}`} 
                               name={`frete-${order.id}`} 
                               value={option.id}
                               checked={selectedShipping === option.id}
                               onChange={(e) => handleShippingChange(e.target.value, order.customer_phone)}
                               className="mr-3" 
                             />
                            <label htmlFor={`${option.id}-${order.id}`} className="font-medium">
                              {option.name}
                            </label>
                            <p className="text-sm text-muted-foreground ml-6">
                              {option.company} - {formatDeliveryTime(option.delivery_time, option.company)}
                            </p>
                          </div>
                          <span className="font-bold">
                            R$ {parseFloat(option.custom_price || option.price).toFixed(2)}
                          </span>
                        </div>
                      )) : (
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                             <input 
                               type="radio" 
                               id={`retirada-${order.id}`} 
                               name={`frete-${order.id}`} 
                               value="retirada"
                               checked={selectedShipping === 'retirada'}
                               onChange={(e) => handleShippingChange(e.target.value, order.customer_phone)}
                               className="mr-3" 
                             />
                            <label htmlFor={`retirada-${order.id}`} className="font-medium">
                              Retirada - Retirar na Fábrica
                            </label>
                             <p className="text-sm text-muted-foreground ml-6">
                               Disponível em {handlingDays} dias úteis
                             </p>
                          </div>
                          <span className="font-bold">R$ 0,00</span>
                        </div>
                      )}
                    </div>

                    {customerData.cep && shippingOptions.length === 0 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Insira um CEP válido para calcular as opções de frete
                      </p>
                    )}
                   </div>

                   {/* Informações de Frete */}
                   {selectedShippingData && (
                     <div className="mb-6">
                       <h4 className="font-medium mb-4 flex items-center">
                         <Package className="h-4 w-4 mr-2" />
                         Informações de Frete
                       </h4>
                       <Card>
                         <CardContent className="p-4">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                             <div>
                               <strong>Transportadora:</strong> {selectedShippingData.company}
                             </div>
                             <div>
                               <strong>Serviço:</strong> {selectedShippingData.name}
                             </div>
                             <div>
                               <strong>Valor do Frete:</strong> R$ {parseFloat(selectedShippingData.price).toFixed(2)}
                             </div>
                              <div>
                                <strong>Prazo:</strong> {formatDeliveryTime(selectedShippingData.delivery_time, selectedShippingData.company)}
                              </div>
                           </div>
                         </CardContent>
                       </Card>
                     </div>
                   )}

                   {/* Resumo e Finalização */}
                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-lg font-medium">Total do Pedido:</span>
                       <span className="text-xl font-bold">R$ {(() => {
                         // Calcular apenas o total dos produtos
                         const productsTotal = order.items.reduce((sum: number, item: any) => {
                           return sum + (parseFloat(item.unit_price) * item.qty);
                         }, 0);
                         return productsTotal.toFixed(2);
                       })()}</span>
                    </div>
                    
                    {selectedShipping !== 'retirada' && (
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-lg font-medium">Frete:</span>
                        <span className="text-xl font-bold">
                          R$ {(() => {
                            const selectedOption = shippingOptions.find(opt => opt.id === selectedShipping);
                            return selectedOption ? parseFloat(selectedOption.custom_price || selectedOption.price).toFixed(2) : '0.00';
                          })()}
                        </span>
                      </div>
                    )}

                    {/* Campo de Cupom de Desconto */}
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <h4 className="font-medium mb-3 flex items-center">
                        <Percent className="h-4 w-4 mr-2 text-green-600" />
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
                            onClick={() => applyCoupon(order)}
                            disabled={loadingCoupon || !couponCode.trim()}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {loadingCoupon ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Aplicar'
                            )}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-3 bg-white border border-green-300 rounded">
                            <div>
                              <Badge className="bg-green-600">{appliedCoupon.code}</Badge>
                              <p className="text-sm text-muted-foreground mt-1">
                                {appliedCoupon.discount_type === 'progressive' ? 'Desconto Progressivo' :
                                 appliedCoupon.discount_type === 'percentage' ? `${appliedCoupon.discount_value}% de desconto` :
                                 `R$ ${appliedCoupon.discount_value.toFixed(2)} de desconto`}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={removeCoupon}
                              className="text-red-600 hover:text-red-700"
                            >
                              Remover
                            </Button>
                          </div>
                          <div className="flex justify-between items-center text-green-700 font-semibold">
                            <span>Desconto Aplicado:</span>
                            <span>- R$ {couponDiscount.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center mb-6 text-xl font-bold border-t pt-4">
                      <span>Total Geral:</span>
                      <span className="text-green-600">
                         R$ {(() => {
                           // Calcular o total dos produtos (sem frete)
                           const productsTotal = order.items.reduce((sum: number, item: any) => {
                             return sum + (parseFloat(item.unit_price) * item.qty);
                           }, 0);
                          
                          // Subtrair desconto do cupom
                          let total = productsTotal - couponDiscount;
                          
                          // Adicionar frete apenas se não for retirada
                          if (selectedShipping !== 'retirada') {
                            const selectedOption = shippingOptions.find(opt => opt.id === selectedShipping);
                            total += selectedOption ? parseFloat(selectedOption.custom_price || selectedOption.price) : 0;
                          }
                          return Math.max(0, total).toFixed(2);
                        })()}
                      </span>
                    </div>

                    <Button 
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 text-lg"
                      onClick={() => processPayment(order)}
                      disabled={loadingPayment}
                    >
                      {loadingPayment ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CreditCard className="h-4 w-4 mr-2" />
                      )}
                      Finalizar Pedido - Mercado Pago
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })()
        )}
        
        {/* Mensagem quando não há pedidos */}
        {openOrders.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            Use a busca acima para encontrar pedidos em aberto
          </div>
        )}
      </div>
    </div>
  );

  const renderHistoryView = () => (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Histórico de Pedidos</h2>
        <Button onClick={() => setActiveView('dashboard')} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Buscar Histórico por Telefone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Telefone do cliente"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1"
            />
            <Button onClick={loadCustomerHistory} disabled={loadingHistory}>
              {loadingHistory ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {customerOrders.length > 0 && (
        <div className="space-y-4">
          {customerOrders.map((order) => (
            <Card key={order.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">Pedido #{order.id}</CardTitle>
                    <CardDescription>
                      {new Date(order.event_date).toLocaleDateString('pt-BR')} • {order.event_type}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">R$ {Number(order.total_amount).toFixed(2)}</div>
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      Pago
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground">
                    {order.items.length} {order.items.length === 1 ? 'produto' : 'produtos'}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedHistoryOrder(order)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Ver Produtos
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedHistoryOrder && (
        <Card className="mt-6 border-2 border-primary">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Produtos do Pedido #{selectedHistoryOrder.id}</CardTitle>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedHistoryOrder(null)}
              >
                Fechar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {selectedHistoryOrder.items.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-4 border border-border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border border-border">
                        <ZoomableImage
                          src={item.image_url || ''}
                          alt={item.product_name}
                          className="w-16 h-16"
                          containerClassName="w-16 h-16"
                          fallback={
                            <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                              <ShoppingCart className="h-6 w-6 text-muted-foreground" />
                            </div>
                          }
                        />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground">{item.product_name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Código: {item.product_code || 'N/A'}
                          {(item.color || item.size) && (
                            <> • {item.color && `Cor: ${item.color}`}{item.color && item.size && ' | '}{item.size && `Tam: ${item.size}`}</>
                          )}
                        </p>
                      </div>
                    </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {item.qty}x R$ {Number(item.unit_price).toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Total: R$ {(item.qty * Number(item.unit_price)).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
              <Separator />
              <div className="text-right">
                <div className="text-lg font-bold">
                  Total do Pedido: R$ {Number(selectedHistoryOrder.total_amount).toFixed(2)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // Renderizar diretamente o checkout com histórico integrado
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        {renderCheckoutView()}
        
        {/* Seção de Histórico de Pedidos Pagos */}
        <div className="max-w-4xl mx-auto mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="h-5 w-5 mr-2" />
                Histórico de Pedidos Pagos
              </CardTitle>
              <CardDescription>
                Visualize os pedidos já finalizados deste cliente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-6">
                <Input
                  placeholder="Telefone do cliente"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={loadCustomerHistory} disabled={loadingHistory}>
                  {loadingHistory ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Buscar Histórico
                </Button>
              </div>

              {customerOrders.length > 0 && (
                <div className="space-y-4">
                  {customerOrders.map((order) => (
                    <div key={order.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">Pedido #{order.id}</span>
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              Pago
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {new Date(order.event_date).toLocaleDateString('pt-BR')} • {order.event_type}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">R$ {Number(order.total_amount).toFixed(2)}</div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setSelectedHistoryOrder(order)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver Produtos
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {customerOrders.length === 0 && phone && !loadingHistory && (
                <div className="text-center py-4 text-muted-foreground">
                  Nenhum pedido pago encontrado para este telefone
                </div>
              )}
            </CardContent>
          </Card>

          {selectedHistoryOrder && (
            <Card className="mt-6 border-2 border-primary">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Produtos do Pedido #{selectedHistoryOrder.id}</CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedHistoryOrder(null)}
                  >
                    Fechar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedHistoryOrder.items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-4 border border-border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                      <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border border-border">
                          <ZoomableImage
                            src={item.image_url || ''}
                            alt={item.product_name}
                            className="w-16 h-16"
                            containerClassName="w-16 h-16"
                            fallback={
                              <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                                <ShoppingCart className="h-6 w-6 text-muted-foreground" />
                              </div>
                            }
                          />
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground">{item.product_name}</h4>
                          <p className="text-sm text-muted-foreground">
                            Código: {item.product_code || 'N/A'}
                            {(item.color || item.size) && (
                              <> • {item.color && `Cor: ${item.color}`}{item.color && item.size && ' | '}{item.size && `Tam: ${item.size}`}</>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          {item.qty}x R$ {Number(item.unit_price).toFixed(2)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Total: R$ {(item.qty * Number(item.unit_price)).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                  <Separator />
                  <div className="text-right">
                    <div className="text-lg font-bold">
                      Total do Pedido: R$ {Number(selectedHistoryOrder.total_amount).toFixed(2)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Checkout;
