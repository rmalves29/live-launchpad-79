import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatPhoneForDisplay } from '@/lib/phone-utils';
import { formatCurrency } from '@/lib/utils';
import { ZoomableImage } from '@/components/ui/zoomable-image';

interface Order {
  id: number;
  customer_phone: string;
  event_type: string;
  event_date: string;
  total_amount: number;
  is_paid: boolean;
  created_at: string;
  observation?: string;
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
}

export const ViewOrderDialog = ({ open, onOpenChange, order }: ViewOrderDialogProps) => {
  if (!order) return null;

  const customerName = order.customer?.name || 'Cliente não identificado';
  const customerAddress = order.customer ? 
    `${order.customer.street || ''}, ${order.customer.number || ''}${order.customer.complement ? `, ${order.customer.complement}` : ''}, ${order.customer.neighborhood || ''} - ${order.customer.city || ''} - ${order.customer.state || ''}, CEP: ${order.customer.cep || ''}` 
    : 'Endereço não cadastrado';

  const totalItems = order.cart_items?.reduce((sum, item) => sum + item.qty, 0) || 0;
  
  // Calculate freight as total_amount minus products subtotal
  const productsSubtotal = order.cart_items?.reduce((sum, item) => sum + (item.qty * item.unit_price), 0) || 0;
  const freteValue = order.total_amount - productsSubtotal;

  // Parse shipping info from observation field
  const parseShippingInfo = (obs: string | undefined) => {
    if (!obs) return null;
    const freteMatch = obs.match(/Frete:\s*(.+)/);
    if (!freteMatch) return null;
    return freteMatch[1].trim();
  };
  const shippingOption = parseShippingInfo(order.observation);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Pedido #{order.id}</DialogTitle>
          <DialogDescription>Visualize todos os produtos e informações do pedido.</DialogDescription>
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
                  <strong>Data:</strong> {format(new Date(order.created_at), 'dd/MM/yyyy')}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Shipping Info */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold mb-3">Informações de Frete</h3>
              <div className="space-y-2 text-sm">
                {shippingOption && (
                  <div>
                    <strong>Opção:</strong> {shippingOption}
                  </div>
                )}
                <div>
                  <strong>Valor do Frete:</strong> {freteValue > 0 ? formatCurrency(freteValue) : 'Retirada / Não informado'}
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
                  <strong>Pedido criado em:</strong> {format(new Date(order.created_at), 'dd/MM/yyyy \'às\' HH:mm', { locale: ptBR })}
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