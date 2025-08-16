import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Copy, Package, Truck } from 'lucide-react';

interface CartItem {
  id: number;
  product_name: string;
  product_code: string;
  qty: number;
  unit_price: number;
}

interface Cart {
  id: number;
  customer_phone: string;
  items: CartItem[];
  subtotal: number;
}

interface ShippingQuote {
  service: 'PAC' | 'SEDEX' | 'RETIRADA';
  serviceCode: string;
  freight_cost: number;
  delivery_days: number;
  description?: string;
}

const Checkout = () => {
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [cep, setCep] = useState('');
  const [cart, setCart] = useState<Cart | null>(null);
  const [shippingQuotes, setShippingQuotes] = useState<ShippingQuote[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingQuote | null>(null);
  const [paymentLink, setPaymentLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [generatingPayment, setGeneratingPayment] = useState(false);

  const normalizePhone = (phone: string): string => {
    const digits = phone.replace(/[^0-9]/g, '');
    if (!digits.startsWith('55')) {
      return '55' + digits;
    }
    return digits;
  };

  const loadCart = async () => {
    if (!phone) {
      toast({
        title: 'Erro',
        description: 'Informe o telefone do cliente',
        variant: 'destructive'
      });
      return;
    }

    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length < 12 || normalizedPhone.length > 15) {
      toast({
        title: 'Erro',
        description: 'Telefone inválido',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      // Simulate API call - in real implementation, this would call GET /sales/preview
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock cart data
      const mockCart: Cart = {
        id: 1,
        customer_phone: normalizedPhone,
        subtotal: 89.70,
        items: [
          {
            id: 1,
            product_name: 'Produto Exemplo 1',
            product_code: 'C001',
            qty: 2,
            unit_price: 29.90
          },
          {
            id: 2,
            product_name: 'Produto Exemplo 2',
            product_code: 'C002',
            qty: 1,
            unit_price: 29.90
          }
        ]
      };

      setCart(mockCart);
      
      // Always add pickup option when cart is loaded
      const pickupOption: ShippingQuote = {
        service: 'RETIRADA',
        serviceCode: 'PICKUP',
        freight_cost: 0,
        delivery_days: 0,
        description: 'Retirada na Fábrica'
      };
      setShippingQuotes([pickupOption]);
      
      toast({
        title: 'Sucesso',
        description: 'Carrinho carregado com sucesso'
      });
    } catch (error) {
      console.error('Error loading cart:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar carrinho',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getShippingQuotes = async (service: 'PAC' | 'SEDEX') => {
    if (!cart || !cep) {
      toast({
        title: 'Erro',
        description: 'Carregue o carrinho e informe o CEP primeiro',
        variant: 'destructive'
      });
      return;
    }

    const cleanCep = cep.replace(/[^0-9]/g, '');
    if (cleanCep.length !== 8) {
      toast({
        title: 'Erro',
        description: 'CEP inválido',
        variant: 'destructive'
      });
      return;
    }

    setLoadingShipping(true);
    try {
      // Simulate API call - in real implementation, this would call POST /shipping/quote
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock shipping data
      const mockQuote: ShippingQuote = {
        service,
        serviceCode: service === 'PAC' ? '04510' : '04014',
        freight_cost: service === 'PAC' ? 15.50 : 25.80,
        delivery_days: service === 'PAC' ? 8 : 3
      };

      setShippingQuotes(prev => {
        // Keep pickup option and filter out the same service
        const filtered = prev.filter(q => q.service !== service);
        return [...filtered, mockQuote];
      });

      toast({
        title: 'Sucesso',
        description: `Cotação ${service} obtida: R$ ${mockQuote.freight_cost.toFixed(2)} em ${mockQuote.delivery_days} dias úteis`
      });
    } catch (error) {
      console.error('Error getting shipping quote:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao cotação frete',
        variant: 'destructive'
      });
    } finally {
      setLoadingShipping(false);
    }
  };

  const generatePaymentLink = async () => {
    if (!cart || !selectedShipping) {
      toast({
        title: 'Erro',
        description: 'Selecione o frete primeiro',
        variant: 'destructive'
      });
      return;
    }

    setGeneratingPayment(true);
    try {
      // Simulate API call - in real implementation, this would call POST /checkout
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const total = cart.subtotal + selectedShipping.freight_cost;
      const mockPaymentLink = `https://mercadopago.com.br/checkout/v1/redirect?pref_id=mock-${Date.now()}`;
      
      setPaymentLink(mockPaymentLink);
      
      toast({
        title: 'Sucesso',
        description: `Link de pagamento gerado! Total: R$ ${total.toFixed(2)}`
      });
    } catch (error) {
      console.error('Error generating payment link:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao gerar link de pagamento',
        variant: 'destructive'
      });
    } finally {
      setGeneratingPayment(false);
    }
  };

  const copyPaymentLink = async () => {
    try {
      await navigator.clipboard.writeText(paymentLink);
      toast({
        title: 'Sucesso',
        description: 'Link copiado para a área de transferência'
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao copiar link',
        variant: 'destructive'
      });
    }
  };

  const formatCep = (value: string) => {
    const numbers = value.replace(/[^0-9]/g, '');
    if (numbers.length <= 5) return numbers;
    return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
  };

  const handleCepChange = async (value: string) => {
    const formattedCep = formatCep(value);
    setCep(formattedCep);
    
    // Auto calculate shipping when CEP is complete
    const cleanCep = formattedCep.replace(/[^0-9]/g, '');
    if (cleanCep.length === 8 && cart) {
      // Clear previous delivery quotes but keep pickup option
      setShippingQuotes(prev => prev.filter(q => q.service === 'RETIRADA'));
      setSelectedShipping(null);
      
      // Get both PAC and SEDEX quotes automatically
      await Promise.all([
        getShippingQuotes('PAC'),
        getShippingQuotes('SEDEX')
      ]);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Checkout</h1>
      </div>

      {/* Customer Phone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Package className="h-5 w-5 mr-2" />
            Dados do Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4">
            <Input
              placeholder="Telefone do cliente"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1"
            />
            <Button onClick={loadCart} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Carregar Carrinho
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cart Items */}
      {cart && (
        <Card>
          <CardHeader>
            <CardTitle>Itens do Carrinho</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {cart.items.map((item) => (
                <div key={item.id} className="flex justify-between items-center p-3 border rounded">
                  <div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">{item.product_code}</Badge>
                      <span className="font-medium">{item.product_name}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {item.qty}x R$ {item.unit_price.toFixed(2)}
                    </div>
                  </div>
                  <div className="font-medium">
                    R$ {(item.qty * item.unit_price).toFixed(2)}
                  </div>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between items-center font-medium">
                <span>Subtotal:</span>
                <span>R$ {cart.subtotal.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shipping */}
      {cart && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Truck className="h-5 w-5 mr-2" />
              Frete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex space-x-4">
                <Input
                  placeholder="CEP de destino"
                  value={cep}
                  onChange={(e) => handleCepChange(e.target.value)}
                  maxLength={9}
                />
                <Button 
                  onClick={() => getShippingQuotes('PAC')} 
                  disabled={loadingShipping}
                  variant="outline"
                >
                  {loadingShipping ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Cotação PAC
                </Button>
                <Button 
                  onClick={() => getShippingQuotes('SEDEX')} 
                  disabled={loadingShipping}
                  variant="outline"
                >
                  {loadingShipping ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Cotação SEDEX
                </Button>
              </div>

              {shippingQuotes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium">Opções de Frete:</h4>
                  {shippingQuotes.map((quote) => (
                    <div 
                      key={quote.service}
                      className={`p-3 border rounded cursor-pointer transition-colors ${
                        selectedShipping?.service === quote.service 
                          ? 'border-primary bg-primary/5' 
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => setSelectedShipping(quote)}
                    >
                      <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">
                          {quote.description || quote.service}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {quote.service === 'RETIRADA' 
                            ? 'Retire no local' 
                            : `${quote.delivery_days} dias úteis`
                          }
                        </div>
                      </div>
                        <div className="font-medium">
                          {quote.freight_cost === 0 ? 'GRÁTIS' : `R$ ${quote.freight_cost.toFixed(2)}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedShipping && (
                <div className="p-3 bg-muted rounded">
                  <div className="flex justify-between items-center">
                    <span>Frete selecionado ({selectedShipping.description || selectedShipping.service}):</span>
                    <span className="font-medium">
                      {selectedShipping.freight_cost === 0 ? 'GRÁTIS' : `R$ ${selectedShipping.freight_cost.toFixed(2)}`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Total and Payment */}
      {cart && selectedShipping && (
        <Card>
          <CardHeader>
            <CardTitle>Finalizar Pedido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>R$ {cart.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Frete ({selectedShipping.description || selectedShipping.service}):</span>
                  <span>{selectedShipping.freight_cost === 0 ? 'GRÁTIS' : `R$ ${selectedShipping.freight_cost.toFixed(2)}`}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span>R$ {(cart.subtotal + selectedShipping.freight_cost).toFixed(2)}</span>
                </div>
              </div>

              <Button 
                onClick={generatePaymentLink} 
                disabled={generatingPayment}
                className="w-full"
                size="lg"
              >
                {generatingPayment ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Gerar Link de Pagamento
              </Button>

              {paymentLink && (
                <div className="p-4 bg-muted rounded">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 mr-4">
                      <p className="text-sm text-muted-foreground mb-1">Link de Pagamento:</p>
                      <p className="text-sm font-mono break-all">{paymentLink}</p>
                    </div>
                    <Button onClick={copyPaymentLink} size="sm" variant="outline">
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Checkout;