import { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, Copy, User, MapPin, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CartItem {
  id: number;
  product_name: string;
  product_code: string;
  qty: number;
  unit_price: number;
}

interface Cart {
  id: number;
  customerPhone: string;
  eventType: string;
  eventDate: string;
  items: CartItem[];
  status: string;
  total: number;
}

interface ShippingOption {
  service_id: string;
  service_name: string;
  company: string;
  price: number;
  delivery_time: number;
  custom_price?: number;
  custom_delivery_time?: number;
}

interface CustomerData {
  name: string;
  cpf: string;
}

interface AddressData {
  street: string;
  number: string;
  complement: string;
  city: string;
  state: string;
  cep: string;
}

const Checkout = () => {
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [customerData, setCustomerData] = useState<CustomerData>({ name: '', cpf: '' });
  const [addressData, setAddressData] = useState<AddressData>({
    street: '',
    number: '',
    complement: '',
    city: '',
    state: '',
    cep: ''
  });
  const [cart, setCart] = useState<Cart | null>(null);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);
  const [paymentLink, setPaymentLink] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [calculatingShipping, setCalculatingShipping] = useState(false);

  const cepInputRef = useRef<HTMLInputElement>(null);

  // Helper functions
  const normalizeCep = (v: string): string => {
    return String(v || "")
      .normalize("NFKD")
      .replace(/[^\d]/g, "")
      .slice(0, 8);
  };

  const isValidCep = (v: string): boolean => {
    return normalizeCep(v).length === 8;
  };

  const normalizePhone = (phone: string): string => {
    const digits = phone.replace(/[^0-9]/g, '');
    if (!digits.startsWith('55')) {
      return '55' + digits;
    }
    return digits;
  };

  // Safe number parser for prices from API (strings)
  const toNumber = (v: any): number => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const loadCustomerData = async (phone: string): Promise<any | null> => {
    const normalizedPhone = normalizePhone(phone);
    setLoadingCustomer(true);
    
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', normalizedPhone)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCustomerData({ name: data.name, cpf: data.cpf || '' });
        setAddressData({
          street: data.street || '',
          number: data.number || '',
          complement: data.complement || '',
          city: data.city || '',
          state: data.state || '',
          cep: data.cep || ''
        });
        
        toast({
          title: 'Cliente encontrado',
          description: `Dados de ${data.name} carregados automaticamente`
        });

        return data;
      } else {
        // Reset customer data if not found
        setCustomerData({ name: '', cpf: '' });
        setAddressData({
          street: '',
          number: '',
          complement: '',
          city: '',
          state: '',
          cep: ''
        });
        return null;
      }
    } catch (error) {
      console.error('Error loading customer:', error);
      return null;
    } finally {
      setLoadingCustomer(false);
    }
  };

  const saveCustomerData = async () => {
    const normalizedPhone = normalizePhone(phone);
    
    try {
      const customerPayload = {
        phone: normalizedPhone,
        name: customerData.name,
        cpf: customerData.cpf,
        street: addressData.street,
        number: addressData.number,
        complement: addressData.complement,
        city: addressData.city,
        state: addressData.state,
        cep: normalizeCep(addressData.cep)
      };

      const { error } = await supabase
        .from('customers')
        .upsert(customerPayload, { onConflict: 'phone' });

      if (error) throw error;

      toast({
        title: 'Dados salvos',
        description: 'Informações do cliente salvas com sucesso'
      });
    } catch (error) {
      console.error('Error saving customer:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao salvar dados do cliente',
        variant: 'destructive'
      });
    }
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

    // Load customer data first
    const customer = await loadCustomerData(phone);

    setLoading(true);
    try {
      // Simulate API call - in real implementation, this would call GET /sales/preview
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock cart data
      const mockCart: Cart = {
        id: 1,
        customerPhone: normalizedPhone,
        eventType: 'BAZAR',
        eventDate: '2025-08-16',
        status: 'OPEN',
        total: 89.70,
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
      
      // Auto ação: se há CEP válido no cadastro, dispara busca de endereço; senão foca no campo
      const cepFromCustomer = normalizeCep((customer?.cep as string) || addressData.cep);
      if (isValidCep(cepFromCustomer)) {
        await handleCepChange(cepFromCustomer);
      } else {
        setTimeout(() => cepInputRef.current?.focus(), 0);
      }
      
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

  const calculateShipping = async (cep: string) => {
    if (!isValidCep(cep)) return;
    
    setCalculatingShipping(true);
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio-shipping', {
        body: { to_postal_code: cep }
      });

      if (error) throw error;

      if (data?.shipping_options) {
        setShippingOptions(data.shipping_options);
        toast({
          title: 'Frete calculado',
          description: `${data.shipping_options.length} opção(ões) de frete encontrada(s)`,
        });
      }
    } catch (error) {
      console.error('Shipping calculation error:', error);
      toast({
        title: 'Erro no cálculo de frete',
        description: 'Não foi possível calcular o frete. Tente novamente.',
        variant: 'destructive'
      });
      setShippingOptions([]);
    } finally {
      setCalculatingShipping(false);
    }
  };

  const generatePaymentLink = async () => {
    if (!customerData.name || !customerData.cpf || !addressData.street || !addressData.cep || !selectedShipping) {
      toast({
        title: 'Dados incompletos',
        description: 'Preencha todos os dados obrigatórios e selecione uma opção de frete',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          cartItems: cart?.items || [],
          customerData,
          addressData,
          shippingCost: toNumber(selectedShipping.custom_price ?? selectedShipping.price),
          total: toNumber(cart?.total || 0) + toNumber(selectedShipping.custom_price ?? selectedShipping.price),
          cartId: cart?.id
        }
      });

      if (error) throw error;

      if (data?.init_point) {
        setPaymentLink(data.init_point);
        // Open payment link in new tab
        window.open(data.init_point, '_blank');
        
        toast({
          title: 'Link de pagamento gerado',
          description: 'O link foi aberto em uma nova aba'
        });
      }
    } catch (error) {
      console.error('Error generating payment link:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao gerar link de pagamento',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
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

  const searchAddressByCep = async (cep: string) => {
    const cleanCep = normalizeCep(cep);
    if (!isValidCep(cep)) return;

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      
      if (data.erro) {
        toast({
          title: 'CEP não encontrado',
          description: 'Verifique o CEP informado',
          variant: 'destructive'
        });
        return;
      }

      setAddressData(prev => ({
        ...prev,
        street: data.logradouro || '',
        city: data.localidade || '',
        state: data.uf || '',
        cep: formatCep(cleanCep)
      }));

      toast({
        title: 'Endereço encontrado',
        description: `${data.logradouro}, ${data.localidade} - ${data.uf}`
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao buscar endereço',
        variant: 'destructive'
      });
    }
  };

  const handleCepChange = async (value: string) => {
    const normalizedCep = normalizeCep(value);
    const formattedCep = normalizedCep.length === 8 ? 
      `${normalizedCep.slice(0, 5)}-${normalizedCep.slice(5, 8)}` : 
      normalizedCep;
    
    setAddressData(prev => ({ ...prev, cep: formattedCep }));
    
    // Auto search address when CEP is complete
    if (isValidCep(value)) {
      await searchAddressByCep(formattedCep);
      await calculateShipping(normalizedCep);
    }
  };

  const handleShippingSelection = (optionId: string) => {
    const option = shippingOptions.find(opt => opt.service_id === optionId);
    setSelectedShipping(option || null);
  };

  const getTotalWithShipping = () => {
    if (!cart) return 0;
    const shipping = selectedShipping ? toNumber(selectedShipping.custom_price ?? selectedShipping.price) : 0;
    return toNumber(cart.total) + shipping;
  };

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Checkout</h1>
      </div>

      {/* Customer Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <User className="h-5 w-5 mr-2" />
            Dados do Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex space-x-4">
              <Input
                placeholder="Telefone do cliente"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="flex-1"
              />
              <Button onClick={loadCart} disabled={loading || loadingCustomer}>
                {loading || loadingCustomer ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Carregar Carrinho
              </Button>
            </div>
            
            {loadingCustomer && (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Buscando dados do cliente...</span>
              </div>
            )}
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
                <span>R$ {cart.total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Address Information */}
      {cart && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <MapPin className="h-5 w-5 mr-2" />
              Endereço de Entrega
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Nome completo"
                  value={customerData.name}
                  onChange={(e) => setCustomerData(prev => ({ ...prev, name: e.target.value }))}
                />
                <Input
                  placeholder="CPF"
                  value={customerData.cpf}
                  onChange={(e) => setCustomerData(prev => ({ ...prev, cpf: e.target.value }))}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  placeholder="CEP"
                  ref={cepInputRef}
                  value={addressData.cep}
                  onChange={(e) => handleCepChange(e.target.value)}
                  maxLength={9}
                />
                <Input
                  placeholder="Rua"
                  value={addressData.street}
                  onChange={(e) => setAddressData(prev => ({ ...prev, street: e.target.value }))}
                  className="md:col-span-2"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input
                  placeholder="Número"
                  value={addressData.number}
                  onChange={(e) => setAddressData(prev => ({ ...prev, number: e.target.value }))}
                />
                <Input
                  placeholder="Complemento"
                  value={addressData.complement}
                  onChange={(e) => setAddressData(prev => ({ ...prev, complement: e.target.value }))}
                />
                <Input
                  placeholder="Cidade"
                  value={addressData.city}
                  onChange={(e) => setAddressData(prev => ({ ...prev, city: e.target.value }))}
                />
                <Input
                  placeholder="Estado"
                  value={addressData.state}
                  onChange={(e) => setAddressData(prev => ({ ...prev, state: e.target.value }))}
                  maxLength={2}
                />
              </div>
              
              {calculatingShipping && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Calculando frete...</span>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={saveCustomerData} variant="outline">
                  Salvar Dados do Cliente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shipping Options */}
      {shippingOptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Truck className="h-5 w-5 mr-2" />
              Opções de Frete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={selectedShipping?.service_id} onValueChange={handleShippingSelection}>
              <div className="space-y-3">
                {shippingOptions.map((option) => (
                  <div key={option.service_id} className="flex items-center space-x-2 p-3 border rounded">
                    <RadioGroupItem value={option.service_id} id={option.service_id} />
                    <Label htmlFor={option.service_id} className="flex-1 cursor-pointer">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium">{option.company} - {option.service_name}</div>
                          <div className="text-sm text-muted-foreground">
                            Entrega em até {option.custom_delivery_time || option.delivery_time} dias úteis
                          </div>
                        </div>
                        <div className="font-medium">
                          R$ {toNumber(option.custom_price ?? option.price).toFixed(2)}
                        </div>
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {/* Total and Payment */}
      {cart && (
        <Card>
          <CardHeader>
            <CardTitle>Finalizar Pedido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>R$ {cart.total.toFixed(2)}</span>
                </div>
                {selectedShipping && (
                  <div className="flex justify-between">
                    <span>Frete:</span>
                    <span>R$ {toNumber(selectedShipping.custom_price ?? selectedShipping.price).toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span>R$ {getTotalWithShipping().toFixed(2)}</span>
                </div>
              </div>

              <Button 
                onClick={generatePaymentLink} 
                disabled={loading || !selectedShipping}
                className="w-full"
                size="lg"
              >
                {loading ? (
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