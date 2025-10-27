import { useState, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { supabase } from '@/integrations/supabase/client';
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

const PedidosManual = () => {
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
        .eq('sale_type', 'BAZAR')
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
        .eq('event_type', 'MANUAL')
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

  const formatPhone = (phone: string): string => {
    return formatPhoneForDisplay(phone);
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

    const normalizedPhone = normalizePhone(phone);
    // Validar telefone brasileiro (10 ou 11 dígitos sem DDI)
    if (normalizedPhone.length < 10 || normalizedPhone.length > 11) {
      toast({
        title: 'Erro',
        description: 'Telefone inválido. Use formato com DDD (ex: 31999999999)',
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

      // Normalizar para armazenamento (sempre com 11 dígitos)
      const normalizedPhone = normalizeForStorage(phone);
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
              event_type: 'MANUAL',
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
            event_type: 'MANUAL',
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
      
      // Enviar mensagem WhatsApp usando template Item Adicionado
      if (tenant?.id) {
        try {
          const { error: whatsappError } = await supabase.functions.invoke('whatsapp-send-item-added', {
            body: {
              tenant_id: tenant.id,
              customer_phone: normalizedPhone,
              product_name: product.name,
              product_code: product.code,
              quantity: qty,
              unit_price: product.price
            }
          });

          if (whatsappError) {
            console.error('Error sending WhatsApp message:', whatsappError);
            toast({
              title: 'Aviso',
              description: 'Produto adicionado, mas houve erro ao enviar mensagem WhatsApp',
              variant: 'default'
            });
          }
        } catch (whatsappError) {
          console.error('Error sending WhatsApp message:', whatsappError);
        }
      }
      
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
            <h1 className="text-3xl font-bold">Pedidos Manual</h1>
          </div>

          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">
                <Plus className="h-4 w-4 mr-2" />
                Criar Pedido
              </TabsTrigger>
              <TabsTrigger value="manage">Gerenciar Pedidos</TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="space-y-6">

      {/* Toolbar */}
      <Card>
        <CardHeader>
          <CardTitle>Controles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto (C151 ou 151)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex space-x-2">
              <Input
                placeholder="Instagram padrão (ex: @cliente)"
                value={defaultInstagram}
                onChange={(e) => setDefaultInstagram(e.target.value)}
              />
              <Button onClick={fillDefaultInstagram} variant="outline" size="sm">
                Aplicar
              </Button>
            </div>

            <Select value={itemsPerPage} onValueChange={setItemsPerPage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 itens</SelectItem>
                <SelectItem value="15">15 itens</SelectItem>
                <SelectItem value="25">25 itens</SelectItem>
                <SelectItem value="50">50 itens</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={loadProducts} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Celular</TableHead>
                  <TableHead>Cód</TableHead>
                  <TableHead>Qtd em estoque</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Foto</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum produto encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Input
                          placeholder="Instagram (ex: @cliente)"
                          value={instagrams[product.id] || ''}
                          onChange={(e) => handleInstagramChange(product.id, e.target.value)}
                          className="w-40"
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {product.code.replace('C', '')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.stock > 0 ? 'default' : 'destructive'}>
                          {product.stock}
                        </Badge>
                      </TableCell>
                      <TableCell>R$ {product.price.toFixed(2)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {product.name}
                      </TableCell>
                      <TableCell>
                        {product.image_url ? (
                          <img 
                            src={product.image_url} 
                            alt={product.name}
                            className="w-12 h-12 object-cover rounded"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                            Sem foto
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Input
                            type="number"
                            min="1"
                            max={product.stock}
                            value={quantities[product.id] || 1}
                            onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                            className="w-16"
                          />
                          <Button
                            onClick={() => handleLancarVenda(product)}
                            disabled={processingIds.has(product.id) || product.stock === 0}
                            size="sm"
                          >
                            {processingIds.has(product.id) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Lançar'
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
            </TabsContent>

            <TabsContent value="manage" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Pedidos Manuais</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ordersLoading ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                            </TableCell>
                          </TableRow>
                        ) : orders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                              Nenhum pedido manual encontrado
                            </TableCell>
                          </TableRow>
                        ) : (
                          orders.map((order) => (
                            <TableRow key={order.id}>
                              <TableCell>#{order.id}</TableCell>
                              <TableCell>{formatPhoneForDisplay(order.customer_phone)}</TableCell>
                              <TableCell>{formatBrasiliaDate(order.created_at)}</TableCell>
                              <TableCell>R$ {order.total_amount.toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge variant={order.is_paid ? 'default' : 'secondary'}>
                                  {order.is_paid ? 'Pago' : 'Pendente'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex space-x-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditOrder(order)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteOrder(order.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Edit Order Dialog */}
          <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar Pedido #{editingOrder?.id}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Telefone</label>
                  <Input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Telefone do cliente"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Valor Total</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    placeholder="Valor total"
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setEditingOrder(null)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleUpdateOrder}>
                    Salvar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
};

export default PedidosManual;
