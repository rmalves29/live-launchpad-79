import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Checkbox } from "./ui/checkbox";
import { Separator } from "./ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Edit, Users, Mail, Trash2, UserCheck } from "lucide-react";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AvailableUser {
  id: string;
  email: string;
  created_at: string;
}

export const TenantsManager = () => {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);  
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    adminEmail: "",
    adminPassword: ""
  });
  const { toast } = useToast();

  useEffect(() => {
    loadTenants();
    loadAvailableUsers();
  }, []);

  const loadAvailableUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, created_at")
        .is("tenant_id", null)
        .neq("role", "super_admin")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAvailableUsers(data || []);
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
    }
  };

  const loadTenants = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTenants(data || []);
    } catch (error) {
      console.error("Erro ao carregar empresas:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as empresas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateUniqueSlug = async (baseSlug: string): Promise<string> => {
    let slug = baseSlug;
    let counter = 1;
    
    while (true) {
      const { data, error } = await supabase
        .from("tenants")
        .select("slug")
        .eq("slug", slug)
        .single();
      
      if (error && error.code === 'PGRST116') {
        // Não encontrou duplicata, pode usar este slug
        return slug;
      }
      
      if (data) {
        // Encontrou duplicata, tentar próximo
        slug = `${baseSlug}-${counter}`;
        counter++;
      } else {
        return slug;
      }
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.slug) {
      toast({
        title: "Erro",
        description: "Nome e identificador são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    if (!editingTenant && (!formData.adminEmail)) {
      toast({
        title: "Erro",
        description: "Email do administrador é obrigatório para nova empresa",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      if (editingTenant) {
        const { error } = await supabase
          .from("tenants")
          .update({
            name: formData.name,
            slug: formData.slug
          })
          .eq("id", editingTenant.id);

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Empresa atualizada com sucesso",
        });
      } else {
        // Gerar slug único
        const uniqueSlug = await generateUniqueSlug(formData.slug);
        
        const { data: newTenant, error } = await supabase
          .from("tenants")
          .insert({
            name: formData.name,
            slug: uniqueSlug,
            is_active: true
          })
          .select()
          .single();

        if (error) throw error;

        // Criar usuário administrador para a nova empresa via Edge Function (confirmado automaticamente)
        if (newTenant) {
          try {
            // Gera senha aleatória se não informada (para permitir login por link mágico)
            const generatedPassword = !formData.adminPassword
              ? Math.random().toString(36).slice(-10) +
                Math.random().toString(36).toUpperCase().slice(-4) +
                "!#"
              : formData.adminPassword;

            const { error: createErr } = await supabase.functions.invoke('tenant-create-user', {
              body: {
                email: formData.adminEmail,
                password: generatedPassword,
                tenant_id: newTenant.id,
                role: 'tenant_admin',
              },
            });

            if (createErr) throw createErr;

            console.log("✅ Usuário administrador criado via edge function para empresa:", newTenant.name);

            // Se não informamos senha, gera e abre um link mágico de acesso imediato
            if (!formData.adminPassword) {
              const { data: linkData, error: linkErr } = await supabase.functions.invoke('tenant-generate-login-link', {
                body: {
                  email: formData.adminEmail,
                  tenant_id: newTenant.id,
                },
              });

              if (linkErr) {
                console.warn("Não foi possível gerar link de acesso automático:", linkErr);
              } else if (linkData?.action_link) {
                window.open(linkData.action_link, "_blank");
                toast({
                  title: "Link de acesso criado",
                  description: "Abrimos o acesso do admin em uma nova aba.",
                });
              }
            }
          } catch (userError) {
            console.error("Erro ao criar usuário administrador:", userError);
            toast({
              title: "Aviso",
              description: "Empresa criada, mas houve erro ao criar o usuário administrador",
              variant: "destructive",
            });
          }
        }

        toast({
          title: "Sucesso",
          description: "Empresa criada com sucesso",
        });

        // Vincular usuários selecionados à nova empresa
        if (selectedUsers.length > 0 && newTenant) {
          try {
            const { error: linkError } = await supabase
              .from("profiles")
              .update({ 
                tenant_id: newTenant.id,
                role: 'staff'
              })
              .in('id', selectedUsers);

            if (linkError) throw linkError;

            toast({
              title: "Usuários vinculados",
              description: `${selectedUsers.length} usuário(s) foram vinculados à empresa`,
            });
          } catch (linkError) {
            console.error("Erro ao vincular usuários:", linkError);
            toast({
              title: "Aviso",
              description: "Empresa criada, mas houve erro ao vincular alguns usuários",
              variant: "destructive",
            });
          }
        }
      }

      setDialogOpen(false);
      setEditingTenant(null);
      setSelectedUsers([]);
      setFormData({
        name: "",
        slug: "",
        adminEmail: "",
        adminPassword: ""
      });
      loadTenants();
      loadAvailableUsers();
    } catch (error) {
      console.error("Erro ao salvar empresa:", error);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a empresa",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (tenant: Tenant) => {
    try {
      const { error } = await supabase
        .from("tenants")
        .update({ is_active: !tenant.is_active })
        .eq("id", tenant.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `Empresa ${!tenant.is_active ? "ativada" : "desativada"} com sucesso`,
      });

      loadTenants();
    } catch (error) {
      console.error("Erro ao alterar status:", error);
      toast({
        title: "Erro",
        description: "Não foi possível alterar o status da empresa",
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setFormData({
      name: tenant.name,
      slug: tenant.slug,
      adminEmail: "",
      adminPassword: ""
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingTenant(null);
    setSelectedUsers([]);
    setFormData({
      name: "",
      slug: "",
      adminEmail: "",
      adminPassword: ""
    });
    setDialogOpen(true);
  };

  const handleDelete = async (tenant: Tenant) => {
    const confirmDelete = window.confirm(
      `Tem certeza que deseja excluir a empresa "${tenant.name}"? Esta ação não pode ser desfeita.`
    );

    if (!confirmDelete) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .delete()
        .eq("id", tenant.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Empresa excluída com sucesso",
      });

      loadTenants();
    } catch (error) {
      console.error("Erro ao excluir empresa:", error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir a empresa",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Gerenciar Empresas</h3>
          <p className="text-sm text-muted-foreground">
            Crie e gerencie diferentes empresas no sistema
          </p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Empresa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingTenant ? "Editar Empresa" : "Nova Empresa"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Nome da Empresa</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Minha Empresa"
                />
              </div>
              
              <div>
                <Label htmlFor="slug">Identificador (slug)</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                  placeholder="ex: minha-empresa"
                />
              </div>

              {!editingTenant && (
                <>
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
                    <Label htmlFor="adminPassword">Senha do Administrador (opcional)</Label>
                    <Input
                      id="adminPassword"
                      type="password"
                      value={formData.adminPassword}
                      onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                      placeholder="Deixe em branco para enviar link de acesso"
                    />
                  </div>

                  {availableUsers.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <Label className="flex items-center gap-2 mb-3">
                          <UserCheck className="h-4 w-4" />
                          Vincular Usuários Existentes
                        </Label>
                        <div className="max-h-32 overflow-y-auto space-y-2 border rounded p-3">
                          {availableUsers.map((user) => (
                            <div key={user.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`user-${user.id}`}
                                checked={selectedUsers.includes(user.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedUsers([...selectedUsers, user.id]);
                                  } else {
                                    setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                                  }
                                }}
                              />
                              <Label htmlFor={`user-${user.id}`} className="text-sm flex-1 cursor-pointer">
                                {user.email}
                                <span className="text-xs text-muted-foreground ml-2">
                                  (Cadastrado em {new Date(user.created_at).toLocaleDateString('pt-BR')})
                                </span>
                              </Label>
                            </div>
                          ))}
                        </div>
                        {selectedUsers.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {selectedUsers.length} usuário(s) selecionado(s) para vincular à empresa
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {editingTenant && (
                <>
                  <Separator />
                  <div>
                    <Label className="mb-2">Acesso do Administrador</Label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label htmlFor="adminEmailEdit">Email do Administrador</Label>
                        <Input
                          id="adminEmailEdit"
                          type="email"
                          value={formData.adminEmail}
                          onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                          placeholder="admin@empresa.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="adminPasswordEdit">Nova Senha</Label>
                        <Input
                          id="adminPasswordEdit"
                          type="password"
                          value={formData.adminPassword}
                          onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                          placeholder="Defina uma nova senha"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end mt-3">
                      <Button
                        variant="secondary"
                        disabled={!formData.adminEmail || !formData.adminPassword || loading}
                        onClick={async () => {
                          if (!editingTenant) return;
                          try {
                            setLoading(true);
                            const { error } = await supabase.functions.invoke('tenant-reset-password', {
                              body: {
                                email: formData.adminEmail,
                                new_password: formData.adminPassword,
                                tenant_id: editingTenant.id,
                                role: 'tenant_admin',
                              },
                            });
                            if (error) throw error;
                            toast({
                              title: 'Acesso atualizado',
                              description: 'Senha do administrador atualizada/criada com sucesso.',
                            });
                            setFormData({ ...formData, adminPassword: '' });
                          } catch (err: any) {
                            console.error('Erro ao atualizar acesso do admin:', err);
                            toast({
                              title: 'Erro',
                              description: err?.message || 'Falha ao atualizar o acesso do administrador.',
                              variant: 'destructive',
                            });
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        Atualizar acesso do admin
                      </Button>
                    </div>
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {tenants.map((tenant) => (
          <Card key={tenant.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {tenant.name}
                    <Badge variant={tenant.is_active ? "default" : "secondary"}>
                      {tenant.is_active ? "Ativa" : "Inativa"}
                    </Badge>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Identificador: {tenant.slug}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={tenant.is_active}
                    onCheckedChange={() => handleToggleActive(tenant)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(tenant)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(tenant)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Criada em: {new Date(tenant.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {tenants.length === 0 && !loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhuma empresa encontrada</p>
            <p className="text-muted-foreground mb-6">
              Crie sua primeira empresa para começar
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Empresa
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};