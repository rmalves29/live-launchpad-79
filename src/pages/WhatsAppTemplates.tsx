import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, Save, Edit, Plus, Users, Package, X, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface WhatsAppTemplate {
  id: number;
  type: 'ITEM_ADDED' | 'PRODUCT_CANCELED' | 'BROADCAST';
  title: string;
  content: string;
}

interface BroadcastFilter {
  type: 'ALL' | 'PAID' | 'UNPAID';
}

const templateTypes = [
  { value: 'ITEM_ADDED', label: 'Item Adicionado ao Carrinho', icon: Plus, color: 'bg-green-500' },
  { value: 'PRODUCT_CANCELED', label: 'Produto Cancelado', icon: X, color: 'bg-red-500' },
  { value: 'BROADCAST', label: 'Mensagem em Massa', icon: Send, color: 'bg-blue-500' }
];

const WhatsAppTemplates = () => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [broadcastFilter, setBroadcastFilter] = useState<BroadcastFilter>({ type: 'ALL' });
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .order('type');

      if (error) throw error;

      setTemplates((data || []) as WhatsAppTemplate[]);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar templates',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!editingTemplate) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('whatsapp_templates')
        .upsert(editingTemplate, { onConflict: 'type' });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Template salvo com sucesso'
      });
      
      setIsEditing(false);
      setEditingTemplate(null);
      loadTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao salvar template',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (template?: WhatsAppTemplate) => {
    if (template) {
      setEditingTemplate(template);
    } else {
      setEditingTemplate({
        id: 0,
        type: 'ITEM_ADDED',
        title: '',
        content: ''
      });
    }
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditingTemplate(null);
  };

  const sendBroadcast = async () => {
    const broadcastTemplate = templates.find(t => t.type === 'BROADCAST');
    if (!broadcastTemplate || !broadcastTemplate.content.trim()) {
      toast({
        title: 'Erro',
        description: 'Configure o template de mensagem em massa primeiro',
        variant: 'destructive'
      });
      return;
    }

    setSendingBroadcast(true);
    try {
      // Get customers based on filter
      let query = supabase.from('orders').select('customer_phone').neq('customer_phone', '');
      
      if (broadcastFilter.type === 'PAID') {
        query = query.eq('is_paid', true);
      } else if (broadcastFilter.type === 'UNPAID') {
        query = query.eq('is_paid', false);
      }

      const { data: orders, error } = await query;
      
      if (error) throw error;

      const uniquePhones = [...new Set(orders?.map(o => o.customer_phone) || [])];
      
      if (uniquePhones.length === 0) {
        toast({
          title: 'Aviso',
          description: 'Nenhum cliente encontrado com os filtros selecionados',
          variant: 'default'
        });
        return;
      }

      if (!confirm(`Tem certeza que deseja enviar mensagem em massa para ${uniquePhones.length} cliente(s)?`)) {
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      // Usar envio em massa otimizado para todos os clientes de uma vez
      try {
        const { sendBulkMessages } = await import('@/lib/whatsapp');
        const sent = await sendBulkMessages(uniquePhones, broadcastTemplate.content);

        if (sent) {
          successCount = uniquePhones.length;
          
          // Registrar todas as mensagens no banco para histórico
          for (const phone of uniquePhones) {
            try {
              await supabase.from('whatsapp_messages').insert({
                phone,
                message: broadcastTemplate.content,
                type: 'broadcast',
                sent_at: new Date().toISOString(),
              });
            } catch (dbError) {
              console.warn(`Erro ao registrar mensagem no banco para ${phone}:`, dbError);
            }
          }

          // Adicionar tag "app" para todos os clientes que receberam a mensagem em massa
          try {
            await supabase.functions.invoke('whatsapp-add-label-bulk', {
              body: { phones: uniquePhones, label: 'app' }
            });
          } catch (labelError) {
            console.warn('Erro ao adicionar tags "app":', labelError);
          }
        } else {
          errorCount = uniquePhones.length;
        }
      } catch (error) {
        console.error('Erro no envio em massa:', error);
        errorCount = uniquePhones.length;
      }

      toast({
        title: 'Mensagem em Massa Concluída',
        description: `${successCount} mensagem(s) enviada(s). ${errorCount > 0 ? `${errorCount} erro(s).` : ''} Etiqueta "APP" adicionada aos clientes.`,
        variant: successCount > 0 ? 'default' : 'destructive'
      });

    } catch (error) {
      console.error('Error sending broadcast:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao enviar mensagem em massa',
        variant: 'destructive'
      });
    } finally {
      setSendingBroadcast(false);
    }
  };

  const getTemplateIcon = (type: string) => {
    const templateType = templateTypes.find(t => t.value === type);
    return templateType?.icon || MessageSquare;
  };

  const getTemplateColor = (type: string) => {
    const templateType = templateTypes.find(t => t.value === type);
    return templateType?.color || 'bg-gray-500';
  };

  const getTemplateLabel = (type: string) => {
    const templateType = templateTypes.find(t => t.value === type);
    return templateType?.label || type;
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto py-6 max-w-4xl">
        <div className="text-center">Carregando templates...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center">
          <MessageSquare className="h-8 w-8 mr-3" />
          Templates WhatsApp
        </h1>
        <Button onClick={() => startEditing()}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Template
        </Button>
      </div>

      {/* Broadcast Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Send className="h-5 w-5 mr-2" />
            Envio em Massa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>Filtro de Clientes</Label>
              <Select value={broadcastFilter.type} onValueChange={(value: 'ALL' | 'PAID' | 'UNPAID') => setBroadcastFilter({ type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os Clientes</SelectItem>
                  <SelectItem value="PAID">Apenas Pagos</SelectItem>
                  <SelectItem value="UNPAID">Apenas Não Pagos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={sendBroadcast} disabled={sendingBroadcast} className="w-full">
              <Users className="h-4 w-4 mr-2" />
              {sendingBroadcast ? 'Enviando...' : 'Enviar Mensagem em Massa'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Templates List */}
      <div className="grid gap-4">
        {templateTypes.map((templateType) => {
          const template = templates.find(t => t.type === templateType.value);
          const Icon = templateType.icon;
          
          return (
            <Card key={templateType.value}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-lg ${templateType.color} text-white mr-3`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    {templateType.label}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={template ? "default" : "secondary"}>
                      {template ? "Configurado" : "Não Configurado"}
                    </Badge>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => startEditing(template || {
                        id: 0,
                        type: templateType.value as any,
                        title: '',
                        content: ''
                      })}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              {template && (
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <strong>Título:</strong> {template.title}
                    </div>
                    <div>
                      <strong>Conteúdo:</strong>
                      <div className="bg-muted p-3 rounded-lg mt-1 text-sm font-mono">
                        {template.content}
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Edit Modal */}
      {isEditing && editingTemplate && (
        <Card className="fixed inset-0 z-50 m-8 overflow-auto">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <MessageSquare className="h-5 w-5 mr-2" />
                {editingTemplate.id ? 'Editar Template' : 'Novo Template'}
              </div>
              <Button variant="ghost" size="sm" onClick={cancelEditing}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="template-type">Tipo do Template</Label>
                <Select 
                  value={editingTemplate.type} 
                  onValueChange={(value: any) => setEditingTemplate({...editingTemplate, type: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="template-title">Título (Opcional)</Label>
                <Input
                  id="template-title"
                  value={editingTemplate.title}
                  onChange={(e) => setEditingTemplate({...editingTemplate, title: e.target.value})}
                  placeholder="Título do template"
                />
              </div>

              <div>
                <Label htmlFor="template-content">Conteúdo da Mensagem</Label>
                <Textarea
                  id="template-content"
                  value={editingTemplate.content}
                  onChange={(e) => setEditingTemplate({...editingTemplate, content: e.target.value})}
                  placeholder="Digite a mensagem que será enviada..."
                  rows={6}
                />
              </div>

                <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-medium mb-2">Variáveis Disponíveis:</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><code>{"{{nome_cliente}}"} - Nome do cliente</code></p>
                  <p><code>{"{{telefone}}"} - Telefone do cliente</code></p>
                  <p><code>{"{{produto}}"} - Nome do produto</code></p>
                  <p><code>{"{{quantidade}}"} - Quantidade</code></p>
                  <p><code>{"{{preco}}"} - Preço unitário</code></p>
                  <p><code>{"{{total}}"} - Valor total</code></p>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={cancelEditing}>
                  Cancelar
                </Button>
                <Button onClick={saveTemplate} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Como Usar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong>Item Adicionado:</strong> Enviado automaticamente quando um cliente adiciona um item ao carrinho</p>
            <p><strong>Produto Cancelado:</strong> Enviado quando um produto é cancelado do pedido</p>
            <p><strong>Mensagem em Massa:</strong> Permite enviar mensagens para todos os clientes ou filtrar por status de pagamento</p>
            <Separator className="my-3" />
            <p><strong>Variáveis:</strong> Use as variáveis disponíveis para personalizar as mensagens automaticamente</p>
            <p className="text-xs">Exemplo: "Olá {"{{nome_cliente}}"}, seu pedido de {"{{produto}}"} foi confirmado!"</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppTemplates;