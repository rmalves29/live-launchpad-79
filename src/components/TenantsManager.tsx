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
import { Plus, Edit, Users, Mail, Trash2, UserCheck, Eye, EyeOff } from "lucide-react";
import bcrypt from 'bcryptjs';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  admin_email?: string;
  admin_user_id?: string;
}

interface TenantCredential {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  is_active: boolean;
}

interface Profile {
  id: string;
  email: string;
  created_at: string;
}

export default function TenantsManager() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [credentials, setCredentials] = useState<TenantCredential[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [showPasswords, setShowPasswords] = useState<{[key: string]: boolean}>({});
  const { toast } = useToast();
  const { user, profile } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    adminEmail: "",
    adminPassword: ""
  });

  useEffect(() => {
    if (user && profile?.role === 'super_admin') {
      loadData();
    }
  }, [user, profile]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Carregar tenants
      const { data: tenantsData, error: tenantsError } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });

      if (tenantsError) throw tenantsError;
      setTenants(tenantsData || []);

      // Carregar credenciais
      const { data: credentialsData, error: credentialsError } = await supabase
        .from("tenant_credentials")
        .select("*");

      if (credentialsError) throw credentialsError;
      setCredentials(credentialsData || []);

      // Carregar profiles sem tenant
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, created_at")
        .is("tenant_id", null)
        .neq("role", "super_admin")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;
      setProfiles(profilesData || []);

    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados: " + error.message,
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

  const handleCreateTenant = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Erro",
        description: "Nome da empresa é obrigatório",
        variant: "destructive",
      });
      return;
    }

    if (!formData.adminEmail.trim()) {
      toast({
        title: "Erro", 
        description: "Email do administrador é obrigatório",
        variant: "destructive",
      });
      return;
    }

    if (!formData.adminPassword.trim()) {
      toast({
        title: "Erro",
        description: "Senha do administrador é obrigatória", 
        variant: "destructive",
      });
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

      // Criar tenant
      const { data: newTenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({
          name: formData.name,
          slug: uniqueSlug,
          is_active: true
        })
        .select()
        .single();

      if (tenantError) throw tenantError;

      // Hash da senha
      const passwordHash = await bcrypt.hash(formData.adminPassword, 10);

      // Criar credencial
      const { error: credentialError } = await supabase
        .from("tenant_credentials")
        .insert({
          tenant_id: newTenant.id,
          email: formData.adminEmail,
          password_hash: passwordHash,
          is_active: true
        });

      if (credentialError) throw credentialError;

      toast({
        title: "Sucesso",
        description: `Empresa "${formData.name}" criada com sucesso!`,
      });

      setFormData({ name: "", slug: "", adminEmail: "", adminPassword: "" });
      setShowCreateDialog(false);
      loadData();

    } catch (error: any) {
      console.error("Erro ao criar empresa:", error);
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

      // Atualizar tenant
      const { error: tenantError } = await supabase
        .from("tenants")
        .update({
          name: formData.name,
        })
        .eq("id", editingTenant.id);

      if (tenantError) throw tenantError;

      // Atualizar ou criar credencial
      const existingCredential = credentials.find(c => c.tenant_id === editingTenant.id);
      
      if (formData.adminPassword) {
        const passwordHash = await bcrypt.hash(formData.adminPassword, 10);
        
        if (existingCredential) {
          // Atualizar credencial existente
          const { error: credentialError } = await supabase
            .from("tenant_credentials")
            .update({
              email: formData.adminEmail,
              password_hash: passwordHash,
            })
            .eq("tenant_id", editingTenant.id);

          if (credentialError) throw credentialError;
        } else {
          // Criar nova credencial
          const { error: credentialError } = await supabase
            .from("tenant_credentials")
            .insert({
              tenant_id: editingTenant.id,
              email: formData.adminEmail,
              password_hash: passwordHash,
              is_active: true
            });

          if (credentialError) throw credentialError;
        }
      } else if (existingCredential && formData.adminEmail !== existingCredential.email) {
        // Atualizar apenas email se senha não foi fornecida
        const { error: credentialError } = await supabase
          .from("tenant_credentials")
          .update({
            email: formData.adminEmail,
          })
          .eq("tenant_id", editingTenant.id);

        if (credentialError) throw credentialError;
      }

      toast({
        title: "Sucesso",
        description: "Empresa atualizada com sucesso!",
      });

      setEditingTenant(null);
      setFormData({ name: "", slug: "", adminEmail: "", adminPassword: "" });
      loadData();

    } catch (error: any) {
      console.error("Erro ao atualizar empresa:", error);
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
    if (!confirm(`Tem certeza que deseja excluir a empresa "${tenant.name}"?`)) {
      return;
    }

    try {
      setLoading(true);
      
      const { error } = await supabase
        .from("tenants")
        .delete()
        .eq("id", tenant.id);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `Empresa "${tenant.name}" excluída com sucesso!`,
      });

      loadData();
    } catch (error: any) {
      console.error("Erro ao excluir empresa:", error);
      toast({
        title: "Erro",
        description: "Erro ao excluir empresa: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const togglePassword = (tenantId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [tenantId]: !prev[tenantId]
    }));
  };

  const getTenantCredential = (tenantId: string) => {
    return credentials.find(c => c.tenant_id === tenantId);
  };

  const resetForm = () => {
    setFormData({ name: "", slug: "", adminEmail: "", adminPassword: "" });
    setEditingTenant(null);
  };

  if (loading) {
    return <div className="flex justify-center p-8">Carregando...</div>;
  }

  if (!user || profile?.role !== 'super_admin') {
    return <div className="flex justify-center p-8">Acesso negado. Apenas super administradores podem acessar esta página.</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Gerenciar Empresas</h1>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
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

      {/* Lista de Empresas */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {tenants.map((tenant) => {
          const credential = getTenantCredential(tenant.id);
          const showPassword = showPasswords[tenant.id];
          
          return (
            <Card key={tenant.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{tenant.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Slug: {tenant.slug}
                    </p>
                  </div>
                  <Badge variant={tenant.is_active ? "default" : "secondary"}>
                    {tenant.is_active ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {credential ? (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-sm text-muted-foreground">Email:</Label>
                      <p className="text-sm font-mono break-all">{credential.email}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Senha:</Label>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-mono flex-1">
                          {showPassword 
                            ? credential.password_hash.substring(0, 20) + "..." 
                            : "••••••••••••••••"
                          }
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePassword(tenant.id)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma credencial configurada</p>
                )}

                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingTenant(tenant);
                          setFormData({
                            name: tenant.name,
                            slug: tenant.slug,
                            adminEmail: credential?.email || "",
                            adminPassword: ""
                          });
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
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
                          <Input value={tenant.slug} disabled />
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
                          <Label htmlFor="editAdminPassword">
                            Nova Senha (deixe em branco para manter a atual)
                          </Label>
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
                          <Button variant="outline" onClick={resetForm}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteTenant(tenant)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {tenants.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Nenhuma empresa encontrada.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Clique em "Nova Empresa" para criar a primeira empresa.
          </p>
        </div>
      )}

      {/* Usuários sem Tenant */}
      {profiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Usuários sem Empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {profiles.map((profile) => (
                <div key={profile.id} className="flex justify-between items-center p-2 border rounded">
                  <div>
                    <p className="font-medium">{profile.email}</p>
                    <p className="text-sm text-muted-foreground">
                      Criado em: {new Date(profile.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}