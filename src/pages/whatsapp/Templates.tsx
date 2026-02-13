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
import { formatBrasiliaDateTime, getBrasiliaDateTimeISO } from '@/lib/date-utils';

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
  { 
    value: 'ITEM_ADDED', 
    label: 'Item Adicionado',
    description: 'Enviado quando um item é adicionado ao pedido',
    variables: ['{{produto}}', '{{codigo}}', '{{quantidade}}', '{{valor}}', '{{customer_name}}']
  },
  { 
    value: 'PAID_ORDER', 
    label: 'Pedido Pago',
    description: 'Enviado quando um pedido é marcado como pago',
    variables: ['{{order_id}}', '{{total}}', '{{customer_name}}']
  },
  { 
    value: 'PRODUCT_CANCELED', 
    label: 'Item Cancelado',
    description: 'Enviado quando um item é removido do pedido',
    variables: ['{{produto}}', '{{codigo}}', '{{quantidade}}', '{{customer_name}}']
  },
  { 
    value: 'MSG_MASSA', 
    label: 'Cobrança em Massa',
    description: 'Template para envio em massa de cobranças',
    variables: ['{{customer_name}}', '{{total}}', '{{order_id}}']
  },
  { 
    value: 'SENDFLOW', 
    label: 'SendFlow MSG',
    description: 'Mensagem de divulgação de produtos',
    variables: ['{{codigo}}', '{{nome}}', '{{cor}}', '{{tamanho}}', '{{valor}}']
  },
  { 
    value: 'TRACKING', 
    label: 'Código de Rastreio',
    description: 'Enviado quando o código de rastreio é adicionado',
    variables: ['{{customer_name}}', '{{order_id}}', '{{tracking_code}}', '{{shipped_at}}']
  },
  { 
    value: 'BLOCKED_CUSTOMER', 
    label: 'Cliente Bloqueado',
    description: 'Enviado automaticamente quando um cliente bloqueado tenta fazer pedido',
    variables: ['{{customer_name}}']
  }
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
    initializeTemplates();
  }, []);

  // Templates padrão que serão criados automaticamente
  const DEFAULT_TEMPLATES = [
    {
      type: 'PAID_ORDER',
      title: 'Confirmação de Pagamento',
      content: `🎉 *Pagamento Confirmado - Pedido #{{order_id}}*

✅ Recebemos seu pagamento!
💰 Valor: *R$ {{total}}*

Seu pedido está sendo preparado para envio.

Obrigado pela preferência! 💚`
    },
    {
      type: 'TRACKING',
      title: 'Código de Rastreio',
      content: `📦 *Pedido Enviado!*

Olá{{customer_name}}! 🎉

Seu pedido *#{{order_id}}* foi enviado!

🚚 *Código de Rastreio:* {{tracking_code}}
📅 *Data de Envio:* {{shipped_at}}

🔗 *Rastreie seu pedido:*
https://www.melhorrastreio.com.br/rastreio/{{tracking_code}}

⏳ _O rastreio pode demorar até 2 dias úteis para aparecer no sistema._

Obrigado pela preferência! 💚`
    },
    {
      type: 'BLOCKED_CUSTOMER',
      title: 'Mensagem de Cliente Bloqueado',
      content: `Olá! Identificamos uma restrição em seu cadastro que impede a realização de novos pedidos no momento. ⛔

Para entender melhor o motivo ou solicitar uma reavaliação, por favor, entre em contato diretamente com o suporte da loja.`
    }
  ];

  const initializeTemplates = async () => {
    try {
      setLoading(true);
      
      // Buscar templates existentes
      const { data: existingTemplates, error } = await supabaseTenant
        .from('whatsapp_templates')
        .select('*')
        .order('type', { ascending: true });

      if (error) throw error;

      const templates = existingTemplates || [];
      const existingTypes = templates.map(t => t.type);

      // Criar templates padrão que não existem
      const templatesToCreate = DEFAULT_TEMPLATES.filter(
        dt => !existingTypes.includes(dt.type)
      );

      if (templatesToCreate.length > 0) {
        const { error: insertError } = await supabaseTenant
          .from('whatsapp_templates')
          .insert(templatesToCreate);

        if (insertError) {
          console.error('Erro ao criar templates padrão:', insertError);
        } else {
          console.log(`Criados ${templatesToCreate.length} templates padrão`);
          // Recarregar para incluir os novos
          const { data: updatedTemplates } = await supabaseTenant
            .from('whatsapp_templates')
            .select('*')
            .order('type', { ascending: true });
          
          setTemplates(updatedTemplates || []);
          return;
        }
      }

      setTemplates(templates);
    } catch (error: any) {
      console.error('Erro ao carregar templates:', error);
      toast.error(error?.message || 'Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  };

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
      toast.error(error?.message || 'Erro ao carregar templates');
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
            updated_at: getBrasiliaDateTimeISO()
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
      toast.error(error?.message || 'Erro ao salvar template');
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
      toast.error(error?.message || 'Erro ao excluir template');
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

  const getSelectedTemplateInfo = () => {
    return TEMPLATE_TYPES.find(t => t.value === formData.type);
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
              {getSelectedTemplateInfo() ? (
                <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
                  <p className="text-sm text-muted-foreground mb-2">
                    <strong>Descrição:</strong> {getSelectedTemplateInfo()?.description}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Variáveis disponíveis:</strong>{' '}
                    <code className="text-xs bg-primary/10 text-primary px-1 py-0.5 rounded">
                      {getSelectedTemplateInfo()?.variables.join(', ')}
                    </code>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Selecione um tipo de template para ver as variáveis disponíveis
                </p>
              )}
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
                    Atualizado em: {formatBrasiliaDateTime(template.updated_at)}
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
