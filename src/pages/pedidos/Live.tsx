import { useState, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { supabase } from '@/integrations/supabase/client';
import { getBrasiliaDateISO, formatBrasiliaDate } from '@/lib/date-utils';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, RefreshCw, Edit, Trash2, Plus, Package, ChevronDown, ChevronRight, X } from 'lucide-react';
import { ZoomableImage } from '@/components/ui/zoomable-image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
  import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { normalizeForStorage, normalizeForSending, formatPhoneForDisplay } from '@/lib/phone-utils';
import { formatCurrency } from '@/lib/utils';


interface Product {
  id: number;
  code: string;
  name: string;
  price: number;
  stock: number;
  image_url?: string;
  is_active: boolean;
  sale_type: 'LIVE' | 'BAZAR';
  color?: string;
  size?: string;
}

interface Order {
  id: number;
  customer_phone: string;
  event_type: string;
  event_date: string;
  total_amount: number;
  is_paid: boolean;
  created_at: string;
  cart_id: number | null;
}

interface CartItem {
  id: number;
  cart_id: number;
  product_id: number | null;
  product_name: string | null;
  product_code: string | null;
  product_image_url: string | null;
  qty: number;
  unit_price: number;
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
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [defaultInstagram, setDefaultInstagram] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState('10');
  const [instagrams, setInstagrams] = useState<{[key: number]: string}>({});
  const [quantities, setQuantities] = useState<{[key: number]: number}>({});
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const debouncedOrderSearch = useDebounce(orderSearchQuery, 300);
  const [orderCartItems, setOrderCartItems] = useState<{[orderId: number]: CartItem[]}>({});
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());
  const [deletingItems, setDeletingItems] = useState<Set<number>>(new Set());
  const [blockedCustomerName, setBlockedCustomerName] = useState<string | null>(null);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const limit = parseInt(itemsPerPage);
      const offset = (currentPage - 1) * limit;

      // First, get total count
      let countQuery = supabaseTenant
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .in('sale_type', ['LIVE', 'AMBOS']);

      if (debouncedSearchQuery) {
        const searchTerm = debouncedSearchQuery.trim();
        const cleanCode = searchTerm.replace(/[^0-9]/g, '');
        const codeWithC = cleanCode ? `C${cleanCode}` : '';
        
        // Build OR conditions for search
        const orConditions = [`name.ilike.%${searchTerm}%`, `code.ilike.%${searchTerm}%`];
        if (codeWithC) {
          orConditions.push(`code.ilike.%${codeWithC}%`);
        }
        countQuery = countQuery.or(orConditions.join(','));
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;
      setTotalProducts(count || 0);

      // Then get paginated data
      let query = supabaseTenant
        .from('products')
        .select('*')
        .eq('is_active', true)
        .in('sale_type', ['LIVE', 'AMBOS'])
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (debouncedSearchQuery) {
        const searchTerm = debouncedSearchQuery.trim();
        const cleanCode = searchTerm.replace(/[^0-9]/g, '');
        const codeWithC = cleanCode ? `C${cleanCode}` : '';
        
        // Build OR conditions for search
        const orConditions = [`name.ilike.%${searchTerm}%`, `code.ilike.%${searchTerm}%`];
        if (codeWithC) {
          orConditions.push(`code.ilike.%${codeWithC}%`);
        }
        query = query.or(orConditions.join(','));
      }

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

  const totalPages = Math.ceil(totalProducts / parseInt(itemsPerPage));

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
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
      
      let filteredOrders = data || [];
      
      // Load cart items for all orders
      const cartIds = filteredOrders.filter(o => o.cart_id).map(o => o.cart_id as number);
      let allCartItems: CartItem[] = [];
      if (cartIds.length > 0) {
        const { data: items } = await supabaseTenant.raw
          .from('cart_items')
          .select('*')
          .in('cart_id', cartIds);
        allCartItems = (items || []) as CartItem[];
      }
      
      // Group cart items by order
      const itemsByOrder: {[orderId: number]: CartItem[]} = {};
      for (const order of filteredOrders) {
        if (order.cart_id) {
          itemsByOrder[order.id] = allCartItems.filter(i => i.cart_id === order.cart_id);
        } else {
          itemsByOrder[order.id] = [];
        }
      }
      
      // Apply search filter
      if (debouncedOrderSearch.trim()) {
        const search = debouncedOrderSearch.trim().toLowerCase();
        filteredOrders = filteredOrders.filter(order => {
          // Match by phone
          if (order.customer_phone.includes(search) || formatPhoneForDisplay(order.customer_phone).includes(search)) return true;
          // Match by order ID
          if (order.id.toString().includes(search.replace('#', ''))) return true;
          // Match by product code in cart items
          const items = itemsByOrder[order.id] || [];
          if (items.some(item => item.product_code?.toLowerCase().includes(search) || item.product_name?.toLowerCase().includes(search))) return true;
          return false;
        });
      }
      
      setOrderCartItems(itemsByOrder);
      setOrders(filteredOrders);
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
    if (tenant?.id) {
      loadProducts();
    }
  }, [tenant?.id, debouncedSearchQuery, itemsPerPage, currentPage]);

  useEffect(() => {
    if (tenant?.id) {
      loadOrders();
    }
  }, [tenant?.id, debouncedOrderSearch]);

  // Reset to first page when search or items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, itemsPerPage]);

  const normalizeInstagram = (instagram: string): string => {
    // Remove @ if present
    return instagram.replace('@', '').trim();
  };

  const getPhoneFromInstagram = async (instagram: string): Promise<string | null> => {
    const normalized = normalizeInstagram(instagram);
    
    const { data, error } = await supabaseTenant
      .from('customers')
      .select('phone, is_blocked')
      .eq('instagram', normalized)
      .maybeSingle();

    if (error) {
      console.error('Error fetching customer by instagram:', error);
      return null;
    }

    if (data?.is_blocked) {
      setBlockedCustomerName(normalized);
      
      // Send WhatsApp blocked message
      try {
        const { data: whatsappConfig } = await supabaseTenant
          .from('integration_whatsapp')
          .select('blocked_customer_template, zapi_instance_id, zapi_token, provider, is_active')
          .maybeSingle();

        if (whatsappConfig?.is_active && data.phone) {
          const blockedMessage = whatsappConfig.blocked_customer_template || 
            'Olá! Identificamos uma restrição em seu cadastro que impede a realização de novos pedidos no momento. ⛔\n\nPara entender melhor o motivo ou solicitar uma reavaliação, por favor, entre em contato diretamente com o suporte da loja.';
          
          await supabase.functions.invoke('zapi-send-message', {
            body: {
              phone: data.phone,
              message: blockedMessage,
              tenant_id: tenant?.id || profile?.tenant_id,
            }
          });
        }
      } catch (err) {
        console.error('Error sending blocked customer WhatsApp message:', err);
      }
      
      return '__BLOCKED__';
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
      
      if (phone === '__BLOCKED__') {
        setProcessingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(product.id);
          return newSet;
        });
        return;
      }
      
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
          .eq('event_type', 'LIVE')
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
                .eq('event_type', 'LIVE')
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
        // Update existing cart item - also update product snapshot
        const { error: updateCartError } = await supabaseTenant
          .from('cart_items')
          .update({
            qty: existingCartItem.qty + qty,
            unit_price: product.price,
            product_name: product.name,
            product_code: product.code,
            product_image_url: product.image_url
          })
          .eq('id', existingCartItem.id);

        if (updateCartError) throw updateCartError;
      } else {
        // Add new cart item with product snapshot for when product is deleted
        const { error: cartItemError } = await supabaseTenant
          .from('cart_items')
          .insert({
            cart_id: cartId,
            product_id: product.id,
            qty: qty,
            unit_price: product.price,
            product_name: product.name,
            product_code: product.code,
            product_image_url: product.image_url
          });

        if (cartItemError) throw cartItemError;
      }

      // ATOMIC stock decrement: fresh read + conditional update to prevent overselling
      const { data: freshProduct, error: freshError } = await supabaseTenant
        .from('products')
        .select('stock')
        .eq('id', product.id)
        .single();

      if (freshError || !freshProduct) throw new Error('Erro ao verificar estoque atual');

      if (freshProduct.stock < qty) {
        // Rollback: remove the cart item we just added
        if (existingCartItem) {
          await supabaseTenant.from('cart_items').update({ qty: existingCartItem.qty }).eq('id', existingCartItem.id);
        } else {
          await supabaseTenant.from('cart_items').delete().eq('cart_id', cartId).eq('product_id', product.id);
        }
        toast({
          title: 'Estoque insuficiente',
          description: `${product.code} tem apenas ${freshProduct.stock} unidade(s) em estoque.`,
          variant: 'destructive'
        });
        return;
      }

      const { data: stockResult, error: stockError } = await supabaseTenant
        .from('products')
        .update({ stock: freshProduct.stock - qty })
        .eq('id', product.id)
        .gt('stock', 0)
        .select('stock')
        .single();

      if (stockError || !stockResult) {
        // Rollback cart item
        if (existingCartItem) {
          await supabaseTenant.from('cart_items').update({ qty: existingCartItem.qty }).eq('id', existingCartItem.id);
        } else {
          await supabaseTenant.from('cart_items').delete().eq('cart_id', cartId).eq('product_id', product.id);
        }
        toast({
          title: 'Estoque esgotado',
          description: `${product.code} sem estoque disponível.`,
          variant: 'destructive'
        });
        return;
      }
      
      // Update stock locally for immediate feedback
      setProducts(prev => prev.map(p => 
        p.id === product.id 
          ? { ...p, stock: stockResult.stock }
          : p
      ));
      
      // Mensagem WhatsApp é enviada automaticamente pelo trigger do banco (send_whatsapp_on_item_added)
      
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

  const toggleOrderExpand = (orderId: number) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) newSet.delete(orderId);
      else newSet.add(orderId);
      return newSet;
    });
  };

  const handleDeleteCartItem = async (order: Order, item: CartItem) => {
    if (!confirm(`Remover "${item.product_name || item.product_code}" deste pedido?`)) return;
    
    setDeletingItems(prev => new Set(prev).add(item.id));
    try {
      // Delete the cart item
      const { error: deleteError } = await supabaseTenant.raw
        .from('cart_items')
        .delete()
        .eq('id', item.id);
      if (deleteError) throw deleteError;

      // Restore stock if product still exists and order is not paid
      if (item.product_id && !order.is_paid) {
        const { data: prod } = await supabaseTenant
          .from('products')
          .select('stock')
          .eq('id', item.product_id)
          .maybeSingle();
        if (prod) {
          await supabaseTenant
            .from('products')
            .update({ stock: prod.stock + item.qty })
            .eq('id', item.product_id);
        }
      }

      // Recalculate order total
      const remainingItems = (orderCartItems[order.id] || []).filter(i => i.id !== item.id);
      const newTotal = remainingItems.reduce((sum, i) => sum + (i.unit_price * i.qty), 0);

      if (remainingItems.length === 0) {
        // No items left - delete the order entirely
        if (order.cart_id) {
          await supabaseTenant.raw.from('carts').delete().eq('id', order.cart_id);
        }
        await supabaseTenant.from('orders').delete().eq('id', order.id);
        toast({ title: 'Sucesso', description: 'Pedido removido (sem itens restantes)' });
      } else {
        // Update order total
        await supabaseTenant.from('orders').update({ total_amount: newTotal }).eq('id', order.id);
        toast({ title: 'Sucesso', description: 'Produto removido do pedido' });
      }

      loadOrders();
      loadProducts(); // Refresh stock
    } catch (error) {
      console.error('Error deleting cart item:', error);
      toast({ title: 'Erro', description: 'Erro ao remover produto do pedido', variant: 'destructive' });
    } finally {
      setDeletingItems(prev => {
        const s = new Set(prev);
        s.delete(item.id);
        return s;
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
                            <TableHead>Foto</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>Variação</TableHead>
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
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <ZoomableImage
                                  src={product.image_url || ''}
                                  alt={product.name}
                                  className="w-12 h-12"
                                  containerClassName="w-12 h-12 rounded-md"
                                  fallback={
                                    <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center">
                                      <Package className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  }
                                />
                              </TableCell>
                              <TableCell>{product.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {product.color || product.size ? (
                                  <div className="flex flex-col gap-0.5">
                                    {product.color && <span>{product.color}</span>}
                                    {product.size && <span>{product.size}</span>}
                                  </div>
                                ) : (
                                  <span>-</span>
                                )}
                              </TableCell>
                              <TableCell>{formatCurrency(product.price)}</TableCell>
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

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 px-2">
                      <div className="text-sm text-muted-foreground">
                        Mostrando {((currentPage - 1) * parseInt(itemsPerPage)) + 1} - {Math.min(currentPage * parseInt(itemsPerPage), totalProducts)} de {totalProducts} produtos
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage === 1}
                        >
                          Anterior
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }
                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                onClick={() => handlePageChange(pageNum)}
                                className="w-8 h-8 p-0"
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={currentPage === totalPages}
                        >
                          Próximo
                        </Button>
                      </div>
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
                <CardContent className="space-y-4">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Buscar por telefone, código do produto ou nome..."
                      value={orderSearchQuery}
                      onChange={(e) => setOrderSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {ordersLoading ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8"></TableHead>
                            <TableHead>ID</TableHead>
                            <TableHead>Foto</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orders.map((order) => (
                            <>
                              <TableRow key={order.id} className="cursor-pointer" onClick={() => toggleOrderExpand(order.id)}>
                                <TableCell className="w-8 px-2">
                                  {expandedOrders.has(order.id) ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </TableCell>
                                <TableCell>{order.id}</TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-1">
                                    {(orderCartItems[order.id] || []).slice(0, 3).map(item => (
                                      <ZoomableImage
                                        key={item.id}
                                        src={item.product_image_url || ''}
                                        alt={item.product_name || ''}
                                        className="w-12 h-12"
                                        containerClassName="w-12 h-12 rounded-md"
                                        fallback={
                                          <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center">
                                            <Package className="h-4 w-4 text-muted-foreground" />
                                          </div>
                                        }
                                      />
                                    ))}
                                    {(orderCartItems[order.id] || []).length > 3 && (
                                      <span className="text-xs text-muted-foreground">+{(orderCartItems[order.id] || []).length - 3}</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>{formatPhoneForDisplay(order.customer_phone)}</TableCell>
                                <TableCell>{formatBrasiliaDate(order.created_at)}</TableCell>
                                <TableCell>{formatCurrency(order.total_amount)}</TableCell>
                                <TableCell>
                                  <Badge variant={order.is_paid ? "default" : "secondary"}>
                                    {order.is_paid ? 'Pago' : 'Pendente'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                    <Button variant="ghost" size="sm" onClick={() => handleEditOrder(order)}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteOrder(order.id)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {expandedOrders.has(order.id) && (
                                <TableRow key={`${order.id}-items`}>
                                  <TableCell colSpan={8} className="bg-muted/30 p-0">
                                    <div className="p-3">
                                      <p className="text-xs font-medium text-muted-foreground mb-2">Produtos do pedido:</p>
                                      {(orderCartItems[order.id] || []).length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic">Nenhum produto encontrado</p>
                                      ) : (
                                        <div className="space-y-1">
                                          {(orderCartItems[order.id] || []).map(item => (
                                            <div key={item.id} className="flex items-center justify-between bg-background rounded p-2 text-sm">
                                              <div className="flex items-center gap-3 flex-wrap">
                                                {item.product_image_url ? (
                                                  <img src={item.product_image_url} alt="" className="w-8 h-8 rounded object-cover" />
                                                ) : (
                                                  <div className="w-8 h-8 bg-muted rounded flex items-center justify-center">
                                                    <Package className="h-3 w-3 text-muted-foreground" />
                                                  </div>
                                                )}
                                                <span className="font-medium">{item.product_code}</span>
                                                <span className="text-muted-foreground">{item.product_name}</span>
                                                <span>x{item.qty}</span>
                                                <span className="text-muted-foreground">{formatCurrency(item.unit_price * item.qty)}</span>
                                              </div>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                                onClick={() => handleDeleteCartItem(order, item)}
                                                disabled={deletingItems.has(item.id)}
                                              >
                                                {deletingItems.has(item.id) ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <X className="h-3 w-3" />
                                                )}
                                              </Button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </>
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

      {/* Blocked Customer Alert - Centered */}
      <AlertDialog open={!!blockedCustomerName} onOpenChange={(open) => !open && setBlockedCustomerName(null)}>
        <AlertDialogContent className="border-destructive">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive text-xl flex items-center gap-2">
              ⚠️ CLIENTE BLOQUEADA
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              O perfil <strong>@{blockedCustomerName}</strong> possui restrições e não pode realizar novas compras.
              {'\n\n'}Uma mensagem automática de restrição foi enviada via WhatsApp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlockedCustomerName(null)}>
              Entendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Live;
