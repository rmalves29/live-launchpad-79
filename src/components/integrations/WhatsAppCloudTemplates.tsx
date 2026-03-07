import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Plus, RefreshCw, Loader2, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  tenantId: string;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
  APPROVED: { label: 'Aprovado', variant: 'default', icon: CheckCircle2 },
  PENDING: { label: 'Pendente', variant: 'secondary', icon: Clock },
  REJECTED: { label: 'Rejeitado', variant: 'destructive', icon: XCircle },
  DISABLED: { label: 'Desativado', variant: 'outline', icon: AlertCircle },
  IN_APPEAL: { label: 'Em Recurso', variant: 'secondary', icon: Clock },
  PENDING_DELETION: { label: 'Exclusão Pendente', variant: 'outline', icon: Clock },
};

const CATEGORY_MAP: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidade',
  AUTHENTICATION: 'Autenticação',
};

export default function WhatsAppCloudTemplates({ tenantId }: Props) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('MARKETING');
  const [newLanguage, setNewLanguage] = useState('pt_BR');
  const [newHeader, setNewHeader] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newFooter, setNewFooter] = useState('');

  useEffect(() => {
    loadTemplates();
  }, [tenantId]);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-cloud-templates', {
        body: { tenant_id: tenantId, action: 'list_templates' },
      });
      if (error) throw error;
      if (data?.success) {
        setTemplates(data.templates || []);
      } else {
        toast({ title: 'Erro', description: data?.error || 'Falha ao listar templates', variant: 'destructive' });
      }
    } catch (error: any) {
      console.error('Erro ao listar templates:', error);
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newBody.trim()) {
      toast({ title: 'Erro', description: 'Nome e corpo da mensagem são obrigatórios', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-cloud-templates', {
        body: {
          tenant_id: tenantId,
          action: 'create_template',
          name: newName,
          category: newCategory,
          language: newLanguage,
          header_text: newHeader || undefined,
          body_text: newBody,
          footer_text: newFooter || undefined,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: '✅ Template enviado!', description: 'O template foi enviado para aprovação da Meta.' });
        setShowCreateForm(false);
        resetForm();
        await loadTemplates();
      } else {
        toast({ title: 'Erro', description: data?.error || 'Falha ao criar template', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewCategory('MARKETING');
    setNewLanguage('pt_BR');
    setNewHeader('');
    setNewBody('');
    setNewFooter('');
  };

  const getBodyText = (template: any) => {
    const bodyComponent = template.components?.find((c: any) => c.type === 'BODY');
    return bodyComponent?.text || '';
  };

  return (
    <>
      {/* Templates List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Templates de Mensagem
              </CardTitle>
              <CardDescription>Templates aprovados pela Meta para envio de mensagens</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadTemplates} disabled={loadingTemplates}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loadingTemplates ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Template
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingTemplates ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum template encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Idioma</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Conteúdo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template: any, index: number) => {
                    const statusInfo = STATUS_MAP[template.status] || { label: template.status, variant: 'outline' as const, icon: AlertCircle };
                    const StatusIcon = statusInfo.icon;
                    return (
                      <TableRow key={`${template.name}-${template.language}-${index}`}>
                        <TableCell className="font-medium font-mono text-xs">{template.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {CATEGORY_MAP[template.category] || template.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{template.language}</TableCell>
                        <TableCell>
                          <Badge variant={statusInfo.variant} className="text-xs">
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <p className="text-xs text-muted-foreground truncate">{getBodyText(template)}</p>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Template Form */}
      {showCreateForm && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">Criar Novo Template</CardTitle>
            <CardDescription>
              Envie um novo template para aprovação da Meta. O processo de aprovação pode levar até 24 horas.
              Use {'{{1}}'}, {'{{2}}'}, etc. para variáveis dinâmicas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Nome do Template *</Label>
                <Input
                  placeholder="ex: confirmacao_pedido"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Apenas letras minúsculas, números e underscores</p>
              </div>
              <div className="space-y-2">
                <Label>Categoria *</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="UTILITY">Utilidade</SelectItem>
                    <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Idioma</Label>
                <Select value={newLanguage} onValueChange={setNewLanguage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt_BR">Português (BR)</SelectItem>
                    <SelectItem value="en_US">Inglês (US)</SelectItem>
                    <SelectItem value="es">Espanhol</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cabeçalho (opcional)</Label>
              <Input
                placeholder="Texto do cabeçalho"
                value={newHeader}
                onChange={(e) => setNewHeader(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Corpo da Mensagem *</Label>
              <Textarea
                placeholder="Olá {{1}}! Seu pedido #{{2}} foi confirmado."
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Rodapé (opcional)</Label>
              <Input
                placeholder="Ex: OrderZap - Sistema de Pedidos"
                value={newFooter}
                onChange={(e) => setNewFooter(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Enviar para Aprovação
              </Button>
              <Button variant="outline" onClick={() => { setShowCreateForm(false); resetForm(); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
