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
import { Loader2, Search, RefreshCw, Plus } from 'lucide-react';
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


const PedidosManual = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { tenant } = useTenant();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [defaultPhone, setDefaultPhone] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState('10');
  const [phones, setPhones] = useState<{[key: number]: string}>({});
  const [quantities, setQuantities] = useState<{[key: number]: number}>({});
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());

  const loadProducts = async () => {
    try {
      setLoading(true);
      let query = supabaseTenant
        .from('products')
        .select('*')
        .eq('is_active', true)
        .in('sale_type', ['BAZAR', 'AMBOS'])
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
    } catch (error: any) {
      console.error('Error loading products:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar produtos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [searchQuery, itemsPerPage]);

  const normalizePhone = (phone: string): string => {
    return normalizeForStorage(phone);
  };

  const formatPhone = (phone: string): string => {
    return formatPhoneForDisplay(phone);
  };

  const handlePhoneChange = (productId: number, value: string) => {
    setPhones(prev => ({ ...prev, [productId]: value }));
  };

  const handleQuantityChange = (productId: number, value: string) => {
    const qty = parseInt(value) || 1;
    setQuantities(prev => ({ ...prev, [productId]: qty }));
  };

  const handleLancarVenda = async (product: Product) => {
    const phone = phones[product.id] || defaultPhone;
    const qty = quantities[product.id] || 1;

    if (!phone) {
      toast({
        title: 'Erro',
        description: 'Informe o telefone do cliente',
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
      // Check if customer is blocked
      const { data: customerData } = await supabaseTenant
        .from('customers')
        .select('is_blocked')
        .eq('phone', normalizedPhone)
        .maybeSingle();

      if (customerData?.is_blocked) {
        toast({
          title: '⚠️ CLIENTE BLOQUEADA',
          description: 'Este perfil possui restrições e não pode realizar novas compras.',
          variant: 'destructive',
          duration: 8000,
        });

        // Send WhatsApp blocked message
        try {
          const { data: whatsappConfig } = await supabaseTenant
            .from('integration_whatsapp')
            .select('blocked_customer_template, is_active')
            .maybeSingle();

          if (whatsappConfig?.is_active) {
            const blockedMessage = whatsappConfig.blocked_customer_template || 
              'Olá! Identificamos uma restrição em seu cadastro que impede a realização de novos pedidos no momento. ⛔\n\nPara entender melhor o motivo ou solicitar uma reavaliação, por favor, entre em contato diretamente com o suporte da loja.';
            
            await supabase.functions.invoke('zapi-send-message', {
              body: {
                phone: normalizedPhone,
                message: blockedMessage,
                tenant_id: tenant?.id || profile?.tenant_id,
              }
            });
            console.log('[Manual] 📤 Blocked customer WhatsApp message sent to', normalizedPhone);
          }
        } catch (err) {
          console.error('[Manual] Error sending blocked customer WhatsApp message:', err);
        }

        setProcessingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(product.id);
          return newSet;
        });
        return;
      }

      const subtotal = product.price * qty;
      const today = getBrasiliaDateISO();
      
      console.log('[Manual] 🛒 Iniciando lançamento:', {
        productId: product.id,
        productCode: product.code,
        phone: normalizedPhone,
        qty,
        subtotal,
        today
      });
      
      // Function to get or create order with retry logic
      const getOrCreateOrder = async (): Promise<{ orderId: number; cartId: number | null; isNew: boolean }> => {
        console.log('[Manual] 📦 Buscando pedido existente para:', normalizedPhone, today);
        // First attempt: Check for existing unpaid order
        const { data: existingOrders, error: searchError } = await supabaseTenant
          .from('orders')
          .select('*')
          .eq('customer_phone', normalizedPhone)
          .eq('event_date', today)
          .eq('is_paid', false)
          // IMPORTANT: never reuse cancelled orders
          .or('is_cancelled.is.null,is_cancelled.eq.false')
          .in('event_type', ['BAZAR', 'MANUAL'])
          .order('created_at', { ascending: false });

        if (searchError) {
          console.error('[Manual] ❌ Erro ao buscar pedido existente:', searchError);
          throw searchError;
        }
        
        console.log('[Manual] 📋 Pedidos existentes encontrados:', existingOrders?.length || 0, existingOrders);

        if (existingOrders && existingOrders.length > 0) {
          const existingOrder = existingOrders[0];
          
          // Update existing order total
          const newTotal = existingOrder.total_amount + subtotal;
          
          const updatePayload: any = { total_amount: newTotal };

          const { error: updateError } = await supabaseTenant
            .from('orders')
            .update(updatePayload)
            .eq('id', existingOrder.id);

          if (updateError) throw updateError;
          
          return { 
            orderId: existingOrder.id, 
            cartId: existingOrder.cart_id, 
            isNew: false 
          };
        }

        // Try to create new order - Manual page always creates BAZAR orders
        try {
          const { data: newOrder, error: orderError } = await supabaseTenant
            .from('orders')
            .insert([{
              customer_phone: normalizedPhone,
              event_type: 'BAZAR',
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
                // IMPORTANT: never reuse cancelled orders
                .or('is_cancelled.is.null,is_cancelled.eq.false')
                .in('event_type', ['BAZAR', 'MANUAL'])
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
        const cartEventType = product.sale_type === 'BAZAR' ? 'BAZAR' : 'MANUAL';
        const { data: newCart, error: cartError } = await supabaseTenant
          .from('carts')
          .insert({
            customer_phone: normalizedPhone,
            event_type: cartEventType,
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
        console.log('[Manual] 📝 Atualizando item existente no carrinho:', existingCartItem.id);
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

        if (updateCartError) {
          console.error('[Manual] ❌ Erro ao atualizar item no carrinho:', updateCartError);
          throw updateCartError;
        }
        console.log('[Manual] ✅ Item do carrinho atualizado');
      } else {
        console.log('[Manual] ➕ Inserindo novo item no carrinho:', {
          cart_id: cartId,
          product_id: product.id,
          qty
        });
        // Add new cart item with product snapshot for when product is deleted
        const { data: newCartItem, error: cartItemError } = await supabaseTenant
          .from('cart_items')
          .insert({
            cart_id: cartId,
            product_id: product.id,
            qty: qty,
            unit_price: product.price,
            product_name: product.name,
            product_code: product.code,
            product_image_url: product.image_url
          })
          .select();

        if (cartItemError) {
          console.error('[Manual] ❌ Erro ao inserir item no carrinho:', cartItemError);
          throw cartItemError;
        }
        console.log('[Manual] ✅ Item inserido com sucesso:', newCartItem);
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
          ? `Produto adicionado ao pedido existente: ${product.code} x${qty}` 
          : `Novo pedido criado: ${product.code} x${qty} para ${normalizedPhone}. Subtotal: R$ ${subtotal.toFixed(2)}`,
      });

      // Mensagem WhatsApp é enviada automaticamente pelo trigger do banco (send_whatsapp_on_item_added)

      // Clear inputs for this product
      setPhones(prev => ({ ...prev, [product.id]: '' }));
      setQuantities(prev => ({ ...prev, [product.id]: 1 }));



    } catch (error: any) {
      console.error('Error launching sale:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao lançar venda',
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

  const fillDefaultPhone = () => {
    if (!defaultPhone) return;
    const newPhones: {[key: number]: string} = {};
    products.forEach(product => {
      newPhones[product.id] = defaultPhone;
    });
    setPhones(newPhones);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6">
        <div className="container mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Pedidos Manual</h1>
          </div>

          <div className="space-y-6">
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
                placeholder="Telefone padrão"
                value={defaultPhone}
                onChange={(e) => setDefaultPhone(e.target.value)}
              />
              <Button onClick={fillDefaultPhone} variant="outline" size="sm">
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
                  <TableHead>Nome</TableHead>
                  <TableHead>Variação</TableHead>
                  <TableHead>Estoque</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Foto</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum produto encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Input
                          placeholder="Telefone"
                          value={phones[product.id] || ''}
                          onChange={(e) => handlePhoneChange(product.id, e.target.value)}
                          className="w-32"
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {product.code.replace('C', '')}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {product.name}
                      </TableCell>
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
                      <TableCell>
                        <Badge variant={product.stock > 0 ? 'default' : 'destructive'}>
                          {product.stock}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(product.price)}</TableCell>
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
          </div>

        </div>
      </div>
    </div>
  );
};

export default PedidosManual;
