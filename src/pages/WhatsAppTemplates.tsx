import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface WhatsAppTemplate {
  id: number;
  type: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

const WhatsAppTemplates = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    type: '',
    title: '',
    content: ''
  });

  const templateTypes = [
    { value: 'BROADCAST', label: 'Broadcast' },
    { value: 'ITEM_ADDED', label: 'Item Adicionado' },
    { value: 'PRODUCT_CANCELED', label: 'Produto Cancelado' },
    { value: 'PAID_ORDER', label: 'Pedido Pago' }
  ];

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar templates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.type || !formData.content) {
      toast({
        title: "Erro",
        description: "Tipo e conteúdo são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    try {
      const templateData = {
        type: formData.type as 'BROADCAST' | 'ITEM_ADDED' | 'PRODUCT_CANCELED' | 'PAID_ORDER',
        title: formData.title || null,
        content: formData.content,
        tenant_id: profile?.tenant_id || ''
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from('whatsapp_templates')
          .update(templateData)
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast({
          title: "Sucesso",
          description: "Template atualizado com sucesso",
        });
      } else {
        const { error } = await supabase
          .from('whatsapp_templates')
          .insert([templateData]);

        if (error) throw error;
        toast({
          title: "Sucesso",
          description: "Template criado com sucesso",
        });
      }

      resetForm();
      setIsDialogOpen(false);
      fetchTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: "Erro",
        description: "Erro ao salvar template",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (templateId: number) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;

    try {
      const { error } = await supabase
        .from('whatsapp_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;
      
      toast({
        title: "Sucesso",
        description: "Template excluído com sucesso",
      });
      fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({
        title: "Erro",
        description: "Erro ao excluir template",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({ type: '', title: '', content: '' });
    setEditingTemplate(null);
  };

  const openEditDialog = (template: WhatsAppTemplate) => {
    setEditingTemplate(template);
    setFormData({
      type: template.type,
      title: template.title || '',
      content: template.content
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const getTypeLabel = (type: string) => {
    const templateType = templateTypes.find(t => t.value === type);
    return templateType?.label || type;
  };

  const getTypeBadgeVariant = (type: string) => {
    const variants: Record<string, string> = {
      'welcome': 'default',
      'order_created': 'secondary',
      'item_added': 'outline',
      'item_cancelled': 'destructive',
      'payment_confirmed': 'default',
      'shipping_info': 'secondary',
      'promotional': 'outline',
      'custom': 'outline'
    };
    return variants[type] || 'outline';
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Carregando templates...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Templates WhatsApp</h1>
          <p className="text-muted-foreground">
            Gerencie seus templates de mensagens para WhatsApp
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? 'Editar Template' : 'Criar Novo Template'}
              </DialogTitle>
              <DialogDescription>
                {editingTemplate 
                  ? 'Edite as informações do template' 
                  : 'Crie um novo template de mensagem para WhatsApp'
                }
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo *</Label>
                <Select 
                  value={formData.type} 
                  onValueChange={(value) => setFormData({...formData, type: value})}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {templateTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Título (Opcional)</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="Título descritivo para o template"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Conteúdo da Mensagem *</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({...formData, content: e.target.value})}
                  placeholder="Digite o conteúdo da mensagem..."
                  className="min-h-[120px]"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Você pode usar variáveis como {'{nome}'}, {'{produto}'}, {'{valor}'}, etc.
                </p>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit">
                  {editingTemplate ? 'Atualizar' : 'Criar'} Template
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {templates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">Nenhum template encontrado</p>
              <Button onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          templates.map((template) => (
            <Card key={template.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">
                        {template.title || `Template ${getTypeLabel(template.type)}`}
                      </CardTitle>
                      <Badge variant={getTypeBadgeVariant(template.type) as any}>
                        {getTypeLabel(template.type)}
                      </Badge>
                    </div>
                    <CardDescription>
                      Criado em {new Date(template.created_at).toLocaleDateString('pt-BR')}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(template)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(template.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm font-mono">
                    {template.content}
                  </pre>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default WhatsAppTemplates;