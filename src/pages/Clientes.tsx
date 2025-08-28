import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Users, UserPlus, Edit, Trash2, Search, Eye, ShoppingBag, DollarSign, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Customer {
  id: number;
  phone: string;
  name: string;
  cpf?: string;
  street?: string;
  number?: string;
  complement?: string;
  city?: string;
  state?: string;
  cep?: string;
  created_at: string;
  updated_at: string;
  total_orders: number;
  total_spent: number;
  last_order_date?: string;
}

interface Order {
  id: number;
  event_type: string;
  event_date: string;
  total_amount: number;
  is_paid: boolean;
  created_at: string;
  cart_items: Array<{
    qty: number;
    unit_price: number;
    product: {
      name: string;
      code: string;
    };
  }>;
}

const Clientes = () => {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newCustomer, setNewCustomer] = useState({ phone: '', name: '' });
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const normalizePhone = (phone: string): string => {
    const digits = phone.replace(/[^0-9]/g, '');
    if (!digits.startsWith('55')) {
      return '55' + digits;
    }
    return digits;
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (customersError) throw customersError;

      // Get order statistics for each customer
      const customersWithStats = await Promise.all(
        (customersData || []).map(async (customer) => {
          const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('total_amount, is_paid, created_at')
            .eq('customer_phone', customer.phone);

          if (ordersError) {
            console.error('Error loading orders for customer:', customer.phone, ordersError);
            return {
              ...customer,
              total_orders: 0,
              total_spent: 0,
              last_order_date: undefined
            };
          }

          const totalOrders = orders?.length || 0;
          const totalSpent = orders?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
          const lastOrderDate = orders?.length > 0 
            ? orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
            : undefined;

          return {
            ...customer,
            total_orders: totalOrders,
            total_spent: totalSpent,
            last_order_date: lastOrderDate
          };
        })
      );

      setCustomers(customersWithStats);
    } catch (error) {
      console.error('Error loading customers:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar clientes',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const createCustomer = async () => {
    if (!newCustomer.phone || !newCustomer.name) {
      toast({
        title: 'Erro',
        description: 'Informe telefone e nome completo',
        variant: 'destructive'
      });
      return;
    }

    const normalizedPhone = normalizePhone(newCustomer.phone);
    if (normalizedPhone.length < 12 || normalizedPhone.length > 15) {
      toast({
        title: 'Erro',
        description: 'Telefone inválido',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('customers')
        .insert({
          phone: normalizedPhone,
          name: newCustomer.name
        });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Cliente cadastrado com sucesso'
      });
      
      setNewCustomer({ phone: '', name: '' });
      loadCustomers();
    } catch (error: any) {
      console.error('Error creating customer:', error);
      toast({
        title: 'Erro',
        description: error.message?.includes('duplicate') 
          ? 'Cliente já cadastrado com este telefone'
          : 'Erro ao cadastrar cliente',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteCustomer = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este cliente?')) return;

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Cliente excluído com sucesso'
      });
      
      loadCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao excluir cliente',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm) ||
    (customer.cpf && customer.cpf.includes(searchTerm))
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatPhone = (phone: string) => {
    // Remove country code and format as (XX) XXXXX-XXXX
    const cleanPhone = phone.replace('55', '');
    if (cleanPhone.length === 11) {
      return `(${cleanPhone.slice(0, 2)}) ${cleanPhone.slice(2, 7)}-${cleanPhone.slice(7)}`;
    }
    return phone;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const loadCustomerOrders = async (customer: Customer) => {
    setLoadingOrders(true);
    setSelectedCustomer(customer);
    
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          cart_id,
          event_type,
          event_date,
          total_amount,
          is_paid,
          created_at
        `)
        .eq('customer_phone', customer.phone)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get cart items for each order
      const ordersWithItems = await Promise.all(
        (data || []).map(async (order) => {
          const { data: cartItems, error: itemsError } = await supabase
            .from('cart_items')
            .select(`
              qty,
              unit_price,
              products(name, code)
            `)
            .eq('cart_id', order.cart_id || 0);

          if (itemsError) {
            console.error('Error loading cart items:', itemsError);
            return {
              ...order,
              cart_items: []
            };
          }

          return {
            ...order,
            cart_items: (cartItems || []).map(item => ({
              qty: item.qty,
              unit_price: item.unit_price,
              product: {
                name: item.products?.name || 'Produto removido',
                code: item.products?.code || 'N/A'
              }
            }))
          };
        })
      );

      setCustomerOrders(ordersWithItems);
    } catch (error) {
      console.error('Error loading customer orders:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar pedidos do cliente',
        variant: 'destructive'
      });
    } finally {
      setLoadingOrders(false);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-6xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center">
          <Users className="h-8 w-8 mr-3 text-primary" />
          Clientes
        </h1>
      </div>

      <Tabs defaultValue="list" className="space-y-6">
        <TabsList>
          <TabsTrigger value="list" className="flex items-center">
            <Users className="h-4 w-4 mr-2" />
            Lista de Clientes
          </TabsTrigger>
          <TabsTrigger value="create" className="flex items-center">
            <UserPlus className="h-4 w-4 mr-2" />
            Cadastrar Cliente
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <UserPlus className="h-5 w-5 mr-2" />
                Cadastrar Novo Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Telefone (obrigatório)"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                />
                <Input
                  placeholder="Nome completo (obrigatório)"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              
              <div className="flex justify-end mt-4">
                <Button onClick={createCustomer} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <UserPlus className="h-4 w-4 mr-2" />
                  )}
                  Cadastrar Cliente
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <Users className="h-5 w-5 mr-2" />
                  Lista de Clientes ({filteredCustomers.length})
                </span>
                <Button onClick={loadCustomers} disabled={loading} size="sm" variant="outline">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Atualizar
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, telefone ou CPF..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                  />
                </div>

                <Separator />

                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span>Carregando clientes...</span>
                  </div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchTerm ? 'Nenhum cliente encontrado com os critérios de busca.' : 'Nenhum cliente cadastrado.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                       <TableRow>
                           <TableHead>Nome</TableHead>
                           <TableHead>Telefone</TableHead>
                           <TableHead>Pedidos</TableHead>
                           <TableHead>Total Gasto</TableHead>
                           <TableHead>Último Pedido</TableHead>
                           <TableHead>Cadastrado</TableHead>
                           <TableHead className="text-right">Ações</TableHead>
                         </TableRow>
                      </TableHeader>
                      <TableBody>
                         {filteredCustomers.map((customer) => (
                           <TableRow key={customer.id}>
                             <TableCell className="font-medium">
                               <div className="flex flex-col">
                                 <span>{customer.name}</span>
                                 <span className="text-sm text-muted-foreground font-mono">
                                   {formatPhone(customer.phone)}
                                 </span>
                               </div>
                             </TableCell>
                             <TableCell className="font-mono">
                               {customer.cpf ? (
                                 <Badge variant="outline">{customer.cpf}</Badge>
                               ) : (
                                 <span className="text-muted-foreground">-</span>
                               )}
                             </TableCell>
                             <TableCell>
                               <div className="flex items-center">
                                 <ShoppingBag className="h-4 w-4 mr-1 text-muted-foreground" />
                                 <span className="font-semibold">{customer.total_orders}</span>
                               </div>
                             </TableCell>
                             <TableCell>
                               <div className="flex items-center">
                                 <DollarSign className="h-4 w-4 mr-1 text-muted-foreground" />
                                 <span className="font-semibold text-green-600">
                                   {formatCurrency(customer.total_spent)}
                                 </span>
                               </div>
                             </TableCell>
                             <TableCell>
                               {customer.last_order_date ? (
                                 <div className="flex items-center">
                                   <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                                   <span>{formatDate(customer.last_order_date)}</span>
                                 </div>
                               ) : (
                                 <span className="text-muted-foreground">Nunca</span>
                               )}
                             </TableCell>
                             <TableCell>{formatDate(customer.created_at)}</TableCell>
                             <TableCell className="text-right">
                               <div className="flex justify-end space-x-2">
                                 <Dialog>
                                   <DialogTrigger asChild>
                                     <Button
                                       onClick={() => loadCustomerOrders(customer)}
                                       size="sm"
                                       variant="outline"
                                     >
                                       <Eye className="h-4 w-4" />
                                     </Button>
                                   </DialogTrigger>
                                   <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                                     <DialogHeader>
                                       <DialogTitle>
                                         Pedidos de {selectedCustomer?.name}
                                       </DialogTitle>
                                     </DialogHeader>
                                     <div className="space-y-4">
                                       {loadingOrders ? (
                                         <div className="flex items-center justify-center py-8">
                                           <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                           <span>Carregando pedidos...</span>
                                         </div>
                                       ) : customerOrders.length === 0 ? (
                                         <div className="text-center py-8 text-muted-foreground">
                                           Nenhum pedido encontrado para este cliente.
                                         </div>
                                       ) : (
                                         <div className="space-y-4">
                                           {customerOrders.map((order) => (
                                             <Card key={order.id}>
                                               <CardHeader className="pb-3">
                                                 <div className="flex justify-between items-start">
                                                   <div>
                                                     <CardTitle className="text-lg">
                                                       Pedido #{order.id}
                                                     </CardTitle>
                                                     <p className="text-sm text-muted-foreground">
                                                       {order.event_type} - {formatDate(order.event_date)}
                                                     </p>
                                                   </div>
                                                   <div className="text-right">
                                                     <div className="text-lg font-bold text-green-600">
                                                       {formatCurrency(order.total_amount)}
                                                     </div>
                                                     <Badge variant={order.is_paid ? "default" : "secondary"}>
                                                       {order.is_paid ? "Pago" : "Pendente"}
                                                     </Badge>
                                                   </div>
                                                 </div>
                                               </CardHeader>
                                               <CardContent>
                                                 <div className="space-y-2">
                                                   <h4 className="font-semibold">Itens:</h4>
                                                   {order.cart_items.map((item, index) => (
                                                     <div key={index} className="flex justify-between items-center py-2 border-b last:border-b-0">
                                                       <div>
                                                         <span className="font-medium">{item.product.name}</span>
                                                         <span className="text-sm text-muted-foreground ml-2">
                                                           ({item.product.code})
                                                         </span>
                                                       </div>
                                                       <div className="text-right">
                                                         <div>{item.qty}x {formatCurrency(item.unit_price)}</div>
                                                         <div className="font-semibold">
                                                           {formatCurrency(item.qty * item.unit_price)}
                                                         </div>
                                                       </div>
                                                     </div>
                                                   ))}
                                                 </div>
                                               </CardContent>
                                             </Card>
                                           ))}
                                         </div>
                                       )}
                                     </div>
                                   </DialogContent>
                                 </Dialog>
                                 <Button
                                   onClick={() => deleteCustomer(customer.id)}
                                   size="sm"
                                   variant="outline"
                                   className="text-destructive hover:text-destructive"
                                 >
                                   <Trash2 className="h-4 w-4" />
                                 </Button>
                               </div>
                             </TableCell>
                           </TableRow>
                         ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Clientes;