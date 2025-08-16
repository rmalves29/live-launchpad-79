import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, RefreshCw } from 'lucide-react';
import Navbar from '@/components/Navbar';

interface Product {
  id: number;
  code: string;
  name: string;
  price: number;
  stock: number;
  image_url?: string;
  is_active: boolean;
}

const PedidosManual = () => {
  const { toast } = useToast();
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
      let query = supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
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

  useEffect(() => {
    loadProducts();
  }, [searchQuery, itemsPerPage]);

  const normalizePhone = (phone: string): string => {
    const digits = phone.replace(/[^0-9]/g, '');
    if (!digits.startsWith('55')) {
      return '55' + digits;
    }
    return digits;
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
    if (normalizedPhone.length < 12 || normalizedPhone.length > 15) {
      toast({
        title: 'Erro',
        description: 'Telefone inválido. Use formato com DDD (ex: 11999999999)',
        variant: 'destructive'
      });
      return;
    }

    setProcessingIds(prev => new Set(prev).add(product.id));

    try {
      const subtotal = product.price * qty;
      
      // Create order in database
      const { error: orderError } = await supabase
        .from('orders')
        .insert([{
          customer_phone: normalizedPhone,
          event_type: 'MANUAL',
          event_date: new Date().toISOString().split('T')[0], // Today's date
          total_amount: subtotal,
          is_paid: false
        }]);

      if (orderError) throw orderError;

      // Update product stock in database
      const { error: stockError } = await supabase
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
        description: `Pedido criado: ${product.code} x${qty} para ${normalizedPhone}. Subtotal: R$ ${subtotal.toFixed(2)}`,
      });

      // Clear inputs for this product
      setPhones(prev => ({ ...prev, [product.id]: '' }));
      setQuantities(prev => ({ ...prev, [product.id]: 1 }));

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
      <Navbar />
      <div className="p-6">
        <div className="container mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Pedidos Manual</h1>
      </div>

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
        </div>
      </div>
    </div>
  );
};

export default PedidosManual;