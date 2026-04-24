import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabaseTenant } from "@/lib/supabase-tenant";
import { deleteWhatsAppTemplate, listLatestWhatsAppTemplates, saveWhatsAppTemplate, type WhatsAppTemplateType } from "@/lib/whatsapp-templates";
import { Plus, Edit2, Trash2, Save, X } from "lucide-react";
import { formatBrasiliaDateTime } from '@/lib/date-utils';

interface Template {
  id: number;
  tenant_id: string;
  type: WhatsAppTemplateType;
  title: string | null;
  content: string;
  created_at: string | null;
  updated_at: string | null;
}

const TEMPLATE_TYPES = [
  { 
    value: 'ITEM_ADDED', 
    label: 'Item Adicionado',
    description: 'Enviado quando um item é adicionado ao pedido',
    variables: ['{{produto}}', '{{codigo}}', '{{quantidade}}', '{{valor}}', '{{valor_original}}', '{{valor_promo}}', '{{customer_name}}']
  },
  { 
    value: 'PAID_ORDER', 
    label: 'Pedido Pago',
    description: 'Enviado quando um pedido é marcado como pago',
    variables: ['{{order_id}}', '{{total}}', '{{valor_original}}', '{{valor_promo}}', '{{customer_name}}']
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
  },
  { 
    value: 'DM_INSTAGRAM_CADASTRO', 
    label: 'DM Instagram Cadastro',
    description: 'DM enviada no Instagram quando o cliente não tem cadastro ou telefone. Ative/desative a flag na integração Instagram.',
    variables: ['{{produto}}', '{{quantidade}}', '{{valor_unitario}}', '{{total}}', '{{link_cadastro}}']
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

  const [sendCadastroDm, setSendCadastroDm] = useState(false);
  const [loadingFlag, setLoadingFlag] = useState(false);

  useEffect(() => {
    initializeTemplates();
    loadCadastroDmFlag();
  }, []);

  const loadCadastroDmFlag = async () => {
    try {
      const { data } = await supabaseTenant
        .from('integration_instagram')
        .select('send_cadastro_dm')
        .maybeSingle();
      if (data) setSendCadastroDm(!!data.send_cadastro_dm);
    } catch (e) {
      console.error('Erro ao carregar flag DM cadastro:', e);
    }
  };

  const toggleCadastroDm = async (value: boolean) => {
    setLoadingFlag(true);
    try {
      const { error } = await supabaseTenant
        .from('integration_instagram')
        .update({ send_cadastro_dm: value });
      if (error) throw error;
      setSendCadastroDm(value);
      toast.success(value ? 'DM Instagram Cadastro ativada' : 'DM Instagram Cadastro desativada');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao atualizar flag');
    } finally {
      setLoadingFlag(false);
    }
  };


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
    },
    {
      type: 'DM_INSTAGRAM_CADASTRO',
      title: 'DM Instagram - Solicitação de Cadastro',
      content: `✅ *{{produto}}* ({{quantidade}}x) foi adicionado ao seu pedido!\n\n💰 Valor: {{valor_unitario}}\n🛒 Total: {{total}}\n\n📋 Para confirmar seu produto, faça seu cadastro:\n{{link_cadastro}}\n\nApós o cadastro, você receberá o link para finalizar o pedido. ✨`
    }
  ];

  const initializeTemplates = async () => {
    try {
      setLoading(true);
      
      const templates = await listLatestWhatsAppTemplates();
      const existingTypes = templates.map(t => t.type);

      // Criar templates padrão que não existem
      const templatesToCreate = DEFAULT_TEMPLATES.filter(
        dt => !existingTypes.includes(dt.type)
      );

      if (templatesToCreate.length > 0) {
        await Promise.all(
          templatesToCreate.map((template) =>
            saveWhatsAppTemplate({
              content: template.content,
              title: template.title,
              type: template.type as WhatsAppTemplateType,
            })
          )
        );

        console.log(`Criados ${templatesToCreate.length} templates padrão`);
        setTemplates(await listLatestWhatsAppTemplates());
        return;
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
      const data = await listLatestWhatsAppTemplates();
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
      const originalTemplate = editingId
        ? templates.find((template) => template.id === editingId)
        : null;

      await saveWhatsAppTemplate({
        content: formData.content,
        editingId,
        originalType: originalTemplate?.type,
        title: formData.title,
        type: formData.type as WhatsAppTemplateType,
      });

      if (editingId) {
        toast.success('Template atualizado com sucesso');
      } else {
        toast.success('Template criado com sucesso');
      }

      setFormData({ type: '', title: '', content: '' });
      setEditingId(null);
      setIsCreating(false);
      await loadTemplates();
    } catch (error: any) {
      console.error('Erro ao salvar template:', error);
      toast.error(error?.message || 'Erro ao salvar template');
    }
  };

  const handleEdit = (template: Template) => {
    setFormData({
      type: template.type,
      title: template.title || '',
      content: template.content
    });
    setEditingId(template.id);
    setIsCreating(true);
    // Scroll to top so user can see the edit form
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
  };

  const handleDelete = async (template: Template) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;

    try {
      await deleteWhatsAppTemplate(template.type);
      toast.success('Template excluído com sucesso');
      await loadTemplates();
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
                    <h3 className="text-lg font-semibold">{template.title || getTemplateTypeLabel(template.type)}</h3>
                    {template.type === 'DM_INSTAGRAM_CADASTRO' && (
                      <div className="flex items-center gap-2 ml-auto">
                        <span className="text-xs text-muted-foreground">
                          {sendCadastroDm ? 'Ativo' : 'Inativo'}
                        </span>
                        <Switch
                          checked={sendCadastroDm}
                          onCheckedChange={toggleCadastroDm}
                          disabled={loadingFlag}
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-muted-foreground whitespace-pre-wrap mt-2">
                    {template.content}
                  </p>
                  <p className="text-xs text-muted-foreground mt-3">
                    Atualizado em: {formatBrasiliaDateTime(template.updated_at || template.created_at || new Date().toISOString())}
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
                      onClick={() => handleDelete(template)}
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
