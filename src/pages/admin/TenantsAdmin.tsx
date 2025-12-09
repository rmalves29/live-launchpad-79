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
  Users
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  is_active: boolean;
  is_blocked: boolean;
  blocked_reason: string | null;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  plan: string;
  contact_name: string | null;
  contact_phone: string | null;
  created_at: string;
  access_status: string;
  days_remaining: number | null;
  total_users: number;
}

export default function TenantsAdmin() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formContactName, setFormContactName] = useState('');
  const [formContactPhone, setFormContactPhone] = useState('');
  const [formTrialDays, setFormTrialDays] = useState('30');
  const [formPlan, setFormPlan] = useState('trial');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formIsBlocked, setFormIsBlocked] = useState(false);
  const [formBlockedReason, setFormBlockedReason] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('tenants_access_status')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setTenants(data || []);
    } catch (err: any) {
      console.error('Erro ao carregar tenants:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (tenant?: Tenant) => {
    if (tenant) {
      setEditingTenant(tenant);
      setFormName(tenant.name);
      setFormEmail(tenant.email || '');
      setFormContactName(tenant.contact_name || '');
      setFormContactPhone(tenant.contact_phone || '');
      setFormPlan(tenant.plan);
      setFormIsActive(tenant.is_active);
      setFormIsBlocked(tenant.is_blocked);
      setFormBlockedReason(tenant.blocked_reason || '');
      
      // Calcular dias restantes
      if (tenant.days_remaining) {
        setFormTrialDays(tenant.days_remaining.toString());
      }
    } else {
      setEditingTenant(null);
      setFormName('');
      setFormEmail('');
      setFormContactName('');
      setFormContactPhone('');
      setFormTrialDays('30');
      setFormPlan('trial');
      setFormIsActive(true);
      setFormIsBlocked(false);
      setFormBlockedReason('');
      setFormNotes('');
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + parseInt(formTrialDays || '30'));

      const tenantData = {
        name: formName,
        email: formEmail || null,
        contact_name: formContactName || null,
        contact_phone: formContactPhone || null,
        plan: formPlan,
        is_active: formIsActive,
        is_blocked: formIsBlocked,
        blocked_reason: formIsBlocked ? formBlockedReason : null,
        trial_ends_at: trialEndsAt.toISOString(),
        notes: formNotes || null,
      };

      if (editingTenant) {
        // Atualizar
        const { error: updateError } = await supabase
          .from('tenants')
          .update(tenantData)
          .eq('id', editingTenant.id);

        if (updateError) throw updateError;
      } else {
        // Criar novo
        const { error: insertError } = await supabase
          .from('tenants')
          .insert(tenantData);

        if (insertError) throw insertError;
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
          is_blocked: !tenant.is_blocked,
          blocked_reason: !tenant.is_blocked ? 'Bloqueado pelo administrador' : null
        })
        .eq('id', tenant.id);

      if (updateError) throw updateError;

      await loadTenants();
    } catch (err: any) {
      console.error('Erro ao bloquear/desbloquear tenant:', err);
      setError(err.message);
    }
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
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="contato@empresa.com"
                    />
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
                        onChange={(e) => setFormPlan(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="trial">Trial (Teste)</option>
                        <option value="basic">Basic</option>
                        <option value="pro">Pro</option>
                        <option value="enterprise">Enterprise</option>
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

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Usuários</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{tenant.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {tenant.slug}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {tenant.contact_name && (
                          <div>{tenant.contact_name}</div>
                        )}
                        {tenant.email && (
                          <div className="text-xs text-muted-foreground">
                            {tenant.email}
                          </div>
                        )}
                        {tenant.contact_phone && (
                          <div className="text-xs text-muted-foreground">
                            {tenant.contact_phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(tenant.access_status)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{tenant.plan}</Badge>
                    </TableCell>
                    <TableCell>
                      {tenant.days_remaining !== null ? (
                        <div className="text-sm">
                          <strong>{tenant.days_remaining}</strong> dias
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {tenant.total_users}
                      </div>
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
                ))}
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
