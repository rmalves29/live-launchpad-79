/**
 * Integração Manychat
 * Permite automação de vendas via Instagram Live usando Manychat
 * 
 * VISIBILIDADE: Inicialmente apenas para tenant "Mania de Mulher"
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { 
  MessageCircle, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Copy, 
  ExternalLink,
  Video,
  Bot,
  Zap,
  Info,
  ImageIcon
} from 'lucide-react';
import manychatGuideImage from '@/assets/manychat-variables-guide.png';
import manychatTriggerGuideImage from '@/assets/manychat-trigger-data-guide.png';

interface ManychatIntegrationProps {
  tenantId: string;
}

interface ManychatIntegrationData {
  id: string;
  tenant_id: string;
  api_key: string | null;
  bot_id: string | null;
  webhook_secret: string | null;
  is_active: boolean;
  environment: string;
  created_at: string;
  updated_at: string;
}

export default function ManychatIntegration({ tenantId }: ManychatIntegrationProps) {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [botId, setBotId] = useState('');
  
  // Buscar integração existente
  const { data: integration, isLoading } = useQuery({
    queryKey: ['manychat-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_manychat')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as ManychatIntegrationData | null;
    },
    enabled: !!tenantId,
  });

  // Webhook URL para configurar no Manychat
  const webhookUrl = `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/manychat-webhook`;

  // Mutation para salvar/atualizar
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<ManychatIntegrationData>) => {
      if (integration) {
        const { error } = await supabase
          .from('integration_manychat')
          .update({
            ...data,
            updated_at: new Date().toISOString(),
          })
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_manychat')
          .insert({
            tenant_id: tenantId,
            ...data,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manychat-integration', tenantId] });
      toast.success('Integração salva com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao salvar integração:', error);
      toast.error('Erro ao salvar integração');
    },
  });

  // Toggle ativo/inativo
  const toggleActiveMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      if (!integration) return;
      const { error } = await supabase
        .from('integration_manychat')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', integration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manychat-integration', tenantId] });
      toast.success('Status atualizado!');
    },
    onError: () => {
      toast.error('Erro ao atualizar status');
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      api_key: apiKey || integration?.api_key,
      bot_id: botId || integration?.bot_id,
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">Manychat</CardTitle>
              <CardDescription>
                Automação de vendas via Instagram Live
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {integration ? (
              <Badge variant={integration.is_active ? 'default' : 'secondary'}>
                {integration.is_active ? (
                  <><CheckCircle2 className="h-3 w-3 mr-1" /> Ativo</>
                ) : (
                  <><XCircle className="h-3 w-3 mr-1" /> Inativo</>
                )}
              </Badge>
            ) : (
              <Badge variant="outline">Não configurado</Badge>
            )}
            {integration && (
              <Switch
                checked={integration.is_active}
                onCheckedChange={(checked) => toggleActiveMutation.mutate(checked)}
                disabled={toggleActiveMutation.isPending}
              />
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Como Funciona */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-500" />
            Como Funciona
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <Video className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium">1. Live no Instagram</p>
                <p className="text-sm text-muted-foreground">
                  Cliente comenta o código do produto
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <Bot className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium">2. Manychat Detecta</p>
                <p className="text-sm text-muted-foreground">
                  Manychat identifica o comentário
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <Zap className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div>
                <p className="font-medium">3. OrderZap Processa</p>
                <p className="text-sm text-muted-foreground">
                  Webhook cria o pedido automaticamente
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <MessageCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">4. DM Automático</p>
                <p className="text-sm text-muted-foreground">
                  Manychat envia confirmação via DM
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuração do Webhook */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuração do Webhook no Manychat</CardTitle>
          <CardDescription>
            Configure o External Request no seu fluxo do Manychat
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-blue-500/50 bg-blue-500/10">
            <Info className="h-4 w-4 text-blue-500" />
            <AlertDescription className="text-blue-700 dark:text-blue-300">
              No Manychat, crie um fluxo que detecta comentários na live e use a ação "External Request" 
              para enviar os dados para a URL abaixo.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label>URL do Webhook (POST)</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-sm" />
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => copyToClipboard(webhookUrl, 'URL')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-base font-medium">Campos para enviar no Body (JSON)</Label>
            <Alert className="border-orange-500/50 bg-orange-500/10 mb-3">
              <Info className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-700 dark:text-orange-300">
                <strong>Para Lives do Instagram:</strong> Use a variável <code className="bg-muted px-1 rounded">Trigger Comment Text</code> (em "Trigger Data") para capturar o código do produto comentado na live.
              </AlertDescription>
            </Alert>
            <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm space-y-1">
              <p className="text-green-600 dark:text-green-400">{"{"}</p>
              <p className="pl-4">
                <span className="text-muted-foreground">"product_code":</span> 
                <span className="text-yellow-600 dark:text-yellow-400"> [Selecionar: Trigger Data → Comment Text]</span>
              </p>
              <p className="pl-4">
                <span className="text-muted-foreground">"instagram_username":</span> 
                <span className="text-yellow-600 dark:text-yellow-400"> [Selecionar: System → IG Username]</span>
              </p>
              <p className="pl-4">
                <span className="text-muted-foreground">"subscriber_id":</span> 
                <span className="text-yellow-600 dark:text-yellow-400"> [Selecionar: System → User ID]</span>
              </p>
              <p className="pl-4">
                <span className="text-muted-foreground">"first_name":</span> 
                <span className="text-yellow-600 dark:text-yellow-400"> [Selecionar: System → First Name]</span>
              </p>
              <p className="pl-4">
                <span className="text-muted-foreground">"phone":</span> 
                <span className="text-yellow-600 dark:text-yellow-400"> [Selecionar: System → Phone]</span>
              </p>
              <p className="text-green-600 dark:text-green-400">{"}"}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              ⚠️ <strong>Não digite as variáveis!</strong> Use o botão {`{ }`} e selecione cada variável na lista.
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-base font-medium">Resposta do Webhook</Label>
            <p className="text-sm text-muted-foreground">
              O webhook retorna os seguintes campos que você pode usar no fluxo:
            </p>
            <div className="grid md:grid-cols-2 gap-2 text-sm">
              <div className="bg-muted/30 p-2 rounded"><code>success</code> - true/false</div>
              <div className="bg-muted/30 p-2 rounded"><code>product_found</code> - Produto encontrado</div>
              <div className="bg-muted/30 p-2 rounded"><code>product_name</code> - Nome do produto</div>
              <div className="bg-muted/30 p-2 rounded"><code>product_price_formatted</code> - Preço formatado</div>
              <div className="bg-muted/30 p-2 rounded"><code>cart_total_formatted</code> - Total do carrinho</div>
              <div className="bg-muted/30 p-2 rounded"><code>message</code> - Mensagem de confirmação</div>
            </div>
          </div>

          <Separator />

          {/* Guia Visual */}
          <div className="space-y-3">
            <Label className="text-base font-medium flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Guia Visual: Como Inserir Variáveis para Lives
            </Label>
            <Alert className="border-red-500/50 bg-red-500/10">
              <Info className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700 dark:text-red-300">
                <strong>Erro Comum:</strong> Se as mensagens chegam vazias (sem nome do produto ou total), significa que as variáveis não foram selecionadas corretamente. <strong>Nunca digite o texto das variáveis!</strong>
              </AlertDescription>
            </Alert>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">1. Como selecionar "Trigger Data" (para lives):</p>
                <div className="rounded-lg overflow-hidden border">
                  <img 
                    src={manychatTriggerGuideImage} 
                    alt="Guia de como selecionar Trigger Data no Manychat" 
                    className="w-full h-auto"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  No campo <code>product_code</code>, clique em {`{ }`} → Trigger Data → Comment Text
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">2. Como selecionar variáveis do sistema:</p>
                <div className="rounded-lg overflow-hidden border">
                  <img 
                    src={manychatGuideImage} 
                    alt="Guia visual de como inserir variáveis no Manychat" 
                    className="w-full h-auto"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Nos outros campos, clique em {`{ }`} → System → selecione a variável
                </p>
              </div>
            </div>
            
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3 mt-2">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">❌ Errado:</p>
              <p className="text-xs text-red-700 dark:text-red-300 font-mono">Digitar: {"{{last_input_text}}"} ou {"{{comment_text}}"}</p>
              <p className="text-sm font-medium text-green-800 dark:text-green-200 mt-2">✅ Correto:</p>
              <p className="text-xs text-green-700 dark:text-green-300">Clicar em {`{ }`} → Trigger Data → selecionar "Comment Text"</p>
            </div>
          </div>

          <div className="pt-2">
            <Button variant="outline" asChild>
              <a 
                href="https://manychat.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir Manychat
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Credenciais (Opcional) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Credenciais (Opcional)</CardTitle>
          <CardDescription>
            Para funcionalidades avançadas como envio de mensagens pelo OrderZap
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="botId">Bot ID</Label>
              <Input
                id="botId"
                placeholder="123456"
                value={botId || integration?.bot_id || ''}
                onChange={(e) => setBotId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="sua-api-key"
                value={apiKey || (integration?.api_key ? '••••••••' : '')}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Encontre estas informações em Settings → API no Manychat
          </p>

          <div className="pt-4">
            <Button 
              onClick={handleSave} 
              disabled={saveMutation.isPending}
              className="w-full md:w-auto"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Configuração
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Passo a Passo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Passo a Passo de Configuração</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm list-decimal list-inside">
            <li className="flex items-start gap-2">
              <span className="font-medium min-w-[24px]">1.</span>
              <span>Crie um novo fluxo no Manychat para Instagram</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium min-w-[24px]">2.</span>
              <span>Adicione um trigger de "Instagram Live Comments"</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium min-w-[24px]">3.</span>
              <span>Configure um filtro para capturar códigos de produtos (ex: padrão alfanumérico)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium min-w-[24px]">4.</span>
              <span>Adicione uma ação "External Request" (POST) com a URL do webhook</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium min-w-[24px]">5.</span>
              <span>Configure o Body com os campos JSON mostrados acima</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium min-w-[24px]">6.</span>
              <span>Use a resposta do webhook para enviar uma DM de confirmação ao cliente</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
