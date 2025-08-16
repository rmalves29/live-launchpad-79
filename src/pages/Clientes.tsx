import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Users, UserPlus, Edit, Trash2, Search } from 'lucide-react';
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
}

const Clientes = () => {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newCustomer, setNewCustomer] = useState({ phone: '', name: '' });

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
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
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
                          <TableHead>CPF</TableHead>
                          <TableHead>Endereço</TableHead>
                          <TableHead>Cadastrado</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCustomers.map((customer) => (
                          <TableRow key={customer.id}>
                            <TableCell className="font-medium">{customer.name}</TableCell>
                            <TableCell className="font-mono">
                              {formatPhone(customer.phone)}
                            </TableCell>
                            <TableCell>
                              {customer.cpf ? (
                                <Badge variant="outline">{customer.cpf}</Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {customer.street ? (
                                <div className="text-sm">
                                  <div>{customer.street}, {customer.number}</div>
                                  <div className="text-muted-foreground">
                                    {customer.city} - {customer.state} | {customer.cep}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Não informado</span>
                              )}
                            </TableCell>
                            <TableCell>{formatDate(customer.created_at)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                onClick={() => deleteCustomer(customer.id)}
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
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