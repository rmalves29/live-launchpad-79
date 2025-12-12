/**
 * Página de Administração de Tenants
 * Apenas para super_admin
 * Permite criar, editar, bloquear e gerenciar tenants
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  Plus, 
  Edit, 
  Ban, 
  CheckCircle, 
  XCircle,
  Calendar,
  Users,
  Eye,
  EyeOff,
  Key,
  Search
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  is_active: boolean;
  is_blocked: boolean | null;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  plan_type: string | null;
  created_at: string;
}

interface TenantCredential {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  is_active: boolean;
}

// Configuração de dias por plano
const PLAN_DAYS: Record<string, number> = {
  trial_teste: 7,
  basic: 33,
  pro: 185,
  enterprise: 368,
};

export default function TenantsAdmin() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [credentials, setCredentials] = useState<TenantCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [showPasswords, setShowPasswords] = useState<{[key: string]: boolean}>({});
  const [searchTerm, setSearchTerm] = useState('');

  // Form states
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAdminEmail, setFormAdminEmail] = useState('');
  const [formAdminPassword, setFormAdminPassword] = useState('');
  const [formContactName, setFormContactName] = useState('');
  const [formContactPhone, setFormContactPhone] = useState('');
  const [formTrialDays, setFormTrialDays] = useState('7');
  const [formPlan, setFormPlan] = useState('trial_teste');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formIsBlocked, setFormIsBlocked] = useState(false);
  const [formBlockedReason, setFormBlockedReason] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formAccessType, setFormAccessType] = useState<'tenant_admin' | 'super_admin'>('tenant_admin');

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setTenants(data || []);

      // Carregar credenciais
      const { data: credentialsData, error: credentialsError } = await supabase
        .from('tenant_credentials')
        .select('*');

      if (credentialsError) throw credentialsError;
      setCredentials(credentialsData || []);

    } catch (err: any) {
      console.error('Erro ao carregar tenants:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

  // Atualizar dias automaticamente quando o plano muda
  const handlePlanChange = (newPlan: string) => {
    setFormPlan(newPlan);
    // Atualizar dias de acordo com o plano selecionado
    if (PLAN_DAYS[newPlan]) {
      setFormTrialDays(PLAN_DAYS[newPlan].toString());
    }
  };

  const handleOpenDialog = async (tenant?: Tenant) => {
    if (tenant) {
      setEditingTenant(tenant);
      setFormName(tenant.name);
      setFormEmail(tenant.email || '');
      const credential = getTenantCredential(tenant.id);
      setFormAdminEmail(credential?.email || '');
      setFormAdminPassword('');
      setFormContactName('');
      setFormContactPhone('');
      setFormPlan(tenant.plan_type || 'trial_teste');
      setFormIsActive(tenant.is_active);
      setFormIsBlocked(tenant.is_blocked || false);
      setFormBlockedReason('');
      
      // Verificar o tipo de acesso do usuário admin
      if (credential?.email) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('email', credential.email)
          .single();
        setFormAccessType(profileData?.role === 'super_admin' ? 'super_admin' : 'tenant_admin');
      } else {
        setFormAccessType('tenant_admin');
      }
      
      // Calcular dias restantes
      if (tenant.subscription_ends_at) {
        const subEnd = new Date(tenant.subscription_ends_at);
        const now = new Date();
        const daysRemaining = Math.ceil((subEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        setFormTrialDays(Math.max(0, daysRemaining).toString());
      } else if (tenant.trial_ends_at) {
        const trialEnd = new Date(tenant.trial_ends_at);
        const now = new Date();
        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        setFormTrialDays(Math.max(0, daysRemaining).toString());
      }
    } else {
      setEditingTenant(null);
      setFormName('');
      setFormEmail('');
      setFormAdminEmail('');
      setFormAdminPassword('');
      setFormContactName('');
      setFormContactPhone('');
      setFormTrialDays('7');
      setFormPlan('trial_teste');
      setFormIsActive(true);
      setFormIsBlocked(false);
      setFormBlockedReason('');
      setFormNotes('');
      setFormAccessType('tenant_admin');
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validar campos obrigatórios para nova empresa
      if (!editingTenant && (!formAdminEmail || !formAdminPassword)) {
        setError('Email e senha do administrador são obrigatórios para nova empresa');
        setLoading(false);
        return;
      }

      // Calcular data de término baseado no plano/dias informados
      const daysToAdd = parseInt(formTrialDays || '7');
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + daysToAdd);

      // Para super_admin, não definir data de expiração
      const isSuperAdmin = formAccessType === 'super_admin';

      const tenantData: any = {
        name: formName,
        email: formEmail || null,
        plan_type: formPlan,
        is_active: formIsActive,
        is_blocked: formIsBlocked,
        // Para super_admin, não definir data de expiração
        subscription_ends_at: isSuperAdmin ? null : endDate.toISOString(),
        trial_ends_at: isSuperAdmin ? null : (formPlan === 'trial_teste' ? endDate.toISOString() : null),
      };

      // Gerar slug apenas para novos tenants
      if (!editingTenant) {
        tenantData.slug = formName
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "")
          .substring(0, 20);
      }

      let tenantId: string;

      if (editingTenant) {
        // Atualizar tenant
        const { error: updateError } = await supabase
          .from('tenants')
          .update(tenantData)
          .eq('id', editingTenant.id);

        if (updateError) throw updateError;
        tenantId = editingTenant.id;

        // Atualizar role do usuário admin se mudou o tipo de acesso
        const existingCredential = getTenantCredential(editingTenant.id);
        if (existingCredential?.email) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', existingCredential.email)
            .single();

          if (profileData) {
            const { error: profileError } = await supabase
              .from('profiles')
              .update({ role: formAccessType })
              .eq('id', profileData.id);

            if (profileError) throw profileError;
          }
        }

        // Atualizar ou criar credencial se email/senha foram fornecidos
        if (formAdminEmail) {
          if (formAdminPassword) {
            // Salvar senha em texto puro
            if (existingCredential) {
              const { error: credentialError } = await supabase
                .from('tenant_credentials')
                .update({
                  email: formAdminEmail,
                  password_hash: formAdminPassword,
                })
                .eq('tenant_id', editingTenant.id);

              if (credentialError) throw credentialError;
            } else {
              const { error: credentialError } = await supabase
                .from('tenant_credentials')
                .insert({
                  tenant_id: editingTenant.id,
                  email: formAdminEmail,
                  password_hash: formAdminPassword,
                  is_active: true
                });

              if (credentialError) throw credentialError;
            }
          } else if (existingCredential && formAdminEmail !== existingCredential.email) {
            const { error: credentialError } = await supabase
              .from('tenant_credentials')
              .update({ email: formAdminEmail })
              .eq('tenant_id', editingTenant.id);

            if (credentialError) throw credentialError;
          }
        }
      } else {
        // Criar novo tenant
        const { data: newTenant, error: insertError } = await supabase
          .from('tenants')
          .insert(tenantData)
          .select()
          .single();

        if (insertError) throw insertError;
        tenantId = newTenant.id;

        // Criar credencial - senha em texto puro
        const { error: credentialError } = await supabase
          .from('tenant_credentials')
          .insert({
            tenant_id: tenantId,
            email: formAdminEmail,
            password_hash: formAdminPassword,
            is_active: true
          });

        if (credentialError) throw credentialError;

        // Chamar Edge Function para criar o usuário admin com o role correto
        const { error: adminError } = await supabase.functions.invoke('create-tenant-admin', {
          body: {
            tenant_id: tenantId,
            email: formAdminEmail,
            password: formAdminPassword,
            role: formAccessType,
          }
        });

        if (adminError) {
          console.error('Erro ao criar admin:', adminError);
          // Não falhar a operação, apenas logar
        }
      }

      setDialogOpen(false);
      await loadTenants();
    } catch (err: any) {
      console.error('Erro ao salvar tenant:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBlock = async (tenant: Tenant) => {
    try {
      const { error: updateError } = await supabase
        .from('tenants')
        .update({ 
          is_blocked: !tenant.is_blocked
        })
        .eq('id', tenant.id);

      if (updateError) throw updateError;

      await loadTenants();
    } catch (err: any) {
      console.error('Erro ao bloquear/desbloquear tenant:', err);
      setError(err.message);
    }
  };

  const getAccessStatus = (tenant: Tenant): string => {
    if (tenant.is_blocked) return 'blocked';
    if (!tenant.is_active) return 'inactive';
    
    const now = new Date();
    if (tenant.subscription_ends_at) {
      const subEnd = new Date(tenant.subscription_ends_at);
      if (subEnd > now) return 'subscription_active';
      return 'subscription_expired';
    }
    if (tenant.trial_ends_at) {
      const trialEnd = new Date(tenant.trial_ends_at);
      if (trialEnd > now) return 'trial_active';
      return 'trial_expired';
    }
    return 'active';
  };

  const getDaysRemaining = (tenant: Tenant): number | null => {
    // Para planos sem expiração (super_admin), retornar null
    const now = new Date();
    const endDate = tenant.subscription_ends_at 
      ? new Date(tenant.subscription_ends_at) 
      : tenant.trial_ends_at 
        ? new Date(tenant.trial_ends_at) 
        : null;
    
    if (!endDate) return null;
    const days = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string; icon: any }> = {
      'active': { variant: 'default', label: 'Ativo', icon: CheckCircle },
      'trial_active': { variant: 'secondary', label: 'Trial', icon: Calendar },
      'subscription_active': { variant: 'default', label: 'Pago', icon: CheckCircle },
      'trial_expired': { variant: 'destructive', label: 'Trial Expirado', icon: XCircle },
      'subscription_expired': { variant: 'destructive', label: 'Assinatura Expirada', icon: XCircle },
      'blocked': { variant: 'destructive', label: 'Bloqueado', icon: Ban },
      'inactive': { variant: 'outline', label: 'Inativo', icon: XCircle },
    };

    const config = variants[status] || variants['active'];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  if (loading && tenants.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Gerenciar Empresas (Tenants)</CardTitle>
              <CardDescription>
                Administre todas as empresas do sistema
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Empresa
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingTenant ? 'Editar Empresa' : 'Nova Empresa'}
                  </DialogTitle>
                  <DialogDescription>
                    Preencha os dados da empresa e defina o prazo de acesso
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome da Empresa *</Label>
                    <Input
                      id="name"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Loja da Maria"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail da Empresa</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="contato@empresa.com"
                    />
                  </div>

                  {/* Credenciais de Acesso */}
                  <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-primary" />
                      <Label className="font-semibold">Credenciais de Acesso</Label>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="admin_email">Email do Administrador *</Label>
                      <Input
                        id="admin_email"
                        type="email"
                        value={formAdminEmail}
                        onChange={(e) => setFormAdminEmail(e.target.value)}
                        placeholder="admin@empresa.com"
                      />
                      <p className="text-xs text-muted-foreground">
                        Este será o usuário para login no sistema
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="admin_password">
                        Senha do Administrador {!editingTenant && '*'}
                      </Label>
                      <Input
                        id="admin_password"
                        type="password"
                        value={formAdminPassword}
                        onChange={(e) => setFormAdminPassword(e.target.value)}
                        placeholder={editingTenant ? "Deixe em branco para manter a atual" : "Senha de acesso"}
                      />
                      {editingTenant && (
                        <p className="text-xs text-muted-foreground">
                          Deixe em branco para manter a senha atual
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Tipo de Acesso */}
                  <div className="border rounded-lg p-4 space-y-4 bg-primary/5">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <Label className="font-semibold">Tipo de Acesso</Label>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="access_type">Nível de Permissão</Label>
                      <select
                        id="access_type"
                        value={formAccessType}
                        onChange={(e) => setFormAccessType(e.target.value as 'tenant_admin' | 'super_admin')}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="tenant_admin">Empresa (tenant_admin) - Acesso limitado</option>
                        <option value="super_admin">Super Admin - Acesso total</option>
                      </select>
                      <p className="text-xs text-muted-foreground">
                        {formAccessType === 'super_admin' 
                          ? '⚠️ Super Admin tem acesso total ao sistema e não possui limite de tempo'
                          : 'Empresa terá acesso apenas aos dados do próprio tenant com contagem de dias'
                        }
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contact_name">Nome do Responsável</Label>
                      <Input
                        id="contact_name"
                        value={formContactName}
                        onChange={(e) => setFormContactName(e.target.value)}
                        placeholder="João Silva"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contact_phone">Telefone</Label>
                      <Input
                        id="contact_phone"
                        value={formContactPhone}
                        onChange={(e) => setFormContactPhone(e.target.value)}
                        placeholder="(11) 99999-9999"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="trial_days">Prazo de Acesso (dias)</Label>
                      <Input
                        id="trial_days"
                        type="number"
                        value={formTrialDays}
                        onChange={(e) => setFormTrialDays(e.target.value)}
                        placeholder="30"
                      />
                      <p className="text-xs text-muted-foreground">
                        Quantos dias a empresa terá acesso ao sistema
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="plan">Plano</Label>
                      <select
                        id="plan"
                        value={formPlan}
                        onChange={(e) => handlePlanChange(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="trial_teste">Trial Teste (7 dias)</option>
                        <option value="basic">Basic (33 dias)</option>
                        <option value="pro">Pro (185 dias)</option>
                        <option value="enterprise">Enterprise (368 dias)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_active">Empresa Ativa</Label>
                      <p className="text-xs text-muted-foreground">
                        Se desativada, ninguém poderá acessar
                      </p>
                    </div>
                    <Switch
                      id="is_active"
                      checked={formIsActive}
                      onCheckedChange={setFormIsActive}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_blocked">Bloquear Empresa</Label>
                      <p className="text-xs text-muted-foreground">
                        Bloqueio manual do sistema
                      </p>
                    </div>
                    <Switch
                      id="is_blocked"
                      checked={formIsBlocked}
                      onCheckedChange={setFormIsBlocked}
                    />
                  </div>

                  {formIsBlocked && (
                    <div className="space-y-2">
                      <Label htmlFor="blocked_reason">Motivo do Bloqueio</Label>
                      <Textarea
                        id="blocked_reason"
                        value={formBlockedReason}
                        onChange={(e) => setFormBlockedReason(e.target.value)}
                        placeholder="Informe o motivo do bloqueio..."
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="notes">Observações</Label>
                    <Textarea
                      id="notes"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Observações internas sobre essa empresa..."
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={!formName || loading}>
                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingTenant ? 'Salvar Alterações' : 'Criar Empresa'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Campo de busca */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar empresa por nome, slug ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Credenciais</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants
                  .filter((tenant) => {
                    if (!searchTerm) return true;
                    const search = searchTerm.toLowerCase();
                    const credential = getTenantCredential(tenant.id);
                    return (
                      tenant.name.toLowerCase().includes(search) ||
                      tenant.slug.toLowerCase().includes(search) ||
                      (tenant.email && tenant.email.toLowerCase().includes(search)) ||
                      (credential && credential.email.toLowerCase().includes(search))
                    );
                  })
                  .map((tenant) => {
                  const accessStatus = getAccessStatus(tenant);
                  const daysRemaining = getDaysRemaining(tenant);
                  const credential = getTenantCredential(tenant.id);
                  const showPassword = showPasswords[tenant.id];
                  
                  return (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{tenant.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {tenant.slug}
                          </div>
                          {tenant.email && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {tenant.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {credential ? (
                          <div className="space-y-1">
                            <div className="text-sm font-medium flex items-center gap-1">
                              <Key className="h-3 w-3 text-muted-foreground" />
                              {credential.email}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-mono bg-muted px-1 py-0.5 rounded">
                                {showPassword ? credential.password_hash : '••••••••'}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                onClick={() => togglePassword(tenant.id)}
                              >
                                {showPassword ? (
                                  <EyeOff className="h-3 w-3" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">Sem credencial</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(accessStatus)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{tenant.plan_type || 'trial'}</Badge>
                      </TableCell>
                      <TableCell>
                        {daysRemaining !== null ? (
                          daysRemaining <= 0 ? (
                            <Badge variant="destructive">Expirado</Badge>
                          ) : (
                            <div className="text-sm">
                              <strong className={daysRemaining <= 5 ? 'text-destructive' : daysRemaining <= 10 ? 'text-yellow-600' : ''}>{daysRemaining}</strong> dias
                            </div>
                          )
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Ilimitado
                          </Badge>
                        )}
                      </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenDialog(tenant)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant={tenant.is_blocked ? 'default' : 'destructive'}
                          onClick={() => handleToggleBlock(tenant)}
                        >
                          {tenant.is_blocked ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <Ban className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {tenants.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma empresa cadastrada ainda
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
