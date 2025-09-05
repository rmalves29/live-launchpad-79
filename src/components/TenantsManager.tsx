import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./ui/use-toast";
import { Plus, Edit, Users } from "lucide-react";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  whatsapp_api_url?: string;
  melhor_envio_from_cep?: string;
  melhor_envio_env?: string;
}

export const TenantsManager = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    whatsapp_api_url: "",
    melhor_envio_from_cep: "31575060",
    melhor_envio_env: "sandbox"
  });
  const { toast } = useToast();

  useEffect(() => {
    loadTenants();
  }, []);

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

  const handleSave = async () => {
    if (!formData.name || !formData.slug) {
      toast({
        title: "Erro",
        description: "Nome e identificador são obrigatórios",
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
            slug: formData.slug,
            whatsapp_api_url: formData.whatsapp_api_url || null,
            melhor_envio_from_cep: formData.melhor_envio_from_cep,
            melhor_envio_env: formData.melhor_envio_env,
          })
          .eq("id", editingTenant.id);

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Empresa atualizada com sucesso",
        });
      } else {
        const { error } = await supabase
          .from("tenants")
          .insert({
            name: formData.name,
            slug: formData.slug,
            whatsapp_api_url: formData.whatsapp_api_url || null,
            melhor_envio_from_cep: formData.melhor_envio_from_cep,
            melhor_envio_env: formData.melhor_envio_env,
            is_active: true,
          });

        if (error) throw error;

        toast({
          title: "Sucesso",
          description: "Empresa criada com sucesso",
        });
      }

      setDialogOpen(false);
      setEditingTenant(null);
      setFormData({
        name: "",
        slug: "",
        whatsapp_api_url: "",
        melhor_envio_from_cep: "31575060",
        melhor_envio_env: "sandbox"
      });
      loadTenants();
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
      whatsapp_api_url: tenant.whatsapp_api_url || "",
      melhor_envio_from_cep: tenant.melhor_envio_from_cep || "31575060",
      melhor_envio_env: tenant.melhor_envio_env || "sandbox"
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingTenant(null);
    setFormData({
      name: "",
      slug: "",
      whatsapp_api_url: "",
      melhor_envio_from_cep: "31575060",
      melhor_envio_env: "sandbox"
    });
    setDialogOpen(true);
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

              <div>
                <Label htmlFor="whatsapp_api_url">URL da API do WhatsApp</Label>
                <Input
                  id="whatsapp_api_url"
                  value={formData.whatsapp_api_url}
                  onChange={(e) => setFormData({ ...formData, whatsapp_api_url: e.target.value })}
                  placeholder="https://api.whatsapp.com..."
                />
              </div>

              <div>
                <Label htmlFor="melhor_envio_from_cep">CEP de Origem (Melhor Envio)</Label>
                <Input
                  id="melhor_envio_from_cep"
                  value={formData.melhor_envio_from_cep}
                  onChange={(e) => setFormData({ ...formData, melhor_envio_from_cep: e.target.value })}
                  placeholder="31575060"
                />
              </div>

              <div>
                <Label htmlFor="melhor_envio_env">Ambiente Melhor Envio</Label>
                <select
                  id="melhor_envio_env"
                  value={formData.melhor_envio_env}
                  onChange={(e) => setFormData({ ...formData, melhor_envio_env: e.target.value })}
                  className="w-full px-3 py-2 border border-input rounded-md"
                >
                  <option value="sandbox">Sandbox</option>
                  <option value="production">Produção</option>
                </select>
              </div>

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
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {tenant.whatsapp_api_url && (
                  <p><strong>WhatsApp API:</strong> {tenant.whatsapp_api_url}</p>
                )}
                <p><strong>CEP Origem:</strong> {tenant.melhor_envio_from_cep}</p>
                <p><strong>Ambiente:</strong> {tenant.melhor_envio_env}</p>
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