import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabaseTenant } from "@/lib/supabase-tenant";
import { deleteWhatsAppTemplate, listLatestWhatsAppTemplates, saveWhatsAppTemplate, type WhatsAppTemplateType } from "@/lib/whatsapp-templates";
import { Plus, Trash2 } from "lucide-react";

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
    variables: ['{nome}', '{produto}', '{codigo}', '{quantidade}', '{valor}', '{itens_pedido}', '{total_pedido}', '{numero_pedido}', '{link_checkout}'],
    color: {
      badgeBg: 'bg-[#dbeafe]',
      badgeText: 'text-[#2563eb]',
      border: 'border-l-[#3b82f6]',
      ring: 'ring-[#3b82f6]/30',
    },
  },
  {
    value: 'PAID_ORDER',
    label: 'Pedido Pago',
    description: 'Enviado quando um pedido é marcado como pago',
    variables: ['{nome}', '{order_id}', '{total}'],
    color: {
      badgeBg: 'bg-[#dcfce7]',
      badgeText: 'text-[#16a34a]',
      border: 'border-l-[#22c55e]',
      ring: 'ring-[#22c55e]/30',
    },
  },
  {
    value: 'PRODUCT_CANCELED',
    label: 'Item Cancelado',
    description: 'Enviado quando um item é removido do pedido',
    variables: ['{nome}', '{produto}', '{codigo}', '{quantidade}'],
    color: {
      badgeBg: 'bg-[#fee2e2]',
      badgeText: 'text-[#dc2626]',
      border: 'border-l-[#ef4444]',
      ring: 'ring-[#ef4444]/30',
    },
  },
  {
    value: 'MSG_MASSA',
    label: 'Mensagem em massa',
    description: 'Template para envio em massa de cobranças',
    variables: ['{nome}', '{total}', '{order_id}'],
    color: {
      badgeBg: 'bg-[#fef9c3]',
      badgeText: 'text-[#ca8a04]',
      border: 'border-l-[#eab308]',
      ring: 'ring-[#eab308]/30',
    },
  },
  {
    value: 'SENDFLOW',
    label: 'Fluxo de envio',
    description: 'Mensagem de divulgação de produtos',
    variables: ['{codigo}', '{nome}', '{cor}', '{tamanho}', '{valor}'],
    color: {
      badgeBg: 'bg-[#f3e8ff]',
      badgeText: 'text-[#9333ea]',
      border: 'border-l-[#a855f7]',
      ring: 'ring-[#a855f7]/30',
    },
  },
  {
    value: 'TRACKING',
    label: 'Rastreamento do pedido',
    description: 'Enviado quando o código de rastreio é adicionado',
    variables: ['{nome}', '{order_id}', '{tracking_code}', '{shipped_at}'],
    color: {
      badgeBg: 'bg-[#cffafe]',
      badgeText: 'text-[#0891b2]',
      border: 'border-l-[#06b6d4]',
      ring: 'ring-[#06b6d4]/30',
    },
  },
  {
    value: 'BLOCKED_CUSTOMER',
    label: 'Cliente Bloqueado',
    description: 'Enviado automaticamente quando um cliente bloqueado tenta fazer pedido',
    variables: ['{nome}'],
    color: {
      badgeBg: 'bg-[#f1f5f9]',
      badgeText: 'text-[#475569]',
      border: 'border-l-[#64748b]',
      ring: 'ring-[#64748b]/30',
    },
  },
  {
    value: 'DM_INSTAGRAM_CADASTRO',
    label: 'DM Instagram Cadastro',
    description: 'DM enviada no Instagram quando o cliente não tem cadastro ou telefone.',
    variables: ['{produto}', '{quantidade}', '{valor_unitario}', '{total}', '{link_cadastro}'],
    color: {
      badgeBg: 'bg-[#fce7f3]',
      badgeText: 'text-[#db2777]',
      border: 'border-l-[#ec4899]',
      ring: 'ring-[#ec4899]/30',
    },
  },
];

const getTypeMeta = (type: string) =>
  TEMPLATE_TYPES.find((t) => t.value === type) ?? {
    value: type,
    label: type,
    description: '',
    variables: [] as string[],
    color: {
      badgeBg: 'bg-muted',
      badgeText: 'text-muted-foreground',
      border: 'border-l-border',
      ring: 'ring-border',
    },
  };

