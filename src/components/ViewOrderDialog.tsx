import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPhoneForDisplay } from '@/lib/phone-utils';
import { formatCurrency } from '@/lib/utils';
import { ZoomableImage } from '@/components/ui/zoomable-image';
import { formatBrasiliaDate, formatBrasiliaDateTime } from '@/lib/date-utils';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, MapPin, Printer, Percent, Gift, X } from 'lucide-react';
import { printThermalReceipt } from '@/components/ThermalReceipt';

interface Order {
  id: number;
  tenant_order_number?: number;
  customer_phone: string;
  event_type: string;
  event_date: string;
  total_amount: number;
  is_paid: boolean;
  created_at: string;
  observation?: string;
  bling_order_id?: number;
  tenant_id?: string;
  cart_id?: number;
  coupon_code?: string;
  coupon_discount?: number;
  gift_name?: string;
  customer?: {
    name?: string;
    cpf?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    cep?: string;
    bling_contact_id?: number;
  };
  cart_items?: {
    id: number;
    qty: number;
    unit_price: number;
    product_name?: string;
    product_code?: string;
    product_image_url?: string;
    product: {
      name: string;
      code: string;
      image_url?: string;
      color?: string;
      size?: string;
    } | null;
  }[];
}

interface ViewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  onOrderUpdated?: () => void;
}

