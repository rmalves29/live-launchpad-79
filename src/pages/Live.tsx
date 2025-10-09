import { useState, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { getBrasiliaDateISO, formatBrasiliaDate } from '@/lib/date-utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, RefreshCw, Edit, Trash2, Plus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { normalizeForStorage, normalizeForSending, formatPhoneForDisplay } from '@/lib/phone-utils';


interface Product {
  id: number;
  code: string;
  name: string;
  price: number;
  stock: number;
  image_url?: string;
  is_active: boolean;
  sale_type: 'LIVE' | 'BAZAR';
}

interface Order {
  id: number;
  customer_phone: string;
  event_type: string;
  event_date: string;
  total_amount: number;
  is_paid: boolean;
  created_at: string;
}

interface Customer {
  phone: string;
  instagram: string;
}

const Live = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { tenant } = useTenant();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [defaultInstagram, setDefaultInstagram] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState('10');
  const [instagrams, setInstagrams] = useState<{[key: number]: string}>({});
  const [quantities, setQuantities] = useState<{[key: number]: number}>({});
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editAmount, setEditAmount] = useState('');

  const loadProducts = async () => {
    try {
      setLoading(true);
      let query = supabaseTenant
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('sale_type', 'LIVE')
        .order('code');

      if (searchQuery) {
        // Search by code (with or without C) or name
        const cleanCode = searchQuery.replace(/[^0-9]/g, '');
        const codeWithC = cleanCode ? `C${cleanCode}` : '';
        
        query = query.or(`code.ilike.%${searchQuery}%,name.ilike.%${searchQuery}%,code.ilike.%${codeWithC}%`);
      }

      const limit = parseInt(itemsPerPage);
      query = query.limit(limit);

      const { data, error } = await query;

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar produtos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    try {
      setOrdersLoading(true);
      const { data, error } = await supabaseTenant
        .from('orders')
        .select('*')
        .eq('event_type', 'LIVE')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar pedidos',
        variant: 'destructive'
      });
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    loadOrders();
  }, [searchQuery, itemsPerPage]);

  const normalizeInstagram = (instagram: string): string => {
    // Remove @ if present
    return instagram.replace('@', '').trim();
  };

  const getPhoneFromInstagram = async (instagram: string): Promise<string | null> => {
    const normalized = normalizeInstagram(instagram);
    
    const { data, error } = await supabaseTenant
      .from('customers')
      .select('phone')
      .eq('instagram', normalized)
      .maybeSingle();

    if (error) {
      console.error('Error fetching customer by instagram:', error);
      return null;
    }

    return data?.phone || null;
  };

  const handleInstagramChange = (productId: number, value: string) => {
    setInstagrams(prev => ({ ...prev, [productId]: value }));
  };

  const handleQuantityChange = (productId: number, value: string) => {
    const qty = parseInt(value) || 1;
    setQuantities(prev => ({ ...prev, [productId]: qty }));
  };

  const handleLancarVenda = async (product: Product) => {
    const instagram = instagrams[product.id] || defaultInstagram;
    const qty = quantities[product.id] || 1;

    if (!instagram) {
      toast({
        title: 'Erro',
        description: 'Informe o @ do Instagram do cliente',
        variant: 'destructive'
      });
      return;
    }

    if (qty > product.stock) {
      toast({
        title: 'Erro',
        description: `Estoque insuficiente. Disponível: ${product.stock}`,
        variant: 'destructive'
      });
      return;
    }

    setProcessingIds(prev => new Set(prev).add(product.id));

    try {
      // Buscar telefone do cliente pelo Instagram
      const phone = await getPhoneFromInstagram(instagram);
      
      if (!phone) {
        toast({
          title: 'Erro',
          description: `Cliente com Instagram @${normalizeInstagram(instagram)} não encontrado no cadastro`,
          variant: 'destructive'
        });
        setProcessingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(product.id);
          return newSet;
        });
        return;
      }

      // Normalizar para envio e depois para armazenamento garante que o 9º dígito seja corrigido
      const normalizedPhone = normalizeForStorage(normalizeForSending(phone));
      const subtotal = product.price * qty;
      const today = getBrasiliaDateISO();
      
      // Function to get or create order with retry logic
      const getOrCreateOrder = async (): Promise<{ orderId: number; cartId: number | null; isNew: boolean }> => {
        // First attempt: Check for existing unpaid order
        const { data: existingOrders, error: searchError } = await supabaseTenant
          .from('orders')
          .select('*')
          .eq('customer_phone', normalizedPhone)
          .eq('event_date', today)
          .eq('is_paid', false)
          .order('created_at', { ascending: false });

        if (searchError) {
          console.error('Error searching for existing order:', searchError);
          throw searchError;
        }

        if (existingOrders && existingOrders.length > 0) {
          const existingOrder = existingOrders[0];
          
          // Update existing order total
          const newTotal = existingOrder.total_amount + subtotal;
          
          const { error: updateError } = await supabaseTenant
            .from('orders')
            .update({ total_amount: newTotal })
            .eq('id', existingOrder.id);

          if (updateError) throw updateError;
          
          return { 
            orderId: existingOrder.id, 
            cartId: existingOrder.cart_id, 
            isNew: false 
          };
        }

        // Try to create new order
        try {
          const { data: newOrder, error: orderError } = await supabaseTenant
            .from('orders')
            .insert([{
              customer_phone: normalizedPhone,
              event_type: 'LIVE',
              event_date: today,
              total_amount: subtotal,
              is_paid: false
            }])
            .select()
            .single();

          if (orderError) {
            // If unique constraint violation, retry to find existing order
            if (orderError.code === '23505') {
              console.log('Unique constraint violation, retrying to find existing order...');
              const { data: retryOrders, error: retryError } = await supabaseTenant
                .from('orders')
                .select('*')
                .eq('customer_phone', normalizedPhone)
                .eq('event_date', today)
                .eq('is_paid', false)
                .order('created_at', { ascending: false })
                .limit(1);

              if (retryError) throw retryError;
              if (retryOrders && retryOrders.length > 0) {
                const existingOrder = retryOrders[0];
                
                // Update total
                const newTotal = existingOrder.total_amount + subtotal;
                const { error: updateError } = await supabaseTenant
                  .from('orders')
                  .update({ total_amount: newTotal })
                  .eq('id', existingOrder.id);

                if (updateError) throw updateError;
                
                return { 
                  orderId: existingOrder.id, 
                  cartId: existingOrder.cart_id, 
                  isNew: false 
                };
              }
            }
            throw orderError;
          }

          return { 
            orderId: newOrder.id, 
            cartId: null, 
            isNew: true 
          };
        } catch (error) {
          throw error;
        }
      };

      const { orderId, cartId: initialCartId, isNew } = await getOrCreateOrder();
      let cartId = initialCartId;

      // Create cart if needed
      if (!cartId) {
        const { data: newCart, error: cartError } = await supabaseTenant
          .from('carts')
          .insert({
            customer_phone: normalizedPhone,
            event_type: 'LIVE',
            event_date: today,
            status: 'OPEN'
          })
          .select()
          .single();

        if (cartError) throw cartError;
        cartId = newCart.id;

        // Update order with cart_id
        await supabaseTenant
          .from('orders')
          .update({ cart_id: cartId })
          .eq('id', orderId);
      }

      // Add product to cart
      const { data: existingCartItem, error: cartItemSearchError } = await supabaseTenant
        .from('cart_items')
        .select('*')
        .eq('cart_id', cartId)
        .eq('product_id', product.id)
        .maybeSingle();

      if (cartItemSearchError && cartItemSearchError.code !== 'PGRST116') {
        console.error('Error searching for existing cart item:', cartItemSearchError);
      }

      if (existingCartItem) {
        // Update existing cart item
        const { error: updateCartError } = await supabaseTenant
          .from('cart_items')
          .update({
            qty: existingCartItem.qty + qty,
            unit_price: product.price
          })
          .eq('id', existingCartItem.id);

        if (updateCartError) throw updateCartError;
      } else {
        // Add new cart item
        const { error: cartItemError } = await supabaseTenant
          .from('cart_items')
          .insert({
            cart_id: cartId,
            product_id: product.id,
            qty: qty,
            unit_price: product.price
          });

        if (cartItemError) throw cartItemError;
      }

      // Update product stock in database
      const { error: stockError } = await supabaseTenant
        .from('products')
        .update({ stock: product.stock - qty })
        .eq('id', product.id);

      if (stockError) throw stockError;
      
      // Update stock locally for immediate feedback
      setProducts(prev => prev.map(p => 
        p.id === product.id 
          ? { ...p, stock: p.stock - qty }
          : p
      ));
      
      toast({
        title: 'Sucesso',
        description: !isNew 
          ? `Produto adicionado ao pedido existente: ${product.code} x${qty} para @${normalizeInstagram(instagram)}` 
          : `Novo pedido criado: ${product.code} x${qty} para @${normalizeInstagram(instagram)}. Subtotal: R$ ${subtotal.toFixed(2)}`,
      });

      // Clear inputs for this product
      setInstagrams(prev => ({ ...prev, [product.id]: '' }));
      setQuantities(prev => ({ ...prev, [product.id]: 1 }));
      
      // Reload orders to show the new one
      loadOrders();

    } catch (error) {
      console.error('Error launching sale:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao lançar venda',
        variant: 'destructive'
      });
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(product.id);
        return newSet;
      });
    }
  };

  const handleEditOrder = (order: Order) => {
    setEditingOrder(order);
    setEditPhone(order.customer_phone);
    setEditAmount(order.total_amount.toString());
  };

  const handleUpdateOrder = async () => {
    if (!editingOrder) return;

    try {
      const { error } = await supabaseTenant
        .from('orders')
        .update({
          customer_phone: normalizeForStorage(editPhone),
          total_amount: parseFloat(editAmount)
        })
        .eq('id', editingOrder.id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Pedido atualizado com sucesso'
      });

      setEditingOrder(null);
      loadOrders();
    } catch (error) {
      console.error('Error updating order:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar pedido',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteOrder = async (orderId: number) => {
    if (!confirm('Tem certeza que deseja excluir este pedido?')) return;

    try {
      const { error } = await supabaseTenant
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Pedido excluído com sucesso'
      });

      loadOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao excluir pedido',
        variant: 'destructive'
      });
    }
  };

  const fillDefaultInstagram = () => {
    if (!defaultInstagram) return;
    const newInstagrams: {[key: number]: string} = {};
    products.forEach(product => {
      newInstagrams[product.id] = defaultInstagram;
    });
    setInstagrams(newInstagrams);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <div className="container mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Vendas Live</h1>
          </div>

          <Tabs defaultValue="vendas" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="vendas">Lançar Vendas</TabsTrigger>
              <TabsTrigger value="pedidos">Pedidos Live</TabsTrigger>
            </TabsList>

            <TabsContent value="vendas" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Instagram Padrão</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="@usuario"
                      value={defaultInstagram}
                      onChange={(e) => setDefaultInstagram(e.target.value)}
                    />
                    <Button onClick={fillDefaultInstagram}>Preencher Todos</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Produtos</CardTitle>
                    <Button onClick={loadProducts} variant="outline" size="sm">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Atualizar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        placeholder="Buscar por código ou nome..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={itemsPerPage} onValueChange={setItemsPerPage}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 itens</SelectItem>
                        <SelectItem value="20">20 itens</SelectItem>
                        <SelectItem value="50">50 itens</SelectItem>
                        <SelectItem value="100">100 itens</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {loading ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>Preço</TableHead>
                            <TableHead>Estoque</TableHead>
                            <TableHead>Instagram</TableHead>
                            <TableHead>Qtd</TableHead>
                            <TableHead>Ação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {products.map((product) => (
                            <TableRow key={product.id}>
                              <TableCell className="font-medium">{product.code}</TableCell>
                              <TableCell>{product.name}</TableCell>
                              <TableCell>R$ {product.price.toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge variant={product.stock > 0 ? "default" : "destructive"}>
                                  {product.stock}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Input
                                  placeholder="@usuario"
                                  value={instagrams[product.id] || ''}
                                  onChange={(e) => handleInstagramChange(product.id, e.target.value)}
                                  className="w-40"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="1"
                                  value={quantities[product.id] || 1}
                                  onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                                  className="w-20"
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  onClick={() => handleLancarVenda(product)}
                                  disabled={product.stock === 0 || processingIds.has(product.id)}
                                  size="sm"
                                >
                                  {processingIds.has(product.id) ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    'Lançar'
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pedidos" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Pedidos da Live</CardTitle>
                    <Button onClick={loadOrders} variant="outline" size="sm">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Atualizar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {ordersLoading ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orders.map((order) => (
                            <TableRow key={order.id}>
                              <TableCell>{order.id}</TableCell>
                              <TableCell>{formatPhoneForDisplay(order.customer_phone)}</TableCell>
                              <TableCell>{formatBrasiliaDate(order.created_at)}</TableCell>
                              <TableCell>R$ {order.total_amount.toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge variant={order.is_paid ? "default" : "secondary"}>
                                  {order.is_paid ? 'Pago' : 'Pendente'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditOrder(order)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteOrder(order.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Edit Order Dialog */}
      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Telefone</label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Valor Total</label>
              <Input
                type="number"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpdateOrder}>Salvar</Button>
              <Button variant="outline" onClick={() => setEditingOrder(null)}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Live;