export default function WhatsappTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [formData, setFormData] = useState({
    type: '',
    title: '',
    content: '',
    isActive: true,
  });

  const [sendCadastroDm, setSendCadastroDm] = useState(false);
  const [loadingFlag, setLoadingFlag] = useState(false);

  const [itemAddedBtnEnabled, setItemAddedBtnEnabled] = useState(true);
  const [itemAddedBtnLabel, setItemAddedBtnLabel] = useState('Pagar Agora');
  const [itemAddedBtnUrl, setItemAddedBtnUrl] = useState('');
  const [savingItemBtn, setSavingItemBtn] = useState(false);
  const [whatsappIntegrationId, setWhatsappIntegrationId] = useState<number | null>(null);

  useEffect(() => {
    initializeTemplates();
    loadCadastroDmFlag();
    loadItemAddedButton();
  }, []);

  const loadItemAddedButton = async () => {
    try {
      const { data } = await supabaseTenant
        .from('integration_whatsapp')
        .select('id, item_added_button_enabled, item_added_button_label, item_added_button_url')
        .maybeSingle();
      if (data) {
        setWhatsappIntegrationId((data as any).id);
        setItemAddedBtnEnabled((data as any).item_added_button_enabled ?? true);
        setItemAddedBtnLabel((data as any).item_added_button_label ?? 'Pagar Agora');
        setItemAddedBtnUrl((data as any).item_added_button_url ?? '');
      }
    } catch (e) {
      console.error('Erro ao carregar botão ITEM_ADDED:', e);
    }
  };

  const saveItemAddedButton = async () => {
    if (!whatsappIntegrationId) {
      toast.error('Configure a integração Z-API primeiro');
      return;
    }
    setSavingItemBtn(true);
    try {
      const { error } = await supabaseTenant
        .from('integration_whatsapp')
        .update({
          item_added_button_enabled: itemAddedBtnEnabled,
          item_added_button_label: (itemAddedBtnLabel || '').slice(0, 20),
          item_added_button_url: itemAddedBtnUrl,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      toast.success('Botão "Pagar Agora" salvo');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar botão');
    } finally {
      setSavingItemBtn(false);
    }
  };

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

  const DEFAULT_TEMPLATES = [
    {
      type: 'PAID_ORDER',
      title: 'Confirmação de Pagamento',
      content: `🎉 *Pagamento Confirmado - Pedido #{{order_id}}*\n\n✅ Recebemos seu pagamento!\n💰 Valor: *R$ {{total}}*\n\nSeu pedido está sendo preparado para envio.\n\nObrigado pela preferência! 💚`,
    },
    {
      type: 'TRACKING',
      title: 'Código de Rastreio',
      content: `📦 *Pedido Enviado!*\n\nOlá{{customer_name}}! 🎉\n\nSeu pedido *#{{order_id}}* foi enviado!\n\n🚚 *Código de Rastreio:* {{tracking_code}}\n📅 *Data de Envio:* {{shipped_at}}\n\n🔗 *Rastreie seu pedido:*\nhttps://www.melhorrastreio.com.br/rastreio/{{tracking_code}}\n\n⏳ _O rastreio pode demorar até 2 dias úteis para aparecer no sistema._\n\nObrigado pela preferência! 💚`,
    },
    {
      type: 'BLOCKED_CUSTOMER',
      title: 'Mensagem de Cliente Bloqueado',
      content: `Olá! Identificamos uma restrição em seu cadastro que impede a realização de novos pedidos no momento. ⛔\n\nPara entender melhor o motivo ou solicitar uma reavaliação, por favor, entre em contato diretamente com o suporte da loja.`,
    },
    {
      type: 'DM_INSTAGRAM_CADASTRO',
      title: 'DM Instagram - Solicitação de Cadastro',
      content: `✅ *{{produto}}* ({{quantidade}}x) foi adicionado ao seu pedido!\n\n💰 Valor: {{valor_unitario}}\n🛒 Total: {{total}}\n\n📋 Para confirmar seu produto, faça seu cadastro:\n{{link_cadastro}}\n\nApós o cadastro, você receberá o link para finalizar o pedido. ✨`,
    },
  ];

  const initializeTemplates = async () => {
    try {
      setLoading(true);
      const tpls = await listLatestWhatsAppTemplates();
      const existingTypes = tpls.map((t) => t.type);
      const toCreate = DEFAULT_TEMPLATES.filter((dt) => !existingTypes.includes(dt.type));

      if (toCreate.length > 0) {
        await Promise.all(
          toCreate.map((template) =>
            saveWhatsAppTemplate({
              content: template.content,
              title: template.title,
              type: template.type as WhatsAppTemplateType,
            })
          )
        );
        const refreshed = await listLatestWhatsAppTemplates();
        setTemplates(refreshed);
        if (refreshed[0]) selectTemplate(refreshed[0]);
        return;
      }

      setTemplates(tpls);
      if (tpls[0]) selectTemplate(tpls[0]);
    } catch (error: any) {
      console.error('Erro ao carregar templates:', error);
      toast.error(error?.message || 'Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await listLatestWhatsAppTemplates();
      setTemplates(data || []);
      return data || [];
    } catch (error: any) {
      console.error('Erro ao carregar templates:', error);
      toast.error(error?.message || 'Erro ao carregar templates');
      return [];
    }
  };

  const selectTemplate = (template: Template) => {
    setFormData({
      type: template.type,
      title: template.title || '',
      content: template.content,
      isActive: true,
    });
    setEditingId(template.id);
    setIsCreating(false);
  };

  const handleNew = () => {
    setFormData({ type: '', title: '', content: '', isActive: true });
    setEditingId(null);
    setIsCreating(true);
  };

  const handleSave = async () => {
    if (!formData.type || !formData.title || !formData.content) {
      toast.error('Preencha todos os campos');
      return;
    }
    try {
      const original = editingId ? templates.find((t) => t.id === editingId) : null;
      await saveWhatsAppTemplate({
        content: formData.content,
        editingId,
        originalType: original?.type,
        title: formData.title,
        type: formData.type as WhatsAppTemplateType,
      });
      toast.success(editingId ? 'Template atualizado' : 'Template criado');
      const refreshed = await loadTemplates();
      const next = refreshed.find((t) => t.type === formData.type);
      if (next) selectTemplate(next);
      else setIsCreating(false);
    } catch (error: any) {
      console.error('Erro ao salvar template:', error);
      toast.error(error?.message || 'Erro ao salvar template');
    }
  };

  const handleDelete = async (template: Template) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;
    try {
      await deleteWhatsAppTemplate(template.type);
      toast.success('Template excluído');
      const refreshed = await loadTemplates();
      if (editingId === template.id) {
        if (refreshed[0]) selectTemplate(refreshed[0]);
        else {
          setEditingId(null);
          setFormData({ type: '', title: '', content: '', isActive: true });
        }
      }
    } catch (error: any) {
      console.error('Erro ao excluir template:', error);
      toast.error(error?.message || 'Erro ao excluir template');
    }
  };

  const selectedMeta = getTypeMeta(formData.type);
  const editing = !!editingId || isCreating;

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-muted-foreground">Carregando templates...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp — Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mensagens automáticas por tipo de evento
          </p>
        </div>
        <Button
          onClick={handleNew}
          className="bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-xl h-11 px-5"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Template
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* List */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Templates Cadastrados
          </p>

          {templates.length === 0 ? (
            <div className="p-8 text-center bg-[#f9fafb] rounded-xl border border-[#e5e7eb]">
              <p className="text-muted-foreground text-sm">
                Nenhum template cadastrado.
              </p>
            </div>
          ) : (
            templates.map((template) => {
              const meta = getTypeMeta(template.type);
              const isSelected = editingId === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => selectTemplate(template)}
                  className={`w-full text-left bg-white rounded-xl border border-[#e5e7eb] border-l-4 ${meta.color.border} p-4 transition-all hover:shadow-sm ${
                    isSelected ? `ring-2 ${meta.color.ring} shadow-sm` : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.color.badgeBg} ${meta.color.badgeText}`}
                        >
                          {template.type}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {template.title || meta.label}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {template.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#16a34a]">
                        Ativo
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(template);
                        }}
                        className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Editor */}
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-6 h-fit sticky top-6">
          {!editing ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">
                Selecione um template para editar ou crie um novo.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">
                {editingId ? `Editar Template — ${formData.type || ''}` : 'Novo Template'}
              </h2>

              <div className="space-y-2">
                <Label className="text-sm">Tipo do Template</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger className="h-11 rounded-xl border-[#e5e7eb]">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.value} — {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Título / Identificador</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Item adicionado ao carrinho"
                  className="h-11 rounded-xl border-[#e5e7eb]"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Conteúdo da Mensagem</Label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Digite o conteúdo do template..."
                  className="min-h-[200px] rounded-xl border-[#e5e7eb] resize-none"
                />
                {selectedMeta.variables.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Variáveis: {selectedMeta.variables.join(', ')}
                  </p>
                )}
              </div>

              {formData.type === 'DM_INSTAGRAM_CADASTRO' ? (
                <div className="flex items-center gap-3">
                  <Switch
                    checked={sendCadastroDm}
                    onCheckedChange={toggleCadastroDm}
                    disabled={loadingFlag}
                  />
                  <span className="text-sm text-foreground">DM Instagram Cadastro ativa</span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(v) => setFormData({ ...formData, isActive: v })}
                  />
                  <span className="text-sm text-foreground">Template ativo</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleSave}
                  className="flex-1 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-xl h-11"
                >
                  Salvar Template
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