export const ViewOrderDialog = ({ open, onOpenChange, order, onOrderUpdated }: ViewOrderDialogProps) => {
  const { toast } = useToast();
  const [syncingAddress, setSyncingAddress] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [loadingCoupon, setLoadingCoupon] = useState(false);

  if (!order) return null;

  const hasAppliedCoupon = !!(order.coupon_code && order.coupon_discount && order.coupon_discount > 0);
  const hasAppliedGift = !!order.gift_name;

  const applyCouponToOrder = async () => {
    if (!couponInput.trim() || !order.tenant_id) return;
    setLoadingCoupon(true);
    try {
      const codeToSearch = couponInput.toUpperCase().trim();
      const productsSubtotal = order.cart_items?.reduce((sum, item) => sum + item.qty * item.unit_price, 0) || 0;

      // Buscar cupom
      const { data: coupon } = await supabase
        .from('coupons')
        .select('*')
        .eq('tenant_id', order.tenant_id)
        .eq('code', codeToSearch)
        .eq('is_active', true)
        .maybeSingle();

      if (coupon) {
        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
          toast({ title: 'Cupom Expirado', description: 'Este cupom já expirou', variant: 'destructive' });
          return;
        }
        if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
          toast({ title: 'Cupom Esgotado', description: 'Limite de uso atingido', variant: 'destructive' });
          return;
        }

        let discount = 0;
        if (coupon.discount_type === 'progressive') {
          const tiers = coupon.progressive_tiers as Array<{min_value: number, max_value: number | null, discount: number}>;
          const tier = tiers?.find(t => t.max_value === null ? productsSubtotal >= t.min_value : productsSubtotal >= t.min_value && productsSubtotal <= t.max_value);
          if (tier) discount = (productsSubtotal * tier.discount) / 100;
        } else if (coupon.discount_type === 'percentage') {
          discount = (productsSubtotal * coupon.discount_value) / 100;
        } else if (coupon.discount_type === 'fixed') {
          discount = Math.min(coupon.discount_value, productsSubtotal);
        }

        const currentFreight = Math.max(0, order.total_amount - productsSubtotal);
        const newTotal = Math.max(0, productsSubtotal - discount) + currentFreight;

        let newObs = order.observation || '';
        newObs = newObs.replace(/\[COUPON_DISCOUNT\][^\n]*/g, '').trim();
        newObs += `\n[COUPON_DISCOUNT] R$ ${discount.toFixed(2)}`;

        const { error } = await supabase
          .from('orders')
          .update({
            coupon_code: codeToSearch,
            coupon_discount: discount,
            total_amount: newTotal,
            observation: newObs.trim()
          })
          .eq('id', order.id);

        if (error) throw error;

        await supabase.from('coupons').update({ used_count: coupon.used_count + 1 }).eq('id', coupon.id);

        toast({ title: 'Cupom Aplicado!', description: `Desconto de ${formatCurrency(discount)} aplicado ao pedido` });
        setCouponInput('');
        onOrderUpdated?.();
        return;
      }

      // Buscar brinde
      const { data: gifts } = await supabase
        .from('gifts')
        .select('*')
        .eq('tenant_id', order.tenant_id)
        .eq('is_active', true);

      const gift = gifts?.find(g =>
        g.name.toUpperCase().replace(/\s+/g, '') === codeToSearch.replace(/\s+/g, '') ||
        g.name.toUpperCase() === codeToSearch
      );

      if (gift) {
        if (productsSubtotal < gift.minimum_purchase_amount) {
          toast({
            title: 'Valor Mínimo',
            description: `Precisa de ${formatCurrency(gift.minimum_purchase_amount)} em compras. Faltam ${formatCurrency(gift.minimum_purchase_amount - productsSubtotal)}`,
            variant: 'destructive'
          });
          return;
        }

        let newObs = order.observation || '';
        newObs = newObs.replace(/\[BRINDE\][^\n]*/g, '').trim();
        newObs += `\n[BRINDE] ${gift.name}`;

        const { error } = await supabase
          .from('orders')
          .update({
            gift_name: gift.name,
            observation: newObs.trim()
          })
          .eq('id', order.id);

        if (error) throw error;

        toast({ title: 'Presente Aplicado! 🎁', description: `Presente "${gift.name}" adicionado ao pedido` });
        setCouponInput('');
        onOrderUpdated?.();
        return;
      }

      toast({ title: 'Código Inválido', description: 'Cupom ou presente não encontrado', variant: 'destructive' });
    } catch (error: any) {
      console.error('Erro ao aplicar código:', error);
      toast({ title: 'Erro', description: error?.message || 'Erro ao aplicar código', variant: 'destructive' });
    } finally {
      setLoadingCoupon(false);
    }
  };

  const removeCouponFromOrder = async () => {
    if (!order.tenant_id) return;
    setLoadingCoupon(true);
    try {
      const productsSubtotal = order.cart_items?.reduce((sum, item) => sum + item.qty * item.unit_price, 0) || 0;
      const discount = order.coupon_discount || 0;
      const currentFreight = Math.max(0, order.total_amount - (productsSubtotal - discount));
      const newTotal = productsSubtotal + currentFreight;

      let newObs = (order.observation || '')
        .replace(/\[COUPON_DISCOUNT\][^\n]*/g, '')
        .replace(/\[BRINDE\][^\n]*/g, '')
        .trim();

      const { error } = await supabase
        .from('orders')
        .update({
          coupon_code: null,
          coupon_discount: 0,
          gift_name: null,
          total_amount: hasAppliedCoupon ? newTotal : order.total_amount,
          observation: newObs || null
        })
        .eq('id', order.id);

      if (error) throw error;
      toast({ title: 'Removido', description: 'Cupom/presente removido do pedido' });
      onOrderUpdated?.();
    } catch (error: any) {
      toast({ title: 'Erro', description: error?.message || 'Erro ao remover', variant: 'destructive' });
    } finally {
      setLoadingCoupon(false);
    }
  };

  // Mostrar botão de sincronização de endereço sempre que o pedido tiver endereço preenchido
  // (independente de já ter sido sincronizado com o Bling)
  const hasAddress = !!(order.customer?.street || order.customer?.cep);
  const hasBlingIntegration = !!(order.bling_order_id || order.customer?.bling_contact_id || hasAddress);

  const syncAddressWithBling = async () => {
    if (!order.tenant_id) {
      toast({ title: 'Erro', description: 'Tenant não identificado', variant: 'destructive' });
      return;
    }

    setSyncingAddress(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-address-bling', {
        body: { order_id: order.id, tenant_id: order.tenant_id }
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: 'Sucesso', description: 'Endereço atualizado no Bling com sucesso!' });
      } else {
        toast({
          title: 'Resultado parcial',
          description: data?.message || 'Verifique os logs para detalhes',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      console.error('Erro ao sincronizar endereço:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao atualizar endereço no Bling',
        variant: 'destructive'
      });
    } finally {
      setSyncingAddress(false);
    }
  };

  const customerName = order.customer?.name || 'Cliente não identificado';
  const customerAddress = order.customer ? 
    `${order.customer.street || ''}, ${order.customer.number || ''}${order.customer.complement ? `, ${order.customer.complement}` : ''}, ${order.customer.neighborhood || ''} - ${order.customer.city || ''} - ${order.customer.state || ''}, CEP: ${order.customer.cep || ''}` 
    : 'Endereço não cadastrado';

  const totalItems = order.cart_items?.reduce((sum, item) => sum + item.qty, 0) || 0;

  // Calculate freight as total_amount minus products subtotal
  const productsSubtotal = order.cart_items?.reduce((sum, item) => sum + item.qty * item.unit_price, 0) || 0;
  const freteValueRaw = order.total_amount - productsSubtotal;
  const freteValue = freteValueRaw > 0 ? freteValueRaw : 0;

  // Parse shipping info from observation field (supports both formats)
  const parseShippingInfo = (obs: string | undefined) => {
    if (!obs) return null;
    // New format: [FRETE] Transportadora - Serviço | R$ XX.XX | Prazo: X dias
    const newFormatMatch = obs.match(/\[FRETE\]\s*(.+)/);
    if (newFormatMatch) return newFormatMatch[1].trim();
    // Old format: Frete: Transportadora - Serviço - R$ XX.XX - Prazo
    const oldFormatMatch = obs.match(/Frete:\s*(.+)/);
    if (oldFormatMatch) return oldFormatMatch[1].trim();
    return null;
  };

  const shippingOption = parseShippingInfo(order.observation);
  const shippingOptionLabel = shippingOption
    ? shippingOption
    : freteValue > 0
      ? 'Não registrado (valor calculado pelo total)'
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <div>
              <DialogTitle>Detalhes do Pedido #{order.tenant_order_number || order.id}</DialogTitle>
              <DialogDescription>Visualize todos os produtos e informações do pedido.</DialogDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => printThermalReceipt(order)}
              title="Imprimir romaneio térmico"
            >
              <Printer className="h-4 w-4 mr-2" />
              Imprimir - Térmica
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Customer Info */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold mb-3">Informações do Cliente</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Nome:</strong> {customerName}
                </div>
                <div>
                  <strong>Telefone:</strong> {formatPhoneForDisplay(order.customer_phone)}
                </div>
                {order.customer?.cpf && (
                  <div>
                    <strong>CPF:</strong> {order.customer.cpf}
                  </div>
                )}
                <div className="md:col-span-2">
                  <strong>Endereço:</strong> {customerAddress}
                </div>
                {hasBlingIntegration && (
                  <div className="md:col-span-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={syncAddressWithBling}
                      disabled={syncingAddress}
                      className="mt-1"
                    >
                      {syncingAddress ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <MapPin className="h-4 w-4 mr-2" />
                      )}
                      Atualizar Endereço no Bling
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Order Summary */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold mb-3">Resumo do Pedido</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <strong>Total:</strong> {formatCurrency(order.total_amount)}
                </div>
                <div>
                  <strong>Status:</strong> 
                  <Badge variant={order.is_paid ? 'default' : 'secondary'} className="ml-2">
                    {order.is_paid ? 'Pago' : 'Pendente'}
                  </Badge>
                </div>
                <div>
                  <strong>Data:</strong> {formatBrasiliaDate(order.created_at)}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cupom / Brinde */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Percent className="h-5 w-5 text-green-600" />
                Cupom de Desconto / Presente
              </h3>

              {(hasAppliedCoupon || hasAppliedGift) ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      {hasAppliedGift ? (
                        <Gift className="h-5 w-5 text-purple-600" />
                      ) : (
                        <Percent className="h-5 w-5 text-green-600" />
                      )}
                      <div>
                        <Badge className={hasAppliedGift ? 'bg-purple-600' : 'bg-green-600'}>
                          {hasAppliedGift ? `🎁 ${order.gift_name}` : order.coupon_code}
                        </Badge>
                        {hasAppliedCoupon && (
                          <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                            Desconto: {formatCurrency(order.coupon_discount!)}
                          </p>
                        )}
                      </div>
                    </div>
                    {!order.is_paid && (
                      <Button variant="outline" size="sm" onClick={removeCouponFromOrder} disabled={loadingCoupon} className="text-red-600">
                        {loadingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        <span className="ml-1">Remover</span>
                      </Button>
                    )}
                  </div>
                </div>
              ) : !order.is_paid ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Código do cupom ou nome do presente"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyPress={(e) => e.key === 'Enter' && applyCouponToOrder()}
                    className="flex-1"
                  />
                  <Button
                    onClick={applyCouponToOrder}
                    disabled={loadingCoupon || !couponInput.trim()}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {loadingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum cupom ou brinde aplicado</p>
              )}
            </CardContent>
          </Card>

          {/* Shipping Info */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold mb-3">Informações de Frete</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <strong>Opção:</strong> {shippingOptionLabel || (freteValue > 0 ? `Frete: ${formatCurrency(freteValue)}` : 'Retirada / Não informado')}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Products */}
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Produtos do Pedido</h3>
                <Badge variant="outline">{totalItems} {totalItems === 1 ? 'item' : 'itens'}</Badge>
              </div>
              
              {!order.cart_items || order.cart_items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum produto encontrado para este pedido
                </div>
              ) : (
                <div className="space-y-3">
                {order.cart_items.map((item) => {
                    const productName = item.product?.name || item.product_name || 'Produto removido';
                    const productCode = item.product?.code || item.product_code || '-';
                    const productImage = item.product?.image_url || item.product_image_url;
                    const productColor = item.product?.color;
                    const productSize = item.product?.size;
                    
                    return (
                      <Card key={item.id} className="border">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            {/* Product Image with Zoom */}
                            <div className="flex-shrink-0">
                              <ZoomableImage
                                src={productImage || ''}
                                alt={productName}
                                className="w-16 h-16"
                                containerClassName="w-16 h-16 rounded border"
                                fallback={
                                  <div className="w-16 h-16 bg-muted rounded border flex items-center justify-center text-xs text-muted-foreground">
                                    Sem foto
                                  </div>
                                }
                              />
                            </div>
                            
                            {/* Product Details */}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium truncate">{productName}</h4>
                              <p className="text-sm text-muted-foreground">Código: {productCode}</p>
                              {(productColor || productSize) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {productColor && <span>Cor: {productColor}</span>}
                                  {productColor && productSize && <span> | </span>}
                                  {productSize && <span>Tamanho: {productSize}</span>}
                                </p>
                              )}
                              <div className="flex items-center gap-4 mt-2 text-sm">
                                <div>
                                  <strong>Preço unitário:</strong> {formatCurrency(item.unit_price)}
                                </div>
                                <div>
                                  <strong>Quantidade:</strong> {item.qty}
                                </div>
                                <div>
                                  <strong>Subtotal:</strong> {formatCurrency(item.qty * item.unit_price)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Timeline and Observations */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold mb-3">Informações Adicionais</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <strong>Pedido criado em:</strong> {formatBrasiliaDateTime(order.created_at)}
                </div>
                {order.observation && (
                  <div>
                    <strong>Observações:</strong>
                    <div className="mt-1 p-2 bg-muted rounded text-muted-foreground">
                      {order.observation}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};