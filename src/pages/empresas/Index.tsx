import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { 
  Search, Building2, CheckCircle2, XCircle, AlertTriangle, Clock, RefreshCw, 
  Pencil, Plus, Trash2, Eye, EyeOff, Mail 
} from "lucide-react";
import { differenceInDays } from "date-fns";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  is_blocked: boolean | null;
  plan_type: string | null;
  subscription_ends_at: string | null;
  admin_email: string | null;
  created_at: string;
}

interface TenantCredential {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  is_active: boolean;
}

export default function EmpresasIndex() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [credentials, setCredentials] = useState<TenantCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPasswords, setShowPasswords] = useState<{[key: string]: boolean}>({});

  const [formData, setFormData] = useState({
    name: "",
    adminEmail: "",
    adminPassword: "",
    enable_live: true,
    enable_sendflow: true,
    max_whatsapp_groups: null as number | null
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tenantsRes, credentialsRes] = await Promise.all([
        supabase
          .from('tenants')
          .select('id, name, slug, is_active, is_blocked, plan_type, subscription_ends_at, admin_email, created_at')
          .order('name'),
        supabase
          .from('tenant_credentials')
          .select('*')
      ]);

      if (tenantsRes.error) throw tenantsRes.error;
      if (credentialsRes.error) throw credentialsRes.error;
      
      setTenants(tenantsRes.data || []);
      setCredentials(credentialsRes.data || []);
    } catch (error: any) {
      console.error('Erro ao carregar empresas:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar empresas: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "")
      .substring(0, 20);
  };

  const isSlugUnique = (slug: string, excludeId?: string) => {
    return !tenants.some(t => t.slug === slug && t.id !== excludeId);
  };

  const getTenantCredential = (tenantId: string) => {
    return credentials.find(c => c.tenant_id === tenantId);
  };

  const togglePassword = (tenantId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [tenantId]: !prev[tenantId]
    }));
  };

  const resetForm = () => {
    setFormData({
      name: "",
      adminEmail: "",
      adminPassword: "",
      enable_live: true,
      enable_sendflow: true,
      max_whatsapp_groups: null
    });
    setEditingTenant(null);
  };

  const handleCreateTenant = async () => {
    if (!formData.name.trim()) {
      toast({ title: "Erro", description: "Nome da empresa é obrigatório", variant: "destructive" });
      return;
    }
    if (!formData.adminEmail.trim()) {
      toast({ title: "Erro", description: "Email do administrador é obrigatório", variant: "destructive" });
      return;
    }
    if (!formData.adminPassword.trim()) {
      toast({ title: "Erro", description: "Senha do administrador é obrigatória", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      
      const baseSlug = generateSlug(formData.name);
      let uniqueSlug = baseSlug;
      let counter = 1;
      
      while (!isSlugUnique(uniqueSlug)) {
        uniqueSlug = `${baseSlug}${counter}`;
        counter++;
      }

      const { data: newTenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({
          name: formData.name,
          slug: uniqueSlug,
          is_active: true,
          enable_live: formData.enable_live,
          enable_sendflow: formData.enable_sendflow,
          max_whatsapp_groups: formData.max_whatsapp_groups
        })
        .select()
        .single();

      if (tenantError) throw tenantError;

      const { error: adminError } = await supabase.functions.invoke('create-tenant-admin', {
        body: {
          tenant_id: newTenant.id,
          email: formData.adminEmail,
          password: formData.adminPassword,
          tenant_name: formData.name
        }
      });

      if (adminError) {
        toast({
          title: "Aviso",
          description: `Empresa criada, mas houve erro ao criar o admin: ${adminError.message}`,
          variant: "destructive",
        });
      }

      await supabase
        .from("tenant_credentials")
        .insert({
          tenant_id: newTenant.id,
          email: formData.adminEmail,
          password_hash: formData.adminPassword,
          is_active: true
        });

      toast({
        title: "Sucesso",
        description: `Empresa "${formData.name}" criada!`,
      });

      resetForm();
      setShowCreateDialog(false);
      loadData();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Erro ao criar empresa: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTenant = async () => {
    if (!editingTenant) return;

    try {
      setLoading(true);

      const { error: tenantError } = await supabase
        .from("tenants")
        .update({ name: formData.name })
        .eq("id", editingTenant.id);

      if (tenantError) throw tenantError;

      const existingCredential = credentials.find(c => c.tenant_id === editingTenant.id);
      
      if (formData.adminPassword) {
        if (existingCredential) {
          await supabase
            .from("tenant_credentials")
            .update({
              email: formData.adminEmail,
              password_hash: formData.adminPassword,
            })
            .eq("tenant_id", editingTenant.id);
        } else {
          await supabase
            .from("tenant_credentials")
            .insert({
              tenant_id: editingTenant.id,
              email: formData.adminEmail,
              password_hash: formData.adminPassword,
              is_active: true
            });
        }
      } else if (existingCredential && formData.adminEmail !== existingCredential.email) {
        await supabase
          .from("tenant_credentials")
          .update({ email: formData.adminEmail })
          .eq("tenant_id", editingTenant.id);
      }

      toast({ title: "Sucesso", description: "Empresa atualizada!" });
      resetForm();
      setShowEditDialog(false);
      loadData();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Erro ao atualizar empresa: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTenant = async (tenant: Tenant) => {
    const confirmed = await confirm({
      description: `Deseja excluir a empresa "${tenant.name}"? As credenciais e perfis associados também serão excluídos.`,
      confirmText: 'Excluir',
      variant: 'destructive',
    });
    if (!confirmed) return;

    try {
      setLoading(true);
      
      await supabase.from("tenant_credentials").delete().eq("tenant_id", tenant.id);
      await supabase.from("profiles").delete().eq("tenant_id", tenant.id);
      const { error } = await supabase.from("tenants").delete().eq("id", tenant.id);

      if (error) throw error;

      const previewId = localStorage.getItem('previewTenantId');
      if (previewId === tenant.id) {
        localStorage.removeItem('previewTenantId');
      }

      toast({ title: "Sucesso", description: `Empresa "${tenant.name}" excluída!` });
      loadData();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Erro ao excluir empresa: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (tenant: Tenant) => {
    const credential = getTenantCredential(tenant.id);
    setEditingTenant(tenant);
    setFormData({
      name: tenant.name,
      adminEmail: credential?.email || tenant.admin_email || "",
      adminPassword: "",
      enable_live: true,
      enable_sendflow: true,
      max_whatsapp_groups: null
    });
    setShowEditDialog(true);
  };

  const getDaysRemaining = (subscriptionEndsAt: string | null): number | null => {
    if (!subscriptionEndsAt) return null;
    const endDate = new Date(subscriptionEndsAt);
    const now = new Date();
    return differenceInDays(endDate, now);
  };

  const getStatusBadge = (tenant: Tenant) => {
    if (tenant.is_blocked) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Bloqueado
        </Badge>
      );
    }
    if (!tenant.is_active) {
      return (
        <Badge variant="secondary" className="gap-1">
          <XCircle className="h-3 w-3" />
          Inativo
        </Badge>
      );
    }
    return (
      <Badge className="gap-1 bg-emerald-500 hover:bg-emerald-600">
        <CheckCircle2 className="h-3 w-3" />
        Ativo
      </Badge>
    );
  };

  const getPlanBadge = (planType: string | null) => {
    const plan = planType || 'trial';
    const planColors: Record<string, string> = {
      trial: 'bg-blue-100 text-blue-800 border-blue-200',
      basic: 'bg-gray-100 text-gray-800 border-gray-200',
      pro: 'bg-purple-100 text-purple-800 border-purple-200',
      enterprise: 'bg-amber-100 text-amber-800 border-amber-200',
    };
    return (
      <Badge variant="outline" className={planColors[plan] || planColors.trial}>
        {plan}
      </Badge>
    );
  };

  const getPrazoBadge = (tenant: Tenant) => {
    if (tenant.plan_type === 'trial' && !tenant.subscription_ends_at) {
      return (
        <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
          <CheckCircle2 className="h-3 w-3" />
          Ilimitado
        </Badge>
      );
    }

    const daysRemaining = getDaysRemaining(tenant.subscription_ends_at);

    if (daysRemaining === null) {
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Clock className="h-3 w-3" />
          Não definido
        </Badge>
      );
    }

    if (daysRemaining <= 0) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Expirado
        </Badge>
      );
    }

    if (daysRemaining <= 5) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'}
        </Badge>
      );
    }

    if (daysRemaining <= 10) {
      return (
        <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 border-amber-200">
          <Clock className="h-3 w-3" />
          {daysRemaining} dias
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        {daysRemaining} dias
      </Badge>
    );
  };

  const filteredTenants = tenants.filter(tenant =>
    tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tenant.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (tenant.admin_email?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
  );

  const totalEmpresas = tenants.length;
  const empresasAtivas = tenants.filter(t => t.is_active && !t.is_blocked).length;
  const empresasInativas = tenants.filter(t => !t.is_active || t.is_blocked).length;
  const empresasExpiradas = tenants.filter(t => {
    const days = getDaysRemaining(t.subscription_ends_at);
    return days !== null && days <= 0;
  }).length;

  if (profile?.role !== 'super_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-lg font-semibold mb-2">Acesso Restrito</h2>
            <p className="text-muted-foreground">
              Esta página é restrita a administradores do sistema.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              Empresas Cadastradas
            </h1>
            <p className="text-muted-foreground">Gerencie todas as empresas do sistema</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Empresa
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Nova Empresa</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nome da Empresa</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nome da empresa"
                    />
                  </div>
                  <Separator />
                  <div>
                    <Label htmlFor="adminEmail">Email do Administrador</Label>
                    <Input
                      id="adminEmail"
                      type="email"
                      value={formData.adminEmail}
                      onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                      placeholder="admin@empresa.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="adminPassword">Senha do Administrador</Label>
                    <Input
                      id="adminPassword"
                      type="password"
                      value={formData.adminPassword}
                      onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                      placeholder="Senha forte"
                    />
                  </div>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="font-semibold">Funcionalidades</h3>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label htmlFor="enable_live">Habilitar Live</Label>
                        <p className="text-sm text-muted-foreground">Acesso à funcionalidade de Lives</p>
                      </div>
                      <input
                        type="checkbox"
                        id="enable_live"
                        checked={formData.enable_live}
                        onChange={(e) => setFormData({ ...formData, enable_live: e.target.checked })}
                        className="h-4 w-4"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <Label htmlFor="enable_sendflow">Habilitar SendFlow</Label>
                        <p className="text-sm text-muted-foreground">Acesso à funcionalidade de SendFlow</p>
                      </div>
                      <input
                        type="checkbox"
                        id="enable_sendflow"
                        checked={formData.enable_sendflow}
                        onChange={(e) => setFormData({ ...formData, enable_sendflow: e.target.checked })}
                        className="h-4 w-4"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleCreateTenant} disabled={loading}>
                      {loading ? "Criando..." : "Criar Empresa"}
                    </Button>
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{totalEmpresas}</p>
                </div>
                <Building2 className="h-8 w-8 text-primary/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ativas</p>
                  <p className="text-2xl font-bold text-emerald-600">{empresasAtivas}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Inativas</p>
                  <p className="text-2xl font-bold text-gray-500">{empresasInativas}</p>
                </div>
                <XCircle className="h-8 w-8 text-gray-400/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Expiradas</p>
                  <p className="text-2xl font-bold text-destructive">{empresasExpiradas}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-destructive/30" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Empresas */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <CardTitle>Lista de Empresas</CardTitle>
                <CardDescription>
                  {filteredTenants.length} empresa{filteredTenants.length !== 1 ? 's' : ''} encontrada{filteredTenants.length !== 1 ? 's' : ''}
                </CardDescription>
              </div>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar empresa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTenants.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma empresa encontrada
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Credenciais</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Plano</TableHead>
                      <TableHead className="text-center">Prazo</TableHead>
                      <TableHead className="text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTenants.map((tenant) => {
                      const credential = getTenantCredential(tenant.id);
                      const showPassword = showPasswords[tenant.id];
                      
                      return (
                        <TableRow key={tenant.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{tenant.name}</p>
                              <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                              <p className="text-xs text-muted-foreground">{tenant.admin_email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {credential ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1 text-sm">
                                  <Mail className="h-3 w-3 text-muted-foreground" />
                                  <span>{credential.email}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-mono">
                                    {showPassword ? credential.password_hash : "••••••••"}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => togglePassword(tenant.id)}
                                  >
                                    {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {getStatusBadge(tenant)}
                          </TableCell>
                          <TableCell className="text-center">
                            {getPlanBadge(tenant.plan_type)}
                          </TableCell>
                          <TableCell className="text-center">
                            {getPrazoBadge(tenant)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(tenant)}
                                title="Editar empresa"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteTenant(tenant)}
                                title="Excluir empresa"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="editName">Nome da Empresa</Label>
              <Input
                id="editName"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Slug (gerado automaticamente)</Label>
              <Input value={editingTenant?.slug || ""} disabled />
            </div>
            <Separator />
            <div>
              <Label htmlFor="editAdminEmail">Email do Administrador</Label>
              <Input
                id="editAdminEmail"
                type="email"
                value={formData.adminEmail}
                onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="editAdminPassword">Nova Senha (deixe em branco para manter)</Label>
              <Input
                id="editAdminPassword"
                type="password"
                value={formData.adminPassword}
                onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                placeholder="Nova senha (opcional)"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpdateTenant} disabled={loading}>
                {loading ? "Salvando..." : "Salvar"}
              </Button>
              <Button variant="outline" onClick={() => { setShowEditDialog(false); resetForm(); }}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </>
  );
}
