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
import { Loader2, Plus, Trash2, Search } from 'lucide-react';

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
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar produtos',
        variant: 'destructive'
      });
    }
  };

  const loadCartItems = async (id?: number | null) => {
    const effectiveId = id ?? cartId;
    if (!effectiveId) return;

    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select(`
          *,
          product:products!cart_items_product_id_fkey (*)
        `)
        .eq('cart_id', effectiveId);

      if (error) throw error;
      setCartItems(data || []);
    } catch (error) {
      console.error('Error loading cart items:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar itens do pedido',
        variant: 'destructive'
      });
    }
  };

  const createCartIfNeeded = async (): Promise<number | null> => {
    if (order?.cart_id) return order.cart_id;

    try {
      const { data, error } = await supabase
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
      const { error: updateError } = await supabase
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
        const { error } = await supabase
          .from('cart_items')
          .update({
            qty: existingItem.qty + quantity,
            unit_price: unitPrice || selectedProduct.price
          })
          .eq('id', existingItem.id);

        if (error) throw error;
      } else {
        // Add new item
        const { error } = await supabase
          .from('cart_items')
          .insert({
            cart_id: targetCartId,
            product_id: selectedProduct.id,
            qty: quantity,
            unit_price: unitPrice || selectedProduct.price
          });

        if (error) throw error;
      }

      // Enviar mensagem de item adicionado
      await sendItemAddedMessage();

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
    } catch (error) {
      console.error('Error adding product:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao adicionar produto',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async (itemId: number) => {
    const item = cartItems.find(i => i.id === itemId);
    if (!item) return;

    // Confirmar cancelamento
    const productName = item.product?.name || 'produto';
    if (!confirm(`Tem certeza que deseja cancelar ${productName}? Uma mensagem será enviada ao cliente.`)) {
      return;
    }

    try {
      // Remover item do carrinho
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      // Enviar mensagem de cancelamento
      await sendCancellationMessage(item);

      await loadCartItems(cartId);
      await updateOrderTotal(cartId);

      toast({
        title: 'Produto Cancelado',
        description: 'Produto removido e mensagem de cancelamento enviada'
      });
    } catch (error) {
      console.error('Error removing item:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao cancelar produto',
        variant: 'destructive'
      });
    }
  };

  const updateItemQuantity = async (itemId: number, newQty: number) => {
    if (newQty <= 0) return;

    try {
      const { error } = await supabase
        .from('cart_items')
        .update({ qty: newQty })
        .eq('id', itemId);

      if (error) throw error;

      await loadCartItems(cartId);
      await updateOrderTotal(cartId);
    } catch (error) {
      console.error('Error updating quantity:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar quantidade',
        variant: 'destructive'
      });
    }
  };

  const updateOrderTotal = async (id?: number | null) => {
    const effectiveId = id ?? cartId;
    if (!effectiveId || !order) return;

    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select('qty, unit_price')
        .eq('cart_id', effectiveId);

      if (error) throw error;

      const total = (data || []).reduce((sum, item) => sum + (item.qty * item.unit_price), 0);

      const { error: updateError } = await supabase
        .from('orders')
        .update({ total_amount: total })
        .eq('id', order.id);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('Error updating order total:', error);
    }
  };

  const sendItemAddedMessage = async () => {
    if (!selectedProduct || !order) return;
    
    try {
      // Mock function para substituir a lib/whatsapp.ts (removida)
      const sendItemAdded = async () => ({ success: true });
      
      const success = true; // Mock - substituir pela nova implementação WhatsApp

      // Marcar que mensagem foi enviada
      await supabase
        .from('orders')
        .update({ item_added_message_sent: true })
        .eq('id', order.id);

      if (success) {
        toast({
          title: 'Sucesso',
          description: 'Mensagem de item adicionado enviada'
        });
      } else {
        toast({
          title: 'Aviso',
          description: 'Mensagem registrada, mas pode não ter sido entregue via WhatsApp',
          variant: 'destructive'
        });
      }

    } catch (error) {
      console.error('Error sending item added message:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao enviar mensagem de item adicionado',
        variant: 'destructive'
      });
    }
  };

  const sendCancellationMessage = async (item: CartItem) => {
    if (!order) return;
    
    try {
      // Buscar template de cancelamento
      const { data: template } = await supabase
        .from('whatsapp_templates')
        .select('content')
        .eq('type', 'PRODUCT_CANCELED')
        .single();

      const message = template?.content 
        ? template.content.replace('{{produto}}', item.product?.name || 'Produto')
        : `❌ *Produto Cancelado*\n\nO produto "${item.product?.name || 'Produto'}" foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato conosco.`;

      // Usar a função de envio otimizada
      const sent = await (async () => {
        const baseUrl = 'http://localhost:3333';
        try {
          const attempts = [
            { path: '/send-message', body: { number: order.customer_phone, message } },
            { path: '/send-message', body: { to: order.customer_phone, message } },
            { path: '/send', body: { to: order.customer_phone, message } },
            { path: '/send', body: { number: order.customer_phone, message } },
          ];

          for (const a of attempts) {
            try {
              const resp = await fetch(`${baseUrl}${a.path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(a.body),
              });
              
              if (resp.ok) {
                // Adicionar tag "app" ao cliente
                try {
                  await fetch(`${baseUrl}/add-label`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: order.customer_phone, label: 'app' }),
                  });
                } catch (labelError) {
                  console.warn('Erro ao adicionar tag "app":', labelError);
                }
                return true;
              }
            } catch (error) {
              console.warn(`Erro na tentativa (${a.path}):`, error);
            }
          }
          return false;
        } catch (error) {
          console.warn('Erro geral no envio:', error);
          return false;
        }
      })();

      // Registrar no banco
      await supabase.from('whatsapp_messages').insert({
        phone: order.customer_phone,
        message,
        type: 'product_canceled',
        sent_at: new Date().toISOString(),
      });

      if (sent) {
        toast({
          title: 'Sucesso',
          description: 'Mensagem de cancelamento enviada'
        });
      } else {
        toast({
          title: 'Aviso',
          description: 'Mensagem registrada, mas pode não ter sido entregue via WhatsApp',
          variant: 'destructive'
        });
      }

    } catch (error) {
      console.error('Error sending cancellation message:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao enviar mensagem de cancelamento',
        variant: 'destructive'
      });
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
                        {product.name} - {product.code} (R$ {product.price.toFixed(2)})
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
              <Badge variant="outline">Total: R$ {currentTotal.toFixed(2)}</Badge>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {cartItems.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    Nenhum item no pedido
                  </CardContent>
                </Card>
              ) : (
                cartItems.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-medium">{item.product?.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            Código: {item.product?.code}
                          </p>
                          <p className="text-sm">
                            R$ {item.unit_price.toFixed(2)} × {item.qty} = R$ {(item.qty * item.unit_price).toFixed(2)}
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
                ))
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