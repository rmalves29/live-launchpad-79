import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Users, Edit, Phone, MapPin, ShieldBan, ShieldCheck } from 'lucide-react';
import { formatPhoneForDisplay, normalizeForStorage } from '@/lib/phone-utils';

interface Customer {
  id: number;
  tenant_id: string;
  name: string;
  phone: string;
  email?: string;
  cpf?: string;
  instagram?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
  is_blocked?: boolean;
  created_at: string;
  updated_at: string;
}

interface CustomerForm {
  name: string;
  phone: string;
  email: string;
  cpf: string;
  instagram: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
}

export default function TenantCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<CustomerForm>({
    name: '',
    phone: '',
    email: '',
    cpf: '',
    instagram: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    cep: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBlocked, setFilterBlocked] = useState<string>('all');
  const [blockingCustomer, setBlockingCustomer] = useState<Customer | null>(null);
  const { profile } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (profile?.tenant_id) {
      loadCustomers();
    }
  }, [profile?.tenant_id]);

  const loadCustomers = async () => {
    if (!profile?.tenant_id) return;

    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar clientes',
        variant: 'destructive'
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      cpf: '',
      instagram: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      cep: ''
    });
    setEditingCustomer(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (customer: Customer) => {
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      cpf: customer.cpf || '',
      instagram: customer.instagram || '',
      street: customer.street || '',
      number: customer.number || '',
      complement: customer.complement || '',
      neighborhood: customer.neighborhood || '',
      city: customer.city || '',
      state: customer.state || '',
      cep: customer.cep || ''
    });
    setEditingCustomer(customer);
    setIsDialogOpen(true);
  };

  const saveCustomer = async () => {
    if (!profile?.tenant_id || !formData.name || !formData.phone) return;

    try {
      const customerData = {
        tenant_id: profile.tenant_id,
        name: formData.name,
        phone: normalizeForStorage(formData.phone),
        email: formData.email || null,
        cpf: formData.cpf || null,
        instagram: formData.instagram || null,
        street: formData.street || null,
        number: formData.number || null,
        complement: formData.complement || null,
        neighborhood: formData.neighborhood || null,
        city: formData.city || null,
        state: formData.state || null,
        cep: formData.cep || null
      };

      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update(customerData)
          .eq('id', editingCustomer.id);

        if (error) throw error;
        
        toast({
          title: 'Sucesso',
          description: 'Cliente atualizado com sucesso!'
        });
      } else {
        const { error } = await supabase
          .from('customers')
          .insert(customerData);

        if (error) throw error;
        
        toast({
          title: 'Sucesso',
          description: 'Cliente criado com sucesso!'
        });
      }

      setIsDialogOpen(false);
      resetForm();
      loadCustomers();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar cliente',
        variant: 'destructive'
      });
    }
  };

  const formatPhone = (phone: string) => {
    return formatPhoneForDisplay(phone);
  };

  const filteredCustomers = customers.filter(customer => {
    const normalizedSearch = normalizeForStorage(searchTerm);
    const normalizedCustomerPhone = normalizeForStorage(customer.phone);
    const matchesSearch = customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      normalizedCustomerPhone.includes(normalizedSearch) ||
      customer.phone.includes(searchTerm);
    
    if (filterBlocked === 'blocked') return matchesSearch && customer.is_blocked;
    if (filterBlocked === 'active') return matchesSearch && !customer.is_blocked;
    return matchesSearch;
  });

  const toggleBlockCustomer = async (customer: Customer) => {
    try {
      const newStatus = !customer.is_blocked;
      const { error } = await supabase
        .from('customers')
        .update({ is_blocked: newStatus })
        .eq('id', customer.id);

      if (error) throw error;

      toast({
        title: newStatus ? '🚫 Cliente Bloqueado' : '✅ Cliente Desbloqueado',
        description: newStatus 
          ? `${customer.name} foi bloqueado e não poderá realizar novas compras.`
          : `${customer.name} foi desbloqueado e pode realizar compras normalmente.`,
      });
      
      setBlockingCustomer(null);
      loadCustomers();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao alterar status do cliente',
        variant: 'destructive'
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Clientes
            </CardTitle>
            <CardDescription>
              Gerencie os clientes da sua empresa
            </CardDescription>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Cliente
          </Button>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <Input
            placeholder="Buscar clientes por nome ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
          <Select value={filterBlocked} onValueChange={setFilterBlocked}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="blocked">Bloqueados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {filteredCustomers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum cliente encontrado</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm ? 'Tente ajustar os termos da busca.' : 'Comece cadastrando seu primeiro cliente.'}
              </p>
              {!searchTerm && (
                <Button onClick={openCreateDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Cadastrar Primeiro Cliente
                </Button>
              )}
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <div key={customer.id} className={`flex items-center justify-between p-4 border rounded-lg ${customer.is_blocked ? 'border-destructive/50 bg-destructive/5' : ''}`}>
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${customer.is_blocked ? 'bg-destructive/10' : 'bg-muted'}`}>
                    {customer.is_blocked ? (
                      <ShieldBan className="h-6 w-6 text-destructive" />
                    ) : (
                      <Users className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{customer.name}</h4>
                      {customer.is_blocked && (
                        <Badge variant="destructive" className="text-xs">BLOQUEADO</Badge>
                      )}
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <Phone className="h-3 w-3" />
                        <span>{formatPhone(customer.phone)}</span>
                      </div>
                      {(customer.city || customer.state) && (
                        <div className="flex items-center space-x-1">
                          <MapPin className="h-3 w-3" />
                          <span>
                            {[customer.city, customer.state].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant={customer.is_blocked ? "outline" : "ghost"}
                    size="sm"
                    onClick={() => setBlockingCustomer(customer)}
                    title={customer.is_blocked ? 'Desbloquear cliente' : 'Bloquear cliente'}
                    className={customer.is_blocked ? 'text-green-600 hover:text-green-700 border-green-300' : 'text-destructive hover:text-destructive'}
                  >
                    {customer.is_blocked ? <ShieldCheck className="h-4 w-4" /> : <ShieldBan className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(customer)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}
              </DialogTitle>
              <DialogDescription>
                {editingCustomer ? 'Atualize os dados do cliente' : 'Adicione um novo cliente'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: João Silva"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone *</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Ex: 11987654321"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="instagram">Instagram</Label>
                  <Input
                    id="instagram"
                    value={formData.instagram}
                    onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                    placeholder="Ex: nicemaxis"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF</Label>
                  <Input
                    id="cpf"
                    value={formData.cpf}
                    onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                    placeholder="Ex: 123.456.789-00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="street">Endereço</Label>
                  <Input
                    id="street"
                    value={formData.street}
                    onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    placeholder="Ex: Rua das Flores"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="number">Número</Label>
                  <Input
                    id="number"
                    value={formData.number}
                    onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                    placeholder="123"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="complement">Complemento</Label>
                <Input
                  id="complement"
                  value={formData.complement}
                  onChange={(e) => setFormData({ ...formData, complement: e.target.value })}
                  placeholder="Ex: Apto 45"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input
                  id="neighborhood"
                  value={formData.neighborhood}
                  onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                  placeholder="Ex: Centro"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Ex: São Paulo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="Ex: SP"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    value={formData.cep}
                    onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                    placeholder="Ex: 01234-567"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={saveCustomer}>
                {editingCustomer ? 'Atualizar' : 'Criar'} Cliente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Block/Unblock Confirmation Dialog */}
        <AlertDialog open={!!blockingCustomer} onOpenChange={(open) => !open && setBlockingCustomer(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {blockingCustomer?.is_blocked ? '✅ Desbloquear Cliente' : '🚫 Bloquear Cliente'}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-base">
                {blockingCustomer?.is_blocked 
                  ? `Deseja desbloquear ${blockingCustomer?.name}? O cliente poderá realizar novas compras normalmente.`
                  : `Deseja bloquear ${blockingCustomer?.name}? O cliente não poderá mais adicionar itens ao carrinho e receberá uma mensagem automática de restrição.`
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => blockingCustomer && toggleBlockCustomer(blockingCustomer)}
                className={blockingCustomer?.is_blocked ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
              >
                {blockingCustomer?.is_blocked ? 'Desbloquear' : 'Bloquear'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}