/**
 * Página de Administração de Empresas (Tenants)
 * Apenas para super_admin
 * Permite criar, editar, bloquear e gerenciar tenants
 */

import { useState, useEffect, useRef } from 'react';
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
  Search,
  Upload,
  Image,
  Trash2,
  Building2,
  AlertTriangle,
  Clock,
  RefreshCw
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { differenceInDays } from 'date-fns';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  logo_url: string | null;
  is_active: boolean;
  is_blocked: boolean | null;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  plan_type: string | null;
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

// Configuração de dias por plano
const PLAN_DAYS: Record<string, number> = {
  trial_teste: 7,
  basic: 33,
  pro: 185,
  enterprise: 368,
};

export default function EmpresasIndex() {
  const { profile } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [credentials, setCredentials] = useState<TenantCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [showPasswords, setShowPasswords] = useState<{[key: string]: boolean}>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'blocked' | 'expired'>('all');
  const [filterPrazo, setFilterPrazo] = useState<'all' | 'expired' | 'critical' | 'warning' | 'ok' | 'unlimited'>('all');

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
  
  // Logo upload states
  const [formLogoUrl, setFormLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione apenas arquivos de imagem');
      return;
    }

    // Validar tamanho (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 2MB');
      return;
    }

    setUploadingLogo(true);
    setError(null);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${editingTenant?.id || 'new'}-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('tenant-logos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('tenant-logos')
        .getPublicUrl(filePath);

      setFormLogoUrl(publicUrl);
    } catch (err: any) {
      console.error('Erro ao fazer upload:', err);
      setError('Erro ao fazer upload da logo: ' + err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const removeLogo = () => {
    setFormLogoUrl(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('tenants')
        .select('id, name, slug, email, logo_url, is_active, is_blocked, trial_ends_at, subscription_ends_at, plan_type, admin_email, created_at')
        .order('name');

      if (fetchError) throw fetchError;

      setTenants(data || []);

      // Carregar credenciais
      const { data: credentialsData, error: credentialsError } = await supabase
        .from('tenant_credentials')
        .select('*');

      if (credentialsError) throw credentialsError;
      setCredentials(credentialsData || []);

    } catch (err: any) {
      console.error('Erro ao carregar empresas:', err);
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
      setFormLogoUrl(tenant.logo_url || null);
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
      setFormLogoUrl(null);
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
        logo_url: formLogoUrl || null,
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

  const getDaysRemaining = (subscriptionEndsAt: string | null): number | null => {
    if (!subscriptionEndsAt) return null;
    const endDate = new Date(subscriptionEndsAt);
    const now = new Date();
    return differenceInDays(endDate, now);
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

  const getPlanBadge = (planType: string | null) => {
    const plan = planType || 'trial';
    const planColors: Record<string, string> = {
      trial_teste: 'bg-blue-100 text-blue-800 border-blue-200',
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
    // Super admin (trial ilimitado)
    if (tenant.plan_type === 'trial' && !tenant.subscription_ends_at && !tenant.trial_ends_at) {
      return (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle className="h-3 w-3" />
          Ilimitado
        </Badge>
      );
    }

    const daysRemaining = getDaysRemaining(tenant.subscription_ends_at || tenant.trial_ends_at);

    if (daysRemaining === null) {
      return (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle className="h-3 w-3" />
          Ilimitado
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
        <CheckCircle className="h-3 w-3" />
        {daysRemaining} dias
      </Badge>
    );
  };

  const filteredTenants = tenants.filter(tenant => {
    // Filtro de busca por texto
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const credential = getTenantCredential(tenant.id);
      const matchesSearch = (
        tenant.name.toLowerCase().includes(search) ||
        tenant.slug.toLowerCase().includes(search) ||
        (tenant.email && tenant.email.toLowerCase().includes(search)) ||
        (tenant.admin_email && tenant.admin_email.toLowerCase().includes(search)) ||
        (credential && credential.email.toLowerCase().includes(search))
      );
      if (!matchesSearch) return false;
    }

    // Filtro de status
    if (filterStatus !== 'all') {
      const isBlocked = tenant.is_blocked === true;
      const isActive = tenant.is_active && !isBlocked;
      const days = getDaysRemaining(tenant.subscription_ends_at || tenant.trial_ends_at);
      const isExpired = days !== null && days <= 0;

      switch (filterStatus) {
        case 'active':
          if (!isActive || isExpired) return false;
          break;
        case 'inactive':
          if (isActive || isBlocked) return false;
          break;
        case 'blocked':
          if (!isBlocked) return false;
          break;
        case 'expired':
          if (!isExpired) return false;
          break;
      }
    }

    // Filtro de prazo (dias)
    if (filterPrazo !== 'all') {
      const days = getDaysRemaining(tenant.subscription_ends_at || tenant.trial_ends_at);
      
      switch (filterPrazo) {
        case 'expired':
          if (days === null || days > 0) return false;
          break;
        case 'critical':
          if (days === null || days <= 0 || days > 5) return false;
          break;
        case 'warning':
          if (days === null || days <= 5 || days > 10) return false;
          break;
        case 'ok':
          if (days === null || days <= 10) return false;
          break;
        case 'unlimited':
          if (days !== null) return false;
          break;
      }
    }

    return true;
  });

  // Estatísticas
  const totalEmpresas = tenants.length;
  const empresasAtivas = tenants.filter(t => t.is_active && !t.is_blocked).length;
  const empresasInativas = tenants.filter(t => !t.is_active || t.is_blocked).length;
  const empresasExpiradas = tenants.filter(t => {
    const days = getDaysRemaining(t.subscription_ends_at || t.trial_ends_at);
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
          <Button variant="outline" onClick={loadTenants} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
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

                {/* Upload de Logo */}
                <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-primary" />
                    <Label className="font-semibold">Logo da Empresa</Label>
                  </div>
                  
                  {formLogoUrl ? (
                    <div className="flex items-center gap-4">
                      <img 
                        src={formLogoUrl} 
                        alt="Logo" 
                        className="h-16 w-16 object-contain border rounded"
                      />
                      <div className="flex flex-col gap-2">
                        <p className="text-sm text-muted-foreground">Logo atual</p>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={removeLogo}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remover
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        ref={logoInputRef}
                        id="logo"
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        disabled={uploadingLogo}
                        className="flex-1"
                      />
                      {uploadingLogo && <Loader2 className="h-4 w-4 animate-spin" />}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    A logo aparecerá no checkout público. Tamanho máximo: 2MB
                  </p>
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

              {error && (
                <Alert variant="destructive" className="mb-4">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

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
              <CheckCircle className="h-8 w-8 text-emerald-500/30" />
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
          <div className="flex flex-col gap-4">
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
            
            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="filter-status" className="text-sm whitespace-nowrap">Status:</Label>
                <select
                  id="filter-status"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                  className="flex h-9 w-full sm:w-40 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                >
                  <option value="all">Todos</option>
                  <option value="active">Ativas</option>
                  <option value="inactive">Inativas</option>
                  <option value="blocked">Bloqueadas</option>
                  <option value="expired">Expiradas</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <Label htmlFor="filter-prazo" className="text-sm whitespace-nowrap">Prazo:</Label>
                <select
                  id="filter-prazo"
                  value={filterPrazo}
                  onChange={(e) => setFilterPrazo(e.target.value as typeof filterPrazo)}
                  className="flex h-9 w-full sm:w-44 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                >
                  <option value="all">Todos</option>
                  <option value="expired">Expirado (0 dias)</option>
                  <option value="critical">Crítico (1-5 dias)</option>
                  <option value="warning">Atenção (6-10 dias)</option>
                  <option value="ok">OK (+10 dias)</option>
                  <option value="unlimited">Ilimitado</option>
                </select>
              </div>

              {(filterStatus !== 'all' || filterPrazo !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterStatus('all');
                    setFilterPrazo('all');
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Limpar filtros
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading && tenants.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTenants.map((tenant) => {
                    const accessStatus = getAccessStatus(tenant);
                    const credential = getTenantCredential(tenant.id);
                    const showPassword = showPasswords[tenant.id];
                    
                    return (
                      <TableRow key={tenant.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{tenant.name}</p>
                            <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                            {tenant.email && (
                              <p className="text-xs text-muted-foreground mt-1">{tenant.email}</p>
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
                            <span className="text-muted-foreground text-sm">
                              {tenant.admin_email || 'Sem credencial'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {getStatusBadge(accessStatus)}
                        </TableCell>
                        <TableCell className="text-center">
                          {getPlanBadge(tenant.plan_type)}
                        </TableCell>
                        <TableCell className="text-center">
                          {getPrazoBadge(tenant)}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
