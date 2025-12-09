/**
 * Painel Administrativo de Gerenciamento de Tenants
 * Apenas para super_admin
 * Permite criar, editar, ativar/desativar e definir prazo de acesso
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Loader2, 
  Plus, 
  Edit, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Calendar,
  Building2
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  expires_at: string | null;
  plan: string;
  trial_days: number;
  created_at: string;
  email: string | null;
  whatsapp_number: string | null;
  status?: 'active' | 'expired' | 'expiring_soon' | 'unlimited';
  days_remaining?: number | null;
}

export default function TenantsManager() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    email: '',
    whatsapp_number: '',
    plan: 'trial',
    trial_days: 30,
    expires_at: '',
    is_active: true,
  });

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);
      setError(null);

      // Buscar todos os tenants com status
      const { data, error: fetchError } = await supabase
        .from('tenants_with_status')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setTenants(data || []);
    } catch (err: any) {
      console.error('Erro ao carregar tenants:', err);
      setError('Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      setError(null);
      setSuccess(null);

      const payload: any = {
        name: formData.name,
        slug: formData.slug || undefined,
        email: formData.email || null,
        whatsapp_number: formData.whatsapp_number || null,
        plan: formData.plan,
        trial_days: formData.trial_days,
        is_active: formData.is_active,
      };

      // Se tiver data de expiração customizada
      if (formData.expires_at) {
        payload.expires_at = new Date(formData.expires_at).toISOString();
      }

      const { error: createError } = await supabase
        .from('tenants')
        .insert(payload);

      if (createError) throw createError;

      setSuccess('Empresa criada com sucesso!');
      setIsCreateOpen(false);
      resetForm();
      await loadTenants();
    } catch (err: any) {
      console.error('Erro ao criar tenant:', err);
      setError(err.message || 'Erro ao criar empresa');
    }
  };

  const handleUpdate = async () => {
    if (!selectedTenant) return;

    try {
      setError(null);
      setSuccess(null);

      const payload: any = {
        name: formData.name,
        email: formData.email || null,
        whatsapp_number: formData.whatsapp_number || null,
        plan: formData.plan,
        is_active: formData.is_active,
      };

      if (formData.expires_at) {
        payload.expires_at = new Date(formData.expires_at).toISOString();
      }

      const { error: updateError } = await supabase
        .from('tenants')
        .update(payload)
        .eq('id', selectedTenant.id);

      if (updateError) throw updateError;

      setSuccess('Empresa atualizada com sucesso!');
      setIsEditOpen(false);
      resetForm();
      await loadTenants();
    } catch (err: any) {
      console.error('Erro ao atualizar tenant:', err);
      setError(err.message || 'Erro ao atualizar empresa');
    }
  };

  const handleExtendAccess = async (tenantId: string, days: number) => {
    try {
      setError(null);
      
      const { data, error } = await supabase.rpc('extend_tenant_access', {
        tenant_id: tenantId,
        days: days
      });

      if (error) throw error;

      setSuccess(`Acesso estendido por ${days} dias!`);
      await loadTenants();
    } catch (err: any) {
      console.error('Erro ao estender acesso:', err);
      setError('Erro ao estender acesso');
    }
  };

  const handleDelete = async (tenantId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta empresa? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      setError(null);
      
      const { error: deleteError } = await supabase
        .from('tenants')
        .delete()
        .eq('id', tenantId);

      if (deleteError) throw deleteError;

      setSuccess('Empresa excluída com sucesso!');
      await loadTenants();
    } catch (err: any) {
      console.error('Erro ao excluir tenant:', err);
      setError('Erro ao excluir empresa');
    }
  };

  const openEdit = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setFormData({
      name: tenant.name,
      slug: tenant.slug,
      email: tenant.email || '',
      whatsapp_number: tenant.whatsapp_number || '',
      plan: tenant.plan,
      trial_days: tenant.trial_days,
      expires_at: tenant.expires_at ? new Date(tenant.expires_at).toISOString().split('T')[0] : '',
      is_active: tenant.is_active,
    });
    setIsEditOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      email: '',
      whatsapp_number: '',
      plan: 'trial',
      trial_days: 30,
      expires_at: '',
      is_active: true,
    });
    setSelectedTenant(null);
  };

  const getStatusBadge = (tenant: Tenant) => {
    switch (tenant.status) {
      case 'expired':
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" />Expirado</Badge>;
      case 'expiring_soon':
        return <Badge variant="default" className="bg-yellow-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Expira em {tenant.days_remaining} dias</Badge>;
      case 'unlimited':
        return <Badge variant="default" className="bg-green-500 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Ilimitado</Badge>;
      default:
        return <Badge variant="default" className="bg-blue-500 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Ativo ({tenant.days_remaining} dias)</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-8 w-8" />
            Gerenciar Empresas
          </h1>
          <p className="text-muted-foreground mt-1">
            Administração de tenants e controle de acesso
          </p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setIsCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Empresa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Criar Nova Empresa</DialogTitle>
              <DialogDescription>
                Preencha os dados da nova empresa. O acesso será criado automaticamente.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Empresa *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Minha Loja"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug (URL amigável)</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="minha-loja (opcional)"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="contato@minhaloja.com"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <Input
                    id="whatsapp"
                    value={formData.whatsapp_number}
                    onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                    placeholder="(11) 99999-9999"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="plan">Plano</Label>
                  <Select value={formData.plan} onValueChange={(value) => setFormData({ ...formData, plan: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial (Teste)</SelectItem>
                      <SelectItem value="basic">Básico</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="trial_days">Dias de Trial</Label>
                  <Input
                    id="trial_days"
                    type="number"
                    value={formData.trial_days}
                    onChange={(e) => setFormData({ ...formData, trial_days: parseInt(e.target.value) })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expires_at">Data de Expiração</Label>
                  <Input
                    id="expires_at"
                    type="date"
                    value={formData.expires_at}
                    onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Empresa Ativa</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={!formData.name}>
                Criar Empresa
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-4 border-green-500 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {tenants.map((tenant) => (
          <Card key={tenant.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    {tenant.name}
                    {!tenant.is_active && <Badge variant="secondary">Inativa</Badge>}
                  </CardTitle>
                  <CardDescription className="mt-2">
                    <div className="flex flex-wrap gap-3 text-sm">
                      <span>Slug: <strong>{tenant.slug}</strong></span>
                      {tenant.email && <span>• {tenant.email}</span>}
                      {tenant.whatsapp_number && <span>• {tenant.whatsapp_number}</span>}
                      <span>• Plano: <strong>{tenant.plan}</strong></span>
                    </div>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(tenant)}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(tenant)}>
                  <Edit className="h-4 w-4 mr-1" />
                  Editar
                </Button>
                
                {tenant.status !== 'unlimited' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => handleExtendAccess(tenant.id, 30)}>
                      <Calendar className="h-4 w-4 mr-1" />
                      +30 dias
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleExtendAccess(tenant.id, 90)}>
                      <Calendar className="h-4 w-4 mr-1" />
                      +90 dias
                    </Button>
                  </>
                )}
                
                <Button size="sm" variant="destructive" onClick={() => handleDelete(tenant.id)}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Excluir
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog de Edição */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Empresa</DialogTitle>
            <DialogDescription>
              Atualize os dados da empresa
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome da Empresa *</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Slug (não editável)</Label>
                <Input value={formData.slug} disabled />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-email">E-mail</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-whatsapp">WhatsApp</Label>
                <Input
                  id="edit-whatsapp"
                  value={formData.whatsapp_number}
                  onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-plan">Plano</Label>
                <Select value={formData.plan} onValueChange={(value) => setFormData({ ...formData, plan: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial (Teste)</SelectItem>
                    <SelectItem value="basic">Básico</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-expires_at">Data de Expiração</Label>
                <Input
                  id="edit-expires_at"
                  type="date"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="edit-is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="edit-is_active">Empresa Ativa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate}>
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
