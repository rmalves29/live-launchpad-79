import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Users, UserPlus, Edit, Trash2, Search, Eye, ShoppingBag, DollarSign, Calendar, ArrowLeft, BarChart3, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useAuth } from '@/hooks/useAuth';
import { useTenantContext } from '@/contexts/TenantContext';
import { normalizeForStorage, formatPhoneForDisplay } from '@/lib/phone-utils';
interface Customer {
  id: number;
  phone: string;
  name: string;
  email?: string;
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
  tags?: Array<{
    id: number;
    name: string;
    color: string;
  }>;
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
  const { profile } = useAuth();
  const { tenantId } = useTenantContext();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newCustomer, setNewCustomer] = useState({ phone: '', name: '' });
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'management'>('dashboard');

  const normalizePhone = (phone: string): string => {
    return normalizeForStorage(phone);
  };

  const formatPhone = (phone: string): string => {
    return formatPhoneForDisplay(phone);
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { data: customersData, error: customersError } = await supabaseTenant
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (customersError) throw customersError;

      // Get order statistics and tags for each customer
      const customersWithStats = await Promise.all(
        (customersData || []).map(async (customer) => {
          // Load orders
            const { data: orders, error: ordersError } = await supabaseTenant
              .from('orders')
              .select('total_amount, is_paid, created_at')
              .eq('customer_phone', customer.phone);

          // Load customer tags - temporarily disabled due to TypeScript complexity
          // TODO: Re-implement tags loading with simpler approach
          const customerTags: any[] = [];
          const tagsError = null;

          if (ordersError) {
            console.error('Error loading orders for customer:', customer.phone, ordersError);
          }

          if (tagsError) {
            console.error('Error loading tags for customer:', customer.id, tagsError);
          }

          const totalOrders = orders?.length || 0;
          const totalSpent = orders?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
          const lastOrderDate = orders?.length > 0 
            ? orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
            : undefined;

          const tags = customerTags?.map(ct => ct.customer_tags).filter(Boolean) || [];

          return {
            ...customer,
            total_orders: totalOrders,
            total_spent: totalSpent,
            last_order_date: lastOrderDate,
            tags
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
      const { error } = await supabaseTenant
        .from('customers')
        .insert({
          phone: normalizedPhone,
          name: newCustomer.name,
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
      const { error } = await supabaseTenant
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

  const updateCustomer = async () => {
    if (!editingCustomer || !editingCustomer.name || !editingCustomer.phone) {
      toast({
        title: 'Erro',
        description: 'Nome e telefone são obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabaseTenant
        .from('customers')
        .update({
          name: editingCustomer.name,
          cpf: editingCustomer.cpf || null,
          street: editingCustomer.street || null,
          number: editingCustomer.number || null,
          complement: editingCustomer.complement || null,
          city: editingCustomer.city || null,
          state: editingCustomer.state || null,
          cep: editingCustomer.cep || null,
        })
        .eq('id', editingCustomer.id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Cliente atualizado com sucesso'
      });
      
      setEditingCustomer(null);
      loadCustomers();
    } catch (error) {
      console.error('Error updating customer:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao atualizar cliente',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      loadCustomers();
    }
  }, [tenantId]);

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm) ||
    (customer.cpf && customer.cpf.includes(searchTerm))
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
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
      const { data, error } = await supabaseTenant
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
          const { data: cartItems, error: itemsError } = await supabaseTenant
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

  if (activeView === 'management') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <Users className="h-8 w-8 mr-3 text-primary" />
                Gerenciar Clientes
              </h1>
              <p className="text-muted-foreground mt-2">
                Cadastre, edite e visualize informações dos clientes
              </p>
            </div>
            <Button 
              onClick={() => setActiveView('dashboard')} 
              variant="outline"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao Dashboard
            </Button>
          </div>

          <div className="space-y-6">
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
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                       </TableHeader>
                       <TableBody>
                          {filteredCustomers.map((customer) => (
                             <TableRow key={customer.id}>
                               <TableCell className="font-medium">
                                 <div className="flex flex-col space-y-1">
                                   <span>{customer.name}</span>
                                   {customer.tags && customer.tags.length > 0 && (
                                     <div className="flex flex-wrap gap-1">
                                       {customer.tags.map((tag) => (
                                         <Badge 
                                           key={tag.id} 
                                           variant="outline" 
                                           className="text-xs"
                                           style={{ 
                                             borderColor: tag.color, 
                                             color: tag.color 
                                           }}
                                         >
                                           {tag.name}
                                         </Badge>
                                       ))}
                                     </div>
                                   )}
                                 </div>
                               </TableCell>
                               <TableCell className="font-mono">
                                 {formatPhone(customer.phone)}
                               </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end space-x-2">
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button
                                        onClick={() => loadCustomerOrders(customer)}
                                        size="sm"
                                        variant="outline"
                                        title="Ver dados"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                                      <DialogHeader>
                                        <DialogTitle>
                                          Dados de {selectedCustomer?.name}
                                        </DialogTitle>
                                      </DialogHeader>
                                      <div className="space-y-4">
                                        <Card>
                                          <CardHeader>
                                            <CardTitle>Informações Pessoais</CardTitle>
                                          </CardHeader>
                                           <CardContent className="grid grid-cols-2 gap-4">
                                             <div>
                                               <Label className="text-sm font-medium">Nome</Label>
                                               <p className="text-sm">{selectedCustomer?.name}</p>
                                             </div>
                                             <div>
                                               <Label className="text-sm font-medium">Telefone</Label>
                                                <p className="text-sm font-mono">{selectedCustomer ? formatPhone(selectedCustomer.phone) : ''}</p>
                                             </div>
                                             <div>
                                               <Label className="text-sm font-medium">E-mail</Label>
                                               <p className="text-sm">{selectedCustomer?.email || '-'}</p>
                                             </div>
                                             <div>
                                               <Label className="text-sm font-medium">CPF</Label>
                                               <p className="text-sm">{selectedCustomer?.cpf || '-'}</p>
                                             </div>
                                             <div>
                                               <Label className="text-sm font-medium">Cadastrado em</Label>
                                               <p className="text-sm">{selectedCustomer ? formatDate(selectedCustomer.created_at) : ''}</p>
                                             </div>
                                           </CardContent>
                                        </Card>

                                        <Card>
                                          <CardHeader>
                                            <CardTitle>Endereço</CardTitle>
                                          </CardHeader>
                                          <CardContent className="grid grid-cols-2 gap-4">
                                            <div>
                                              <Label className="text-sm font-medium">Rua</Label>
                                              <p className="text-sm">{selectedCustomer?.street || '-'}</p>
                                            </div>
                                            <div>
                                              <Label className="text-sm font-medium">Número</Label>
                                              <p className="text-sm">{selectedCustomer?.number || '-'}</p>
                                            </div>
                                            <div>
                                              <Label className="text-sm font-medium">Complemento</Label>
                                              <p className="text-sm">{selectedCustomer?.complement || '-'}</p>
                                            </div>
                                            <div>
                                              <Label className="text-sm font-medium">CEP</Label>
                                              <p className="text-sm">{selectedCustomer?.cep || '-'}</p>
                                            </div>
                                            <div>
                                              <Label className="text-sm font-medium">Cidade</Label>
                                              <p className="text-sm">{selectedCustomer?.city || '-'}</p>
                                            </div>
                                            <div>
                                              <Label className="text-sm font-medium">Estado</Label>
                                              <p className="text-sm">{selectedCustomer?.state || '-'}</p>
                                            </div>
                                          </CardContent>
                                        </Card>

                                        <Card>
                                          <CardHeader>
                                            <CardTitle>Histórico de Pedidos</CardTitle>
                                          </CardHeader>
                                          <CardContent>
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
                                          </CardContent>
                                        </Card>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                  
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <Button
                                        onClick={() => setEditingCustomer(customer)}
                                        size="sm"
                                        variant="outline"
                                        title="Editar cliente"
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl">
                                      <DialogHeader>
                                        <DialogTitle>
                                          Editar Cliente
                                        </DialogTitle>
                                      </DialogHeader>
                                      {editingCustomer && (
                                        <div className="space-y-4">
                                          <div className="grid grid-cols-2 gap-4">
                                            <div>
                                              <Label htmlFor="name">Nome *</Label>
                                              <Input
                                                id="name"
                                                value={editingCustomer.name}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, name: e.target.value} : null)}
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor="phone">Telefone *</Label>
                                              <Input
                                                id="phone"
                                                value={editingCustomer.phone}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, phone: e.target.value} : null)}
                                                disabled
                                                className="bg-muted"
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor="cpf">CPF</Label>
                                              <Input
                                                id="cpf"
                                                value={editingCustomer.cpf || ''}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, cpf: e.target.value} : null)}
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor="cep">CEP</Label>
                                              <Input
                                                id="cep"
                                                value={editingCustomer.cep || ''}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, cep: e.target.value} : null)}
                                              />
                                            </div>
                                            <div className="col-span-2">
                                              <Label htmlFor="street">Rua/Avenida</Label>
                                              <Input
                                                id="street"
                                                value={editingCustomer.street || ''}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, street: e.target.value} : null)}
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor="number">Número</Label>
                                              <Input
                                                id="number"
                                                value={editingCustomer.number || ''}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, number: e.target.value} : null)}
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor="complement">Complemento</Label>
                                              <Input
                                                id="complement"
                                                value={editingCustomer.complement || ''}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, complement: e.target.value} : null)}
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor="city">Cidade</Label>
                                              <Input
                                                id="city"
                                                value={editingCustomer.city || ''}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, city: e.target.value} : null)}
                                              />
                                            </div>
                                            <div>
                                              <Label htmlFor="state">Estado</Label>
                                              <Input
                                                id="state"
                                                value={editingCustomer.state || ''}
                                                onChange={(e) => setEditingCustomer(prev => prev ? {...prev, state: e.target.value} : null)}
                                              />
                                            </div>
                                          </div>
                                          
                                          <div className="flex justify-end space-x-2">
                                            <Button 
                                              variant="outline" 
                                              onClick={() => setEditingCustomer(null)}
                                            >
                                              Cancelar
                                            </Button>
                                            <Button 
                                              onClick={updateCustomer} 
                                              disabled={saving}
                                            >
                                              {saving ? (
                                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                              ) : (
                                                <Edit className="h-4 w-4 mr-2" />
                                              )}
                                              Salvar
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </DialogContent>
                                  </Dialog>

                                  <Button
                                    onClick={() => deleteCustomer(customer.id)}
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive hover:text-destructive"
                                    title="Excluir cliente"
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
        </div>
      </div>
    );
  }

  const statisticsCards = [
    {
      title: 'Total de Clientes',
      value: customers.length.toString(),
      description: 'Clientes cadastrados',
      icon: Users,
      color: 'text-blue-600'
    },
    {
      title: 'Clientes Ativos',
      value: customers.filter(c => c.total_orders > 0).length.toString(),
      description: 'Com pedidos realizados',
      icon: TrendingUp,
      color: 'text-green-600'
    },
    {
      title: 'Receita Total',
      value: `R$ ${customers.reduce((sum, c) => sum + c.total_spent, 0).toFixed(2)}`,
      description: 'Faturamento dos clientes',
      icon: DollarSign,
      color: 'text-purple-600'
    },
    {
      title: 'Ticket Médio',
      value: customers.length > 0 ? `R$ ${(customers.reduce((sum, c) => sum + c.total_spent, 0) / customers.filter(c => c.total_orders > 0).length || 0).toFixed(2)}` : 'R$ 0,00',
      description: 'Valor médio por cliente',
      icon: BarChart3,
      color: 'text-orange-600'
    }
  ];

  const dashboardItems = [
    {
      title: 'Gerenciar Clientes',
      description: 'Visualizar, cadastrar e editar informações dos clientes',
      icon: Users,
      action: () => setActiveView('management'),
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    },
    {
      title: 'Cadastrar Cliente',
      description: 'Adicionar novo cliente ao sistema',
      icon: UserPlus,
      action: () => {
        setActiveView('management');
        // Will auto-switch to create tab
      },
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    {
      title: 'Relatórios',
      description: 'Análises e estatísticas dos clientes',
      icon: BarChart3,
      action: () => toast({
        title: 'Em desenvolvimento',
        description: 'Funcionalidade em breve'
      }),
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200'
    },
    {
      title: 'Histórico de Pedidos',
      description: 'Visualizar pedidos por cliente',
      icon: ShoppingBag,
      action: () => setActiveView('management'),
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200'
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 flex items-center justify-center">
            <Users className="h-10 w-10 mr-3 text-primary" />
            Centro de Controle - Clientes
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Gerencie todos os clientes e suas informações
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statisticsCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Main Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {dashboardItems.map((item) => {
            const Icon = item.icon;
            return (
              <Card 
                key={item.title} 
                className={`cursor-pointer hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 ${item.borderColor} ${item.bgColor} border-2`}
                onClick={item.action}
              >
                <CardHeader>
                  <CardTitle className="flex items-center text-xl">
                    <div className={`p-3 rounded-lg ${item.bgColor} mr-4`}>
                      <Icon className={`h-8 w-8 ${item.color}`} />
                    </div>
                    {item.title}
                  </CardTitle>
                  <CardDescription className="text-base">
                    {item.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">
                    Acessar
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Clientes;