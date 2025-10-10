import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabaseTenant } from "@/lib/supabase-tenant";
import { Plus, Edit2, Trash2, Save, X } from "lucide-react";

interface Template {
  id: number;
  tenant_id: string;
  type: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_TYPES = [
  { value: 'ITEM_ADDED', label: 'Item Adicionado' },
  { value: 'PAID_ORDER', label: 'Pedido Pago' },
  { value: 'PRODUCT_CANCELED', label: 'Item Cancelado' },
  { value: 'MSG_MASSA', label: 'Cobrança em Massa' },
  { value: 'SENDFLOW', label: 'SendFlow MSG' }
];

export default function WhatsappTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  const [formData, setFormData] = useState({
    type: '',
    title: '',
    content: ''
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabaseTenant
        .from('whatsapp_templates')
        .select('*')
        .order('type', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar templates:', error);
      toast.error('Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.type || !formData.title || !formData.content) {
      toast.error('Preencha todos os campos');
      return;
    }

    try {
      if (editingId) {
        // Atualizar
        const { error } = await supabaseTenant
          .from('whatsapp_templates')
          .update({
            type: formData.type,
            title: formData.title,
            content: formData.content,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Template atualizado com sucesso');
      } else {
        // Criar
        const { error } = await supabaseTenant
          .from('whatsapp_templates')
          .insert({
            type: formData.type,
            title: formData.title,
            content: formData.content
          });

        if (error) throw error;
        toast.success('Template criado com sucesso');
      }

      setFormData({ type: '', title: '', content: '' });
      setEditingId(null);
      setIsCreating(false);
      loadTemplates();
    } catch (error: any) {
      console.error('Erro ao salvar template:', error);
      toast.error('Erro ao salvar template');
    }
  };

  const handleEdit = (template: Template) => {
    setFormData({
      type: template.type,
      title: template.title,
      content: template.content
    });
    setEditingId(template.id);
    setIsCreating(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;

    try {
      const { error } = await supabaseTenant
        .from('whatsapp_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Template excluído com sucesso');
      loadTemplates();
    } catch (error: any) {
      console.error('Erro ao excluir template:', error);
      toast.error('Erro ao excluir template');
    }
  };

  const handleCancel = () => {
    setFormData({ type: '', title: '', content: '' });
    setEditingId(null);
    setIsCreating(false);
  };

  const getTemplateTypeLabel = (type: string) => {
    return TEMPLATE_TYPES.find(t => t.value === type)?.label || type;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-6">
          <p className="text-muted-foreground">Carregando templates...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Templates de WhatsApp</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os templates de mensagens do WhatsApp
          </p>
        </div>
        {!isCreating && (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Template
          </Button>
        )}
      </div>

      {isCreating && (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                {editingId ? 'Editar Template' : 'Novo Template'}
              </h2>
              <Button variant="ghost" size="icon" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Tipo de Template</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ex: Mensagem de item adicionado"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Conteúdo da Mensagem</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Digite o conteúdo do template..."
                className="min-h-[200px]"
              />
              <p className="text-sm text-muted-foreground">
                Você pode usar variáveis como: {`{{produto}}, {{quantidade}}, {{valor}}, {{order_id}}, {{total}}`}
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" />
                Salvar Template
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4">
        {templates.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              Nenhum template cadastrado. Clique em "Novo Template" para começar.
            </p>
          </Card>
        ) : (
          templates.map((template) => (
            <Card key={template.id} className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded">
                      {getTemplateTypeLabel(template.type)}
                    </span>
                    <h3 className="text-lg font-semibold">{template.title}</h3>
                  </div>
                  <p className="text-muted-foreground whitespace-pre-wrap mt-2">
                    {template.content}
                  </p>
                  <p className="text-xs text-muted-foreground mt-3">
                    Atualizado em: {new Date(template.updated_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(template)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(template.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
