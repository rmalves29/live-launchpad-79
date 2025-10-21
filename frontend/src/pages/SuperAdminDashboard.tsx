import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Building2, Users, BarChart3, Settings } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface TenantUser {
  id: string;
  email: string;
  role: 'tenant_admin' | 'staff';
  tenant_id: string;
  created_at: string;
}

export default function SuperAdminDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [isCreateTenantOpen, setIsCreateTenantOpen] = useState(false);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: '', slug: '' });
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'staff' as 'tenant_admin' | 'staff', tenant_id: '' });
  const [stats, setStats] = useState({ totalTenants: 0, activeTenants: 0, totalUsers: 0, totalOrders: 0 });
  const { toast } = useToast();
  const { isSuperAdmin } = useAuth();

  useEffect(() => {
    if (isSuperAdmin) {
      loadTenants();
      loadUsers();
      loadStats();
    }
  }, [isSuperAdmin]);

  const loadTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTenants(data || []);
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao carregar empresas',
        variant: 'destructive'
      });
    }
  };

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, role, tenant_id, created_at')
        .not('tenant_id', 'is', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      const filteredData = (data || []).filter(user => 
        user.role !== 'super_admin' && user.tenant_id
      ) as TenantUser[];
      setUsers(filteredData);
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao carregar usuários',
        variant: 'destructive'
      });
    }
  };

  const loadStats = async () => {
    try {
      const [tenantsResult, ordersResult] = await Promise.all([
        supabase.from('tenants').select('id, is_active'),
        supabase.from('orders').select('id')
      ]);

      const totalTenants = tenantsResult.data?.length || 0;
      const activeTenants = tenantsResult.data?.filter(t => t.is_active).length || 0;
      const totalOrders = ordersResult.data?.length || 0;
      const totalUsers = users.length;

      setStats({ totalTenants, activeTenants, totalUsers, totalOrders });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const createTenant = async () => {
    if (!newTenant.name || !newTenant.slug) return;

    try {
      const { error } = await supabase
        .from('tenants')
        .insert({
          name: newTenant.name,
          slug: newTenant.slug.toLowerCase(),
          is_active: true
        });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Empresa criada com sucesso!'
      });

      setNewTenant({ name: '', slug: '' });
      setIsCreateTenantOpen(false);
      loadTenants();
      loadStats();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao criar empresa',
        variant: 'destructive'
      });
    }
  };

  const createUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.tenant_id) return;

    try {
      // Create user in auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newUser.email,
        password: newUser.password,
        email_confirm: true
      });

      if (authError) throw authError;

      // Update profile with tenant info
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          role: newUser.role,
          tenant_id: newUser.tenant_id
        })
        .eq('id', authData.user.id);

      if (profileError) throw profileError;

      toast({
        title: 'Sucesso',
        description: 'Usuário criado com sucesso!'
      });

      setNewUser({ email: '', password: '', role: 'staff', tenant_id: '' });
      setIsCreateUserOpen(false);
      loadUsers();
      loadStats();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao criar usuário',
        variant: 'destructive'
      });
    }
  };

  const toggleTenantActive = async (tenantId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ is_active: isActive })
        .eq('id', tenantId);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: `Empresa ${isActive ? 'ativada' : 'desativada'} com sucesso!`
      });

      loadTenants();
      loadStats();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao atualizar empresa',
        variant: 'destructive'
      });
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-2">Acesso Negado</h1>
          <p className="text-muted-foreground">Você não tem permissão para acessar esta área.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Painel do Super Administrador</h1>
          <p className="text-muted-foreground">Gerencie empresas e usuários do sistema</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isCreateTenantOpen} onOpenChange={setIsCreateTenantOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Empresa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Nova Empresa</DialogTitle>
                <DialogDescription>
                  Adicione uma nova empresa ao sistema
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Empresa</Label>
                  <Input
                    id="name"
                    value={newTenant.name}
                    onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                    placeholder="Ex: Empresa Demo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug (identificador único)</Label>
                  <Input
                    id="slug"
                    value={newTenant.slug}
                    onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
                    placeholder="Ex: empresa-demo"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateTenantOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={createTenant}>
                  Criar Empresa
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Usuário</DialogTitle>
                <DialogDescription>
                  Adicione um novo usuário para uma empresa
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="usuario@empresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha Temporária</Label>
                  <Input
                    id="password"
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenant">Empresa</Label>
                  <Select
                    value={newUser.tenant_id}
                    onValueChange={(value) => setNewUser({ ...newUser, tenant_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants.filter(t => t.is_active).map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.id}>
                          {tenant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Função</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(value: 'tenant_admin' | 'staff') => setNewUser({ ...newUser, role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tenant_admin">Administrador da Empresa</SelectItem>
                      <SelectItem value="staff">Funcionário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateUserOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={createUser}>
                  Criar Usuário
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Empresas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTenants}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeTenants} ativas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Pedidos</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sistema</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">Online</div>
          </CardContent>
        </Card>
      </div>

      {/* Tenants Management */}
      <Card>
        <CardHeader>
          <CardTitle>Empresas Cadastradas</CardTitle>
          <CardDescription>
            Gerencie as empresas do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {tenants.map((tenant) => (
              <div key={tenant.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div>
                    <h4 className="font-semibold">{tenant.name}</h4>
                    <p className="text-sm text-muted-foreground">/{tenant.slug}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={tenant.is_active ? 'default' : 'secondary'}>
                    {tenant.is_active ? 'Ativa' : 'Inativa'}
                  </Badge>
                  <Switch
                    checked={tenant.is_active}
                    onCheckedChange={(checked) => toggleTenantActive(tenant.id, checked)}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Users Management */}
      <Card>
        <CardHeader>
          <CardTitle>Usuários das Empresas</CardTitle>
          <CardDescription>
            Visualize os usuários cadastrados por empresa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {users.map((user) => {
              const tenant = tenants.find(t => t.id === user.tenant_id);
              return (
                <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div>
                      <h4 className="font-semibold">{user.email}</h4>
                      <p className="text-sm text-muted-foreground">
                        {tenant?.name || 'Empresa não encontrada'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={user.role === 'tenant_admin' ? 'default' : 'secondary'}>
                    {user.role === 'tenant_admin' ? 'Admin' : 'Funcionário'}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}