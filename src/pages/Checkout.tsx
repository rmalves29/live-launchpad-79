import { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTenantContext } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Copy, User, MapPin, Truck, Search, ShoppingCart, ArrowLeft, BarChart3, CreditCard, Eye } from 'lucide-react';
import { supabaseTenant } from '@/lib/supabase-tenant';

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
    cpf: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    city: '',
    state: ''
  });
  const [shippingOptions, setShippingOptions] = useState<any[]>([]);
  const [selectedShipping, setSelectedShipping] = useState('retirada');
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [loadingPayment, setLoadingPayment] = useState(false);

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
        title: 'Erro',
        description: 'Tenant não identificado',
        variant: 'destructive'
      });
      return;
    }

    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    setLoadingOpenOrders(true);
    
    try {
      const { data: orders, error } = await supabaseTenant
        .from('orders')
        .select('*')
        .eq('customer_phone', normalizedPhone)
        .eq('is_paid', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Load cart items for each order
      const ordersWithItems = await Promise.all(
        (orders || []).map(async (order) => {
          if (!order.cart_id) {
            return { ...order, items: [] };
          }

          const { data: cartItems, error: itemsError } = await supabaseTenant
            .from('cart_items')
            .select(`
              id,
              qty,
              unit_price,
              product:products!cart_items_product_id_fkey(
                name,
                code,
                image_url
              )
            `)
            .eq('cart_id', order.cart_id);

          if (itemsError) {
            console.error('Error loading cart items:', itemsError);
            return { ...order, items: [] };
          }

          const items = (cartItems || []).map(item => ({
            id: item.id,
            product_name: item.product?.name || '',
            product_code: item.product?.code || '',
            qty: item.qty,
            unit_price: Number(item.unit_price),
            image_url: item.product?.image_url
          }));

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
        const loadedCustomerData = await loadCustomerData(normalizedPhone);
        
        // Se carregou dados do cliente com CEP válido, calcular frete automaticamente
        if (loadedCustomerData && loadedCustomerData.cep && loadedCustomerData.cep.replace(/[^0-9]/g, '').length === 8) {
          // Se há apenas um pedido, calcular frete automaticamente
          if (ordersWithItems.length === 1) {
            setTimeout(() => {
              calculateShipping(loadedCustomerData.cep, ordersWithItems[0]);
            }, 500); // Pequeno delay para garantir que o estado foi atualizado
          }
        }
      }
    } catch (error) {
      console.error('Error loading open orders:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar pedidos em aberto',
        variant: 'destructive'
      });
    } finally {
      setLoadingOpenOrders(false);
    }
  };

  const calculateShipping = async (cep: string, order: Order) => {
    if (!cep || cep.replace(/[^0-9]/g, '').length !== 8) return;
    
    setLoadingShipping(true);
    try {
      // Buscar endereço pelo CEP (ViaCEP)
      if (cep.replace(/[^0-9]/g, '').length === 8) {
        try {
          const cepResponse = await fetch(`https://viacep.com.br/ws/${cep.replace(/[^0-9]/g, '')}/json/`);
          const cepData = await cepResponse.json();
          
          if (!cepData.erro) {
            setCustomerData(prev => ({
              ...prev,
              street: cepData.logradouro || prev.street,
              city: cepData.localidade || prev.city,
              state: cepData.uf || prev.state
            }));
          }
        } catch (error) {
          console.error('Error fetching address:', error);
        }
      }

      // Calcular frete
      const { data, error } = await supabaseTenant.raw.functions.invoke('melhor-envio-shipping', {
        body: {
          to_postal_code: cep.replace(/[^0-9]/g, ''),
          tenant_id: tenantId,
          products: order.items.map(item => ({
            id: item.id.toString(),
            width: 16,
            height: 2,
            length: 20,
            weight: 0.3,
            insurance_value: item.unit_price,
            quantity: item.qty
          }))
        }
      });

      if (error) throw error;

      if (data && data.shipping_options && data.shipping_options.length > 0) {
        // Mapear as opções de frete da resposta do Melhor Envio
        const options = data.shipping_options
          .filter((option: any) => !option.error) // Filtrar opções com erro
          .map((option: any) => ({
            id: option.service_id.toString(),
            name: option.service_name,
            company: option.company,
            price: parseFloat(option.price || option.custom_price || 0).toFixed(2),
            delivery_time: option.delivery_time || option.custom_delivery_time,
            custom_price: parseFloat(option.custom_price || option.price || 0).toFixed(2)
          }));

        setShippingOptions(options);
        
        if (options.length > 0) {
          toast({
            title: 'Frete calculado',
            description: `${options.length} opções de frete encontradas`
          });
        }
      } else {
        // Se não houver opções, mostrar apenas retirada
        setShippingOptions([{
          id: 'retirada',
          name: 'Retirada - Retirar na Fábrica',
          company: 'Retirada',
          price: '0.00',
          delivery_time: 3,
          custom_price: '0.00'
        }]);
        
        toast({
          title: 'Frete não disponível',
          description: 'Apenas retirada disponível para este CEP'
        });
      }
    } catch (error) {
      console.error('Error calculating shipping:', error);
      
      // Fallback para retirada apenas
      setShippingOptions([{
        id: 'retirada',
        name: 'Retirada - Retirar na Fábrica', 
        company: 'Retirada',
        price: '0.00',
        delivery_time: 3,
        custom_price: '0.00'
      }]);
      
      toast({
        title: 'Erro no cálculo de frete',
        description: 'Não foi possível calcular o frete. Retirada disponível.',
        variant: 'destructive'
      });
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
        cpf: data.cpf,
        cep: data.cep,
        street: data.street,
        number: data.number,
        complement: data.complement,
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

  const loadCustomerData = async (customerPhone: string) => {
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
          cpf: customer.cpf || '',
          cep: customer.cep || '',
          street: customer.street || '',
          number: customer.number || '',
          complement: customer.complement || '',
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

  const processPayment = async (order: Order) => {
    if (!tenantId) {
      toast({
        title: 'Erro',
        description: 'Tenant não identificado',
        variant: 'destructive'
      });
      return;
    }

    if (!customerData.name || !customerData.cpf) {
      toast({
        title: 'Dados obrigatórios',
        description: 'Nome e CPF são obrigatórios para finalizar o pedido',
        variant: 'destructive'
      });
      return;
    }

    if (selectedShipping !== 'retirada' && (!customerData.cep || !customerData.street)) {
      toast({
        title: 'Endereço obrigatório',
        description: 'Endereço completo é obrigatório para entrega',
        variant: 'destructive'
      });
      return;
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

      const totalAmount = Number(order.total_amount) + shippingCost;

      // Preparar dados do frete selecionado
      let shippingData = null;
      if (selectedShipping !== 'retirada') {
        const selectedOption = shippingOptions.find(opt => opt.id === selectedShipping);
        if (selectedOption) {
          shippingData = {
            service_id: selectedOption.id,
            service_name: selectedOption.name,
            company_name: selectedOption.company?.name,
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
          city: customerData.city,
          state: customerData.state
        },
        shippingCost: shippingCost,
        shippingData: shippingData, // Informações detalhadas do frete
        total: totalAmount.toString(),
        coupon_discount: 0, // Por enquanto sem cupom de desconto
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
        // Abrir pagamento em nova aba
        const paymentUrl = data.init_point || data.sandbox_init_point;
        window.open(paymentUrl, '_blank');
        
        toast({
          title: 'Redirecionando para pagamento',
          description: 'Uma nova aba foi aberta com o pagamento do Mercado Pago'
        });

        // Limpar dados após criar o pagamento
        setCustomerData({
          name: '',
          cpf: '',
          cep: '',
          street: '',
          number: '',
          complement: '',
          city: '',
          state: ''
        });
        setShippingOptions([]);
        setSelectedShipping('retirada');

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

    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    setLoadingHistory(true);
    
    try {
      const { data: orders, error } = await supabaseTenant
        .from('orders')
        .select('*')
        .eq('customer_phone', normalizedPhone)
        .eq('is_paid', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Load cart items for each order
      const ordersWithItems = await Promise.all(
        (orders || []).map(async (order) => {
          if (!order.cart_id) {
            return { ...order, items: [] };
          }

          const { data: cartItems, error: itemsError } = await supabaseTenant
            .from('cart_items')
            .select(`
              id,
              qty,
              unit_price,
              product:products!cart_items_product_id_fkey(
                name,
                code,
                image_url
              )
            `)
            .eq('cart_id', order.cart_id);

          if (itemsError) {
            console.error('Error loading cart items:', itemsError);
            return { ...order, items: [] };
          }

          const items = (cartItems || []).map(item => ({
            id: item.id,
            product_name: item.product?.name || '',
            product_code: item.product?.code || '',
            qty: item.qty,
            unit_price: Number(item.unit_price),
            image_url: item.product?.image_url
          }));

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
    } catch (error) {
      console.error('Error loading order history:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar histórico de pedidos',
        variant: 'destructive'
      });
    } finally {
      setLoadingHistory(false);
    }
  };

  const renderCheckoutView = () => (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Finalizar Checkout</h2>
        <Button onClick={() => setActiveView('dashboard')} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao Dashboard
        </Button>
      </div>
      
      <p className="text-muted-foreground mb-6">Processe pagamentos e finalize pedidos</p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Search className="h-5 w-5 mr-2" />
            Buscar Pedidos em Aberto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Telefone do cliente"
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
                            <span className="font-medium">Total:</span> R$ {Number(order.total_amount).toFixed(2)}
                          </div>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Items:</span> {order.items.length} produto(s)
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary">R$ {Number(order.total_amount).toFixed(2)}</div>
                        <div className="text-sm text-muted-foreground">{order.items.length} item(s)</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 flex justify-end space-x-4">
                <Button variant="outline" onClick={() => setOpenOrders([])}>
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
                            onClick={() => setSelectedOrder(null)}
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
                              {item.image_url ? (
                                <img 
                                  src={item.image_url} 
                                  alt={item.product_name}
                                  className="w-10 h-10 object-cover rounded"
                                />
                              ) : (
                                <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                                  <ShoppingCart className="h-5 w-5 text-gray-400" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{item.product_code} - {item.product_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Quantidade: {item.qty} • Preço unitário: R$ {Number(item.unit_price).toFixed(2)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold">R$ {(item.qty * Number(item.unit_price)).toFixed(2)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
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
                        <label className="text-sm font-medium mb-1 block">CPF *</label>
                        <Input
                          placeholder="000.000.000-00"
                          value={customerData.cpf}
                          onChange={(e) => {
                            const newData = {...customerData, cpf: e.target.value};
                            setCustomerData(newData);
                          }}
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
                              onChange={(e) => setSelectedShipping(e.target.value)}
                              className="mr-3" 
                            />
                            <label htmlFor={`${option.id}-${order.id}`} className="font-medium">
                              {option.name}
                            </label>
                            <p className="text-sm text-muted-foreground ml-6">
                              {option.company} - Entrega em até {option.delivery_time} dias úteis
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
                              onChange={(e) => setSelectedShipping(e.target.value)}
                              className="mr-3" 
                            />
                            <label htmlFor={`retirada-${order.id}`} className="font-medium">
                              Retirada - Retirar na Fábrica
                            </label>
                            <p className="text-sm text-muted-foreground ml-6">Entrega em até 3 dias úteis</p>
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

                  {/* Resumo e Finalização */}
                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-lg font-medium">Total do Pedido:</span>
                      <span className="text-xl font-bold">R$ {Number(order.total_amount).toFixed(2)}</span>
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

                    <div className="flex justify-between items-center mb-6 text-xl font-bold border-t pt-4">
                      <span>Total Geral:</span>
                      <span className="text-green-600">
                        R$ {(() => {
                          let total = Number(order.total_amount);
                          if (selectedShipping !== 'retirada') {
                            const selectedOption = shippingOptions.find(opt => opt.id === selectedShipping);
                            total += selectedOption ? parseFloat(selectedOption.custom_price || selectedOption.price) : 0;
                          }
                          return total.toFixed(2);
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
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 flex-shrink-0">
                        {item.image_url ? (
                          <img 
                            src={item.image_url} 
                            alt={item.product_name}
                            className="w-16 h-16 object-cover rounded"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
                            <ShoppingCart className="h-8 w-8 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="font-medium">{item.product_name}</h4>
                        <p className="text-sm text-muted-foreground">Código: {item.product_code}</p>
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

  if (activeView === 'checkout') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6">
          {renderCheckoutView()}
        </div>
      </div>
    );
  }

  if (activeView === 'history') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6">
          {renderHistoryView()}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center justify-center">
            <CreditCard className="h-10 w-10 mr-3 text-primary" />
            Centro de Controle - Checkout
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Finalize pedidos e processe pagamentos
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 border-2 bg-blue-50 border-blue-200"
            onClick={() => setActiveView('checkout')}
          >
            <CardHeader>
              <CardTitle className="flex items-center text-xl">
                <div className="p-3 rounded-lg bg-blue-50 mr-4">
                  <CreditCard className="h-8 w-8 text-blue-600" />
                </div>
                Finalizar Compra
              </CardTitle>
              <CardDescription className="text-base">
                Buscar pedidos e processar pagamentos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                Acessar
              </Button>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 border-2 bg-purple-50 border-purple-200"
            onClick={() => setActiveView('history')}
          >
            <CardHeader>
              <CardTitle className="flex items-center text-xl">
                <div className="p-3 rounded-lg bg-purple-50 mr-4">
                  <BarChart3 className="h-8 w-8 text-purple-600" />
                </div>
                Histórico de Pedidos
              </CardTitle>
              <CardDescription className="text-base">
                Ver pedidos finalizados do cliente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                Acessar
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
