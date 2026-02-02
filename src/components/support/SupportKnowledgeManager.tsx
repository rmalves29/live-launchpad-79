import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit, Save, X, BookOpen, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  is_active: boolean;
  created_at: string;
}

interface SupportSettings {
  id?: string;
  human_support_phone: string;
  max_attempts_before_escalation: number;
  welcome_message: string;
  escalation_message: string;
  is_active: boolean;
}

export function SupportKnowledgeManager() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'geral',
    tags: ''
  });

  // Fetch knowledge base
  const { data: knowledgeBase, isLoading } = useQuery({
    queryKey: ['knowledge-base', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as KnowledgeItem[];
    },
    enabled: !!tenant?.id
  });

  // Fetch support settings
  const { data: settings } = useQuery({
    queryKey: ['support-settings', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const { data, error } = await supabase
        .from('support_settings')
        .select('*')
        .eq('tenant_id', tenant.id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data as SupportSettings | null;
    },
    enabled: !!tenant?.id
  });

  // Add knowledge item
  const addMutation = useMutation({
    mutationFn: async (data: Omit<KnowledgeItem, 'id' | 'created_at'>) => {
      const { error } = await supabase.from('knowledge_base').insert({
        ...data,
        tenant_id: tenant?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast.success('Item adicionado!');
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error('Erro ao adicionar: ' + error.message);
    }
  });

  // Update knowledge item
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<KnowledgeItem> & { id: string }) => {
      const { error } = await supabase.from('knowledge_base').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast.success('Item atualizado!');
      setEditingItem(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar: ' + error.message);
    }
  });

  // Delete knowledge item
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('knowledge_base').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast.success('Item removido!');
    },
    onError: (error: any) => {
      toast.error('Erro ao remover: ' + error.message);
    }
  });

  // Save settings
  const settingsMutation = useMutation({
    mutationFn: async (data: SupportSettings) => {
      if (settings?.id) {
        const { error } = await supabase.from('support_settings').update(data).eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('support_settings').insert({
          ...data,
          tenant_id: tenant?.id
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-settings'] });
      toast.success('Configurações salvas!');
    },
    onError: (error: any) => {
      toast.error('Erro ao salvar: ' + error.message);
    }
  });

  const resetForm = () => {
    setFormData({ title: '', content: '', category: 'geral', tags: '' });
  };

  const handleSubmit = () => {
    const tags = formData.tags.split(',').map(t => t.trim()).filter(Boolean);
    
    if (editingItem) {
      updateMutation.mutate({
        id: editingItem.id,
        title: formData.title,
        content: formData.content,
        category: formData.category,
        tags
      });
    } else {
      addMutation.mutate({
        title: formData.title,
        content: formData.content,
        category: formData.category,
        tags,
        is_active: true
      });
    }
  };

  const startEditing = (item: KnowledgeItem) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      content: item.content,
      category: item.category,
      tags: item.tags?.join(', ') || ''
    });
    setIsAddDialogOpen(true);
  };

  const [settingsForm, setSettingsForm] = useState<SupportSettings>({
    human_support_phone: settings?.human_support_phone || '',
    max_attempts_before_escalation: settings?.max_attempts_before_escalation || 3,
    welcome_message: settings?.welcome_message || 'Olá! Sou o assistente virtual. Como posso ajudar?',
    escalation_message: settings?.escalation_message || 'Estou transferindo para um atendente humano.',
    is_active: settings?.is_active ?? true
  });

  // Update settings form when data loads
  if (settings && !settingsForm.human_support_phone && settings.human_support_phone) {
    setSettingsForm({
      human_support_phone: settings.human_support_phone,
      max_attempts_before_escalation: settings.max_attempts_before_escalation,
      welcome_message: settings.welcome_message,
      escalation_message: settings.escalation_message,
      is_active: settings.is_active
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Suporte IA</h2>
          <p className="text-muted-foreground">Gerencie a base de conhecimento e configurações do assistente virtual</p>
        </div>
      </div>

      <Tabs defaultValue="knowledge" className="w-full">
        <TabsList>
          <TabsTrigger value="knowledge" className="gap-2">
            <BookOpen className="w-4 h-4" />
            Base de Conhecimento
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="w-4 h-4" />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="knowledge" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) {
                setEditingItem(null);
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar FAQ/Documento
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingItem ? 'Editar Item' : 'Adicionar à Base de Conhecimento'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Título</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Ex: Como criar um pedido?"
                    />
                  </div>
                  <div>
                    <Label>Categoria</Label>
                    <Input
                      value={formData.category}
                      onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                      placeholder="Ex: pedidos, pagamentos, produtos"
                    />
                  </div>
                  <div>
                    <Label>Conteúdo (suporta Markdown)</Label>
                    <Textarea
                      value={formData.content}
                      onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="Escreva a resposta ou informação..."
                      className="min-h-[200px]"
                    />
                  </div>
                  <div>
                    <Label>Tags (separadas por vírgula)</Label>
                    <Input
                      value={formData.tags}
                      onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                      placeholder="pedido, criar, novo"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSubmit} disabled={!formData.title || !formData.content}>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : knowledgeBase?.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">Base de conhecimento vazia</h3>
                <p className="text-muted-foreground mb-4">
                  Adicione FAQs e documentos para treinar o assistente virtual
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {knowledgeBase?.map((item) => (
                <Card key={item.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {item.title}
                          {!item.is_active && <Badge variant="secondary">Inativo</Badge>}
                        </CardTitle>
                        <CardDescription>
                          Categoria: {item.category}
                          {item.tags?.length > 0 && (
                            <span className="ml-2">
                              • Tags: {item.tags.join(', ')}
                            </span>
                          )}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => startEditing(item)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(item.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-3">{item.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configurações do Suporte IA</CardTitle>
              <CardDescription>Configure o comportamento do assistente virtual e escalação</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Suporte IA Ativo</Label>
                  <p className="text-sm text-muted-foreground">Ativar/desativar o assistente virtual</p>
                </div>
                <Switch
                  checked={settingsForm.is_active}
                  onCheckedChange={(checked) => setSettingsForm(prev => ({ ...prev, is_active: checked }))}
                />
              </div>

              <div>
                <Label>Telefone do Suporte Humano *</Label>
                <Input
                  value={settingsForm.human_support_phone}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, human_support_phone: e.target.value }))}
                  placeholder="5531999999999"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  WhatsApp que receberá as escalações (com código do país)
                </p>
              </div>

              <div>
                <Label>Tentativas antes de escalar</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={settingsForm.max_attempts_before_escalation}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, max_attempts_before_escalation: parseInt(e.target.value) || 3 }))}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Após quantas respostas insatisfatórias escalar para humano
                </p>
              </div>

              <div>
                <Label>Mensagem de Boas-vindas</Label>
                <Textarea
                  value={settingsForm.welcome_message}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, welcome_message: e.target.value }))}
                  placeholder="Olá! Sou o assistente virtual..."
                />
              </div>

              <div>
                <Label>Mensagem de Escalação</Label>
                <Textarea
                  value={settingsForm.escalation_message}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, escalation_message: e.target.value }))}
                  placeholder="Estou transferindo para um atendente humano..."
                />
              </div>

              <Button onClick={() => settingsMutation.mutate(settingsForm)} disabled={!settingsForm.human_support_phone}>
                <Save className="w-4 h-4 mr-2" />
                Salvar Configurações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
