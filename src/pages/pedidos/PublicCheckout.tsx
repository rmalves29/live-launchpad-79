import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, User, MapPin, Search, ShoppingCart, Package, Store, Phone, AlertTriangle } from 'lucide-react';
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
          .from('tenants')
          .select('id, name, slug, logo_url, primary_color, phone')
          .eq('slug', slug)
          .eq('is_active', true)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          setTenantError('Loja não encontrada');
        } else {
          setTenant(data);
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

  const searchOrders = async () => {
    if (!phone) {
      toast({
        title: 'Erro',
        description: 'Informe seu telefone',
        variant: 'destructive'
      });
      return;
    }

    if (!tenant) {
      toast({
        title: 'Erro',
        description: 'Loja não identificada',
        variant: 'destructive'
      });
      return;
    }

    const normalizedPhone = normalizeForStorage(phone);
    setLoadingOrders(true);
    setSearched(true);

    try {
      // Buscar pedidos não pagos do cliente neste tenant
      const { data: allOrders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('is_paid', false)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Filtrar pelo telefone normalizado
      const customerOrders = (allOrders || []).filter(order => {
        const orderPhone = normalizeForStorage(order.customer_phone);
        return orderPhone === normalizedPhone;
      });

      // Carregar itens de cada pedido
      const ordersWithItems = await Promise.all(
        customerOrders.map(async (order) => {
          if (!order.cart_id) {
            return { ...order, items: [] };
          }

          const { data: cartItems } = await supabase
            .from('cart_items')
            .select('id, qty, unit_price, product_id')
            .eq('cart_id', order.cart_id)
            .eq('tenant_id', tenant.id);

          if (!cartItems || cartItems.length === 0) {
            return { ...order, items: [] };
          }

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

      // Carregar dados do cliente se existir
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

      if (customerOrders.length === 0) {
        toast({
          title: 'Nenhum pedido encontrado',
          description: 'Não há pedidos em aberto para este telefone'
        });
      }
    } catch (error) {
      console.error('Erro ao buscar pedidos:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao buscar seus pedidos',
        variant: 'destructive'
      });
    } finally {
      setLoadingOrders(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Header da loja */}
      <div 
        className="border-b py-4 px-4"
        style={{ backgroundColor: tenant.primary_color || undefined }}
      >
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          {tenant.logo_url ? (
            <img 
              src={tenant.logo_url} 
              alt={tenant.name} 
              className="h-12 w-12 rounded-full object-cover bg-white"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
              <Store className="h-6 w-6 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-white">{tenant.name}</h1>
            <p className="text-white/80 text-sm">Consulta de Pedidos</p>
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
                {loadingOrders ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
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
            ) : (
              <div className="space-y-4">
                {/* Dados do cliente */}
                {customerData.name && (
                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Seus Dados
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p><strong>Nome:</strong> {customerData.name}</p>
                      {customerData.email && <p><strong>Email:</strong> {customerData.email}</p>}
                      {customerData.street && (
                        <p className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>
                            {customerData.street}, {customerData.number}
                            {customerData.complement && ` - ${customerData.complement}`}
                            <br />
                            {customerData.neighborhood && `${customerData.neighborhood}, `}
                            {customerData.city} - {customerData.state}
                            {customerData.cep && ` | CEP: ${customerData.cep}`}
                          </span>
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Lista de pedidos */}
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Pedidos em Aberto ({orders.length})
                  </h2>

                  {orders.map((order) => (
                    <Card key={order.id} className="glass-card overflow-hidden">
                      <CardHeader className="pb-2 bg-muted/50">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">
                              Pedido #{order.id}
                            </CardTitle>
                            <CardDescription>
                              {order.event_type} - {new Date(order.event_date).toLocaleDateString('pt-BR')}
                            </CardDescription>
                          </div>
                          <Badge variant={order.is_paid ? "default" : "secondary"}>
                            {order.is_paid ? 'Pago' : 'Aguardando Pagamento'}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4">
                        {/* Itens do pedido */}
                        <div className="space-y-2 mb-4">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                {item.image_url && (
                                  <img 
                                    src={item.image_url} 
                                    alt={item.product_name}
                                    className="h-10 w-10 rounded object-cover"
                                  />
                                )}
                                <div>
                                  <p className="font-medium">{item.product_name}</p>
                                  <p className="text-muted-foreground text-xs">
                                    Código: {item.product_code} | Qtd: {item.qty}
                                  </p>
                                </div>
                              </div>
                              <span>{formatCurrency(item.unit_price * item.qty)}</span>
                            </div>
                          ))}
                        </div>

                        <Separator className="my-3" />

                        {/* Total e link de pagamento */}
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-lg">
                            Total: {formatCurrency(order.total_amount)}
                          </span>
                          
                          {order.payment_link && !order.is_paid && (
                            <Button asChild>
                              <a href={order.payment_link} target="_blank" rel="noopener noreferrer">
                                Pagar Agora
                              </a>
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
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
