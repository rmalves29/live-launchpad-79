import { useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Copy, Package, Truck, User, MapPin } from 'lucide-react';
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
  customer_phone: string;
  items: CartItem[];
  subtotal: number;
}

interface ShippingQuote {
  service: string;
  serviceCode: string;
  freight_cost: number;
  delivery_days: number;
  description?: string;
  provider?: 'CORREIOS' | 'MELHOR_ENVIO';
  company?: string;
}

interface CustomerData {
  name: string;
  cpf: string;
  email?: string;
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
  const [shippingQuotes, setShippingQuotes] = useState<ShippingQuote[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingQuote | null>(null);
  const [paymentLink, setPaymentLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [generatingPayment, setGeneratingPayment] = useState(false);

  const cepInputRef = useRef<HTMLInputElement>(null);

  // CEP helper functions
  const normalizeCep = (v: string): string => {
    return String(v || "")
      .normalize("NFKD")             // tira acentos e caracteres estranhos
      .replace(/[^\d]/g, "")         // deixa só dígitos
      .slice(0, 8);                  // máximo 8
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

  const loadCustomerData = async (phone: string) => {
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
      }
    } catch (error) {
      console.error('Error loading customer:', error);
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
    await loadCustomerData(phone);

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
      
      // Auto ação: se há CEP válido no cadastro, dispara busca de endereço e frete; senão foca no campo
      const cepFromCustomer = normalizeCep(addressData.cep);
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

  const getMelhorEnvioQuotes = async (cep: string) => {
    if (!cart) return [];
    
    try {
      const products = cart.items.map(item => ({
        id: item.id.toString(),
        width: 10, // Default values - can be configured
        height: 2,
        length: 16, 
        weight: 0.3,
        price: item.unit_price,
        quantity: item.qty
      }));

      const { data, error } = await supabase.functions.invoke('melhor-envio-shipping', {
        body: {
          cep_origem: '31575060', // Configure in settings
          cep_destino: cep,
          products: products
        }
      });

      if (error) {
        console.error('Melhor Envio error:', error);
        return [];
      }

      if (data.opcoes && data.opcoes.length > 0) {
        return data.opcoes.map((opcao: any) => ({
          service: opcao.nome,
          serviceCode: opcao.id.toString(),
          freight_cost: opcao.preco,
          delivery_days: opcao.prazo_max || opcao.prazo_min || 0,
          provider: 'MELHOR_ENVIO' as const,
          company: opcao.empresa,
          description: `${opcao.nome} - ${opcao.empresa}`
        }));
      }

      return [];
    } catch (error) {
      console.error('Error calling Melhor Envio:', error);
      return [];
    }
  };

  const getShippingQuotes = async (cepInput?: string) => {
    const cepToUse = cepInput || addressData.cep;
    if (!cart || !cepToUse) {
      toast({
        title: 'Erro',
        description: 'Carregue o carrinho e informe o CEP primeiro',
        variant: 'destructive'
      });
      return;
    }

    const cleanCep = normalizeCep(cepToUse);
    if (!isValidCep(cepToUse)) {
      toast({
        title: 'Erro',
        description: 'CEP inválido. Digite 8 dígitos.',
        variant: 'destructive'
      });
      return;
    }

    setLoadingShipping(true);
    console.log('Iniciando cálculo de frete para CEP:', cleanCep);
    
    try {
      // Call both Correios and Melhor Envio APIs in parallel
      const [correiosPromise, melhorEnvioPromise] = await Promise.allSettled([
        supabase.functions.invoke('calculate-shipping', {
          body: { cep: cleanCep }
        }),
        getMelhorEnvioQuotes(cleanCep)
      ]);

      const quotes: ShippingQuote[] = [];
      
      // Process Correios results
      if (correiosPromise.status === 'fulfilled') {
        const { data, error } = correiosPromise.value;
        if (!error && !data.error && data.resultados && data.resultados.length > 0) {
          data.resultados.forEach((resultado: any) => {
            const quote: ShippingQuote = {
              service: resultado.servico,
              serviceCode: resultado.codigo,
              freight_cost: resultado.valor || 0,
              delivery_days: resultado.prazo || 0,
              provider: 'CORREIOS',
              description: `${resultado.servico} - Correios`
            };
            quotes.push(quote);
          });
        }
      }

      // Process Melhor Envio results
      if (melhorEnvioPromise.status === 'fulfilled') {
        const melhorEnvioQuotes = melhorEnvioPromise.value;
        quotes.push(...melhorEnvioQuotes);
      }

      setShippingQuotes(prev => {
        // Keep pickup option and add new shipping quotes
        const pickup = prev.find(q => q.service === 'RETIRADA');
        return pickup ? [pickup, ...quotes] : quotes;
      });

      console.log('Cálculo de frete concluído');

      // Show freight results
      if (quotes.length > 0) {
        const correiosQuotes = quotes.filter(q => q.provider === 'CORREIOS');
        const melhorEnvioQuotes = quotes.filter(q => q.provider === 'MELHOR_ENVIO');
        
        let resultsText = '';
        if (correiosQuotes.length > 0) {
          resultsText += 'Correios: ' + correiosQuotes.map(q => `${q.service} R$ ${q.freight_cost.toFixed(2)}`).join(', ');
        }
        if (melhorEnvioQuotes.length > 0) {
          if (resultsText) resultsText += ' | ';
          resultsText += 'Melhor Envio: ' + melhorEnvioQuotes.map(q => `${q.service} R$ ${q.freight_cost.toFixed(2)}`).join(', ');
        }
        
        toast({
          title: 'Frete calculado',
          description: resultsText
        });
      } else {
        toast({
          title: 'Atenção',
          description: 'Nenhuma opção de frete disponível para este CEP',
          variant: 'destructive'
        });
      }

    } catch (error) {
      console.error('Error calculating shipping:', error);
      toast({
        title: 'Erro',
        description: `Erro ao calcular frete: ${error.message}`,
        variant: 'destructive'
      });
    } finally {
      setLoadingShipping(false);
    }
  };

  const handleFreteCalculation = async () => {
    const cep = normalizeCep(addressData.cep);
    if (cep.length !== 8) {
      toast({
        title: 'Erro',
        description: 'CEP inválido. Digite 8 dígitos.',
        variant: 'destructive'
      });
      return;
    }

    await getShippingQuotes(cep);
  };

  const importToMelhorEnvio = async (orderData: any, selectedService: ShippingQuote) => {
    try {
      console.log("Importing order to Melhor Envio...", orderData);
      
      const melhorEnvioData = {
        action: 'import_order',
        orderData: {
          serviceId: selectedService.serviceCode,
          from: {
            name: "Loja Virtual",
            phone: "31999999999", // Configure with store data
            email: "loja@exemplo.com",
            document: "00000000000191", // Configure with store CNPJ
            address: "Rua da Loja, 123",
            number: "123",
            district: "Centro",
            city: "Belo Horizonte",
            state_abbr: "MG",
            postal_code: "31575060" // Configure with store CEP
          },
          to: {
            name: customerData.name,
            phone: normalizePhone(phone),
            email: customerData.email || `${normalizePhone(phone)}@checkout.com`,
            document: customerData.cpf?.replace(/\D/g, '') || "00000000000",
            address: addressData.street,
            complement: addressData.complement,
            number: addressData.number,
            district: "Centro", // You might want to add district field
            city: addressData.city,
            state_abbr: addressData.state,
            postal_code: addressData.cep
          },
          products: cart?.items.map(item => ({
            id: item.id.toString(),
            width: 10, // Default values - can be configured per product
            height: 2,
            length: 16,
            weight: 0.3,
            insurance_value: item.unit_price,
            quantity: item.qty
          })) || [],
          insurance_value: cart?.subtotal || 0,
          order_id: cart?.id.toString() || "",
          order_url: window.location.origin
        }
      };

      const { data, error } = await supabase.functions.invoke('melhor-envio-shipping', {
        body: melhorEnvioData
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.success) {
        toast({
          title: "Pedido importado",
          description: `Pedido #${data.melhor_envio_id} importado para o Melhor Envio com sucesso!`,
        });
        return data.melhor_envio_id;
      } else {
        throw new Error("Falha na importação para o Melhor Envio");
      }
    } catch (error) {
      console.error("Error importing to Melhor Envio:", error);
      toast({
        title: "Aviso",
        description: "Pedido criado, mas houve erro na importação para o Melhor Envio. Você pode importar manualmente.",
        variant: "destructive"
      });
      return null;
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

    if (!customerData.name) {
      toast({
        title: 'Erro',
        description: 'Preencha os dados do cliente',
        variant: 'destructive'
      });
      return;
    }

    setGeneratingPayment(true);
    try {
      // Prepare cart items for Mercado Pago
      const cartItems = cart.items.map(item => ({
        name: item.product_name,
        qty: item.qty,
        unit_price: item.unit_price.toString()
      }));

      const total = cart.subtotal + selectedShipping.freight_cost;
      
      // Prepare payment data
      const paymentData = {
        cartItems,
        customerData: {
          ...customerData,
          phone: normalizePhone(phone),
          email: customerData.email || `${normalizePhone(phone)}@checkout.com`
        },
        addressData,
        shippingCost: selectedShipping.freight_cost,
        total,
        cartId: cart.id
      };

      console.log("Generating payment with data:", paymentData);

      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: paymentData
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.payment_url) {
        setPaymentLink(data.payment_url);
        
        // If Melhor Envio service was selected, import the order
        if (selectedShipping.provider === 'MELHOR_ENVIO') {
          await importToMelhorEnvio(paymentData, selectedShipping);
        }
        
        // Open Mercado Pago checkout in new tab
        window.open(data.payment_url, '_blank');
        
        toast({
          title: "Redirecionando para o pagamento",
          description: `Total: R$ ${total.toFixed(2)} - Mercado Pago aberto em nova aba`,
        });
      } else {
        throw new Error("URL de pagamento não recebida");
      }
    } catch (error) {
      console.error("Payment generation error:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao gerar link de pagamento.",
        variant: "destructive",
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

  const searchAddressByCep = async (cep: string) => {
    const cleanCep = normalizeCep(cep);
    if (!isValidCep(cep)) return;

    setLoadingAddress(true);
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
    } finally {
      setLoadingAddress(false);
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
      
      // Auto calculate shipping when CEP is complete and cart is loaded
      if (cart) {
        // Clear previous delivery quotes but keep pickup option
        setShippingQuotes(prev => prev.filter(q => q.service === 'RETIRADA'));
        setSelectedShipping(null);
        
        // Auto calculate both PAC and SEDEX quotes
        toast({
          title: 'Calculando frete',
          description: 'Buscando melhores opções de entrega...'
        });
        
        console.log("Iniciando cálculo de frete para CEP:", normalizedCep);
        try {
          await getShippingQuotes();
          console.log("Cálculo de frete concluído");
        } catch (error) {
          console.error("Erro no cálculo de frete:", error);
        }
      }
    }
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
                <span>R$ {cart.subtotal.toFixed(2)}</span>
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
              
              {loadingAddress && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Buscando endereço...</span>
                </div>
              )}
              
               {/* Freight Calculator Section */}
                <div className="mt-6 p-4 border border-primary/20 rounded-lg bg-primary/5">
                  <h3 className="text-lg font-semibold mb-3 text-primary">CALCULAR FRETE</h3>
                  <p className="text-sm text-muted-foreground mb-4">Digite o CEP (8 dígitos) para calcular frete via Correios e Melhor Envio.</p>
                 
                 <div className="flex gap-3">
                   <Input
                     placeholder="Ex: 01001-000"
                     value={addressData.cep}
                     onChange={(e) => handleCepChange(e.target.value)}
                     maxLength={9}
                     className="flex-1"
                     autoComplete="postal-code"
                   />
                   <Button 
                     onClick={handleFreteCalculation}
                     disabled={loadingShipping || !cart}
                     variant="default"
                   >
                     {loadingShipping ? (
                       <Loader2 className="h-4 w-4 animate-spin mr-2" />
                     ) : null}
                     Calcular Frete
                   </Button>
                 </div>
                 
                 {loadingShipping && (
                   <div className="mt-3 text-sm text-muted-foreground">
                     Calculando...
                   </div>
                 )}
               </div>

               <div className="flex justify-end">
                 <Button onClick={saveCustomerData} variant="outline">
                   Salvar Dados do Cliente
                 </Button>
               </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shipping */}
      {cart && addressData.cep && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Truck className="h-5 w-5 mr-2" />
              Frete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loadingShipping && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Calculando opções de frete...</span>
                </div>
              )}

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