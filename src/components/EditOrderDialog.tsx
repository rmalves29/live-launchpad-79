import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Plus, Trash2, Search } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Product {
  id: number;
  name: string;
  code: string;
  price: number;
  image_url?: string;
}

interface CartItem {
  id?: number;
  product_id: number;
  qty: number;
  unit_price: number;
  product?: Product;
}

interface Order {
  id: number;
  customer_phone: string;
  customer_name?: string;
  event_type: string;
  event_date: string;
  total_amount: number;
  cart_id?: number;
  cart_items?: {
    id: number;
    qty: number;
    unit_price: number;
    product: {
      name: string;
      code: string;
      image_url?: string;
    };
  }[];
}

interface EditOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  onOrderUpdated: () => void;
}

export const EditOrderDialog = ({ open, onOpenChange, order, onOrderUpdated }: EditOrderDialogProps) => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [cartId, setCartId] = useState<number | null>(null);

useEffect(() => {
  if (open && order) {
    setCartId(order.cart_id ?? null);
    loadProducts();
  }
}, [open, order]);

useEffect(() => {
  if (open && cartId) {
    loadCartItems(cartId);
  }
}, [open, cartId]);


  const loadProducts = async () => {
    try {
      const { data, error } = await supabaseTenant
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProducts((data as any) || []);
    } catch (error: any) {
      console.error('Error loading products:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar produtos',
        variant: 'destructive'
      });
    }
  };

  const loadCartItems = async (id?: number | null) => {
    const effectiveId = id ?? cartId;
    if (!effectiveId) return;

    try {
      const { data, error } = await supabaseTenant
        .from('cart_items')
        .select(`
          *,
          product:products!cart_items_product_id_fkey (*)
        `)
        .eq('cart_id', effectiveId);

      if (error) throw error;
      setCartItems((data as any) || []);
    } catch (error: any) {
      console.error('Error loading cart items:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar itens do pedido',
        variant: 'destructive'
      });
    }
  };

  const createCartIfNeeded = async (): Promise<number | null> => {
    if (order?.cart_id) return order.cart_id;

    try {
      const { data, error } = await supabaseTenant
        .from('carts')
        .insert({
          customer_phone: order?.customer_phone || '',
          event_type: order?.event_type || 'BAZAR',
          event_date: order?.event_date || new Date().toISOString().split('T')[0],
          status: 'OPEN'
        })
        .select()
        .single();

      if (error) throw error;

      // Update order with cart_id
      const { error: updateError } = await supabaseTenant
        .from('orders')
        .update({ cart_id: data.id })
        .eq('id', order?.id || 0);

      if (updateError) throw updateError;

      // keep local state in sync
      setCartId(data.id);
      onOrderUpdated?.();

      return data.id;
    } catch (error) {
      console.error('Error creating cart:', error);
      return null;
    }
  };

  const addProductToOrder = async () => {
    if (!selectedProduct || !order) return;

    setLoading(true);
    try {
      const targetCartId = await createCartIfNeeded();
      if (!targetCartId) throw new Error('Não foi possível criar/obter carrinho');

      // Check if product already exists in cart
      const existingItem = cartItems.find(item => item.product_id === selectedProduct.id);

      if (existingItem) {
        // Update existing item
        const { error } = await supabaseTenant
          .from('cart_items')
          .update({
            qty: existingItem.qty + quantity,
            unit_price: unitPrice || selectedProduct.price
          })
          .eq('id', existingItem.id);

        if (error) throw error;
      } else {
        // Add new item with product snapshot for when product is deleted
        const { error } = await supabaseTenant
          .from('cart_items')
          .insert({
            cart_id: targetCartId,
            product_id: selectedProduct.id,
            qty: quantity,
            unit_price: unitPrice || selectedProduct.price,
            product_name: selectedProduct.name,
            product_code: selectedProduct.code,
            product_image_url: selectedProduct.image_url
          });

        if (error) throw error;
      }

      // Mensagem enviada automaticamente via trigger do banco

      // Reload cart items
      await loadCartItems(targetCartId);
      await updateOrderTotal(targetCartId);

      // Reset form
      setSelectedProduct(null);
      setQuantity(1);
      setUnitPrice(0);

      toast({
        title: 'Sucesso',
        description: 'Produto adicionado e mensagem enviada'
      });
    } catch (error: any) {
      console.error('Error adding product:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao adicionar produto',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async (itemId: number) => {
    const item = cartItems.find(i => i.id === itemId);
    if (!item) return;

    const productName = item.product?.name || item.product_name || 'produto';
    const productCode = item.product?.code || item.product_code || '';
    
    if (!confirm(`Tem certeza que deseja cancelar ${productName}? Uma mensagem será enviada ao cliente.`)) {
      return;
    }

    setLoading(true);
    try {
      // Enviar mensagem de cancelamento via Z-API
      const { error: zapiError } = await supabase.functions.invoke('zapi-send-product-canceled', {
        body: {
          tenant_id: profile?.tenant_id,
          customer_phone: order?.customer_phone,
          product_name: productName,
          product_code: productCode
        }
      });

      if (zapiError) {
        console.error('Erro ao enviar mensagem Z-API:', zapiError);
      }

      // Remover item do carrinho
      const { error } = await supabaseTenant
        .from('cart_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      await loadCartItems(cartId);
      await updateOrderTotal(cartId);

      toast({
        title: 'Produto Cancelado',
        description: zapiError 
          ? 'Produto removido (erro ao enviar mensagem)' 
          : 'Produto removido e mensagem de cancelamento enviada'
      });
    } catch (error: any) {
      console.error('Error removing item:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao cancelar produto',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const updateItemQuantity = async (itemId: number, newQty: number) => {
    if (newQty <= 0) return;

    try {
      const { error } = await supabaseTenant
        .from('cart_items')
        .update({ qty: newQty })
        .eq('id', itemId);

      if (error) throw error;

      await loadCartItems(cartId);
      await updateOrderTotal(cartId);
    } catch (error: any) {
      console.error('Error updating quantity:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao atualizar quantidade',
        variant: 'destructive'
      });
    }
  };

  // Extrai valor do frete do campo observation
  const extractFreightFromObservation = (observation: string | null | undefined): number => {
    if (!observation) return 0;
    
    console.log('[extractFreight] Observation:', observation);
    
    // Tenta diferentes formatos de frete na observation
    // Formato 1: "[FRETE] ... | R$ 19.90 | ..."
    // Formato 2: "[FRETE] Retirar no local | R$ 3.00 | ..."
    // Formato 3: "R$ 19,90" ou "R$ 19.90" em qualquer lugar
    
    // Primeiro tenta o formato específico com [FRETE]
    let match = observation.match(/R\$\s*([\d]+[.,][\d]{2})/i);
    if (match) {
      const value = match[1].replace(',', '.');
      const freight = parseFloat(value) || 0;
      console.log('[extractFreight] Extracted freight:', freight);
      return freight;
    }
    
    console.log('[extractFreight] No freight found');
    return 0;
  };

  const updateOrderTotal = async (id?: number | null) => {
    const effectiveId = id ?? cartId;
    if (!effectiveId || !order) return;

    try {
      // Buscar itens do carrinho
      const { data, error } = await supabaseTenant
        .from('cart_items')
        .select('qty, unit_price')
        .eq('cart_id', effectiveId);

      if (error) throw error;

      // Buscar observation do pedido para extrair o frete
      const { data: orderData, error: orderError } = await supabaseTenant
        .from('orders')
        .select('observation')
        .eq('id', order.id)
        .maybeSingle();

      if (orderError) throw orderError;

      // Calcular total dos produtos
      const productsTotal = (data || []).reduce((sum: number, item: any) => sum + (item.qty * item.unit_price), 0);
      
      // Extrair frete da observation
      const freightValue = extractFreightFromObservation(orderData?.observation);
      
      // Total = produtos + frete
      const total = productsTotal + freightValue;

      console.log(`[updateOrderTotal] Pedido #${order.id}: Produtos=${productsTotal}, Frete=${freightValue}, Total=${total}`);

      const { error: updateError } = await supabaseTenant
        .from('orders')
        .update({ total_amount: total })
        .eq('id', order.id);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('Error updating order total:', error);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentTotal = cartItems.reduce((sum, item) => sum + (item.qty * item.unit_price), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Pedido #{order?.id}</DialogTitle>
          <DialogDescription>Gerencie itens, quantidades e valores do pedido.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left column: Add products */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Adicionar Produtos</h3>
            
            <div className="space-y-3">
              <div>
                <Label>Buscar Produto</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Nome ou código do produto"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label>Produto</Label>
                <Select
                  value={selectedProduct?.id.toString() || ''}
                  onValueChange={(value) => {
                    const product = products.find(p => p.id.toString() === value);
                    setSelectedProduct(product || null);
                    setUnitPrice(product?.price || 0);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProducts.map((product) => (
                      <SelectItem key={product.id} value={product.id.toString()}>
                        {product.name} - {product.code} ({formatCurrency(product.price)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <Label>Preço Unitário</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <Button 
                onClick={addProductToOrder} 
                disabled={!selectedProduct || loading}
                className="w-full"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Adicionar Produto
              </Button>
            </div>
          </div>

          {/* Right column: Current items */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Itens do Pedido</h3>
              <Badge variant="outline">Total: {formatCurrency(currentTotal)}</Badge>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {cartItems.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    Nenhum item no pedido
                  </CardContent>
                </Card>
              ) : (
                cartItems.map((item) => {
                  const productName = item.product?.name || item.product_name || 'Produto deletado';
                  const productCode = item.product?.code || item.product_code || 'N/A';
                  const productImage = item.product?.image_url || item.product_image_url;
                  
                  return (
                    <Card key={item.id}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start gap-3">
                          {/* Product Image */}
                          <div className="flex-shrink-0">
                            {productImage ? (
                              <img 
                                src={productImage} 
                                alt={productName}
                                className="w-12 h-12 object-cover rounded border"
                              />
                            ) : (
                              <div className="w-12 h-12 bg-muted rounded border flex items-center justify-center text-xs text-muted-foreground">
                                Sem foto
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium">{productName}</h4>
                            <p className="text-sm text-muted-foreground">
                              Código: {productCode}
                            </p>
                            <p className="text-sm">
                              {formatCurrency(item.unit_price)} × {item.qty} = {formatCurrency(item.qty * item.unit_price)}
                            </p>
                          </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => updateItemQuantity(item.id!, parseInt(e.target.value) || 1)}
                            className="w-20"
                          />
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => removeItem(item.id!)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => { onOrderUpdated(); onOpenChange(false); }}>
            Salvar Alterações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};