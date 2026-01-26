/**
 * Integração Instagram Live
 * Permite capturar comentários de lives e criar pedidos automaticamente
 * Envia DMs para clientes quando produtos são adicionados
 * 
 * VISIBILIDADE: Apenas para tenant orderzap e super_admin até validação completa
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
  Instagram, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Copy, 
  ExternalLink,
  MessageCircle,
  Video,
  AlertTriangle,
  Info
} from 'lucide-react';

interface InstagramIntegrationProps {
  tenantId: string;
}

interface InstagramIntegrationData {
  id: string;
  tenant_id: string;
  page_id: string | null;
  instagram_account_id: string | null;
  access_token: string | null;
  page_access_token: string | null;
  webhook_verify_token: string | null;
  is_active: boolean;
  environment: string;
  created_at: string;
  updated_at: string;
}

export default function InstagramIntegration({ tenantId }: InstagramIntegrationProps) {
  const queryClient = useQueryClient();
  const [pageId, setPageId] = useState('');
  const [instagramAccountId, setInstagramAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [pageAccessToken, setPageAccessToken] = useState('');
  
  // Buscar integração existente
  const { data: integration, isLoading } = useQuery({
    queryKey: ['instagram-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_instagram')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as InstagramIntegrationData | null;
    },
    enabled: !!tenantId,
  });

  // Gerar webhook URL
  const webhookUrl = `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/instagram-webhook`;
  const webhookVerifyToken = integration?.webhook_verify_token || 'orderzap_instagram_verify';

  // Mutation para salvar/atualizar
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<InstagramIntegrationData>) => {
      if (integration) {
        const { error } = await supabase
          .from('integration_instagram')
          .update({
            ...data,
            updated_at: new Date().toISOString(),
          })
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_instagram')
          .insert({
            tenant_id: tenantId,
            webhook_verify_token: webhookVerifyToken,
            ...data,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-integration', tenantId] });
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
        .from('integration_instagram')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', integration.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-integration', tenantId] });
      toast.success('Status atualizado!');
    },
    onError: () => {
      toast.error('Erro ao atualizar status');
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      page_id: pageId || integration?.page_id,
      instagram_account_id: instagramAccountId || integration?.instagram_account_id,
      access_token: accessToken || integration?.access_token,
      page_access_token: pageAccessToken || integration?.page_access_token,
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
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
              <Instagram className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">Instagram Live</CardTitle>
              <CardDescription>
                Capture comentários de lives e envie DMs automaticamente
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

      {/* Aviso Beta */}
      <Alert className="border-amber-500/50 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertDescription className="text-amber-700 dark:text-amber-300">
          <strong>Integração em Beta:</strong> Esta funcionalidade está em fase de testes. 
          Disponível apenas para a empresa OrderZap até validação completa.
        </AlertDescription>
      </Alert>

      {/* Como Funciona */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-500" />
            Como Funciona
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <Video className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium">1. Live no Instagram</p>
                <p className="text-sm text-muted-foreground">
                  Cliente comenta o código do produto durante a live
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <Instagram className="h-5 w-5 text-pink-500 mt-0.5" />
              <div>
                <p className="font-medium">2. Webhook Processa</p>
                <p className="text-sm text-muted-foreground">
                  Sistema identifica o produto e cria o pedido
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <MessageCircle className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium">3. DM Automático</p>
                <p className="text-sm text-muted-foreground">
                  Cliente recebe confirmação via Direct Message
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuração do Webhook */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuração do Webhook</CardTitle>
          <CardDescription>
            Configure estes valores no Meta Developer Console
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Callback URL</Label>
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
          <div className="space-y-2">
            <Label>Verify Token</Label>
            <div className="flex gap-2">
              <Input value={webhookVerifyToken} readOnly className="font-mono text-sm" />
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => copyToClipboard(webhookVerifyToken, 'Token')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="pt-2">
            <Button variant="outline" asChild>
              <a 
                href="https://developers.facebook.com/apps" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir Meta Developer Console
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Credenciais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Credenciais do Meta App</CardTitle>
          <CardDescription>
            Obtenha estas informações no Meta Developer Console após criar seu App
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pageId">Page ID (Facebook)</Label>
              <Input
                id="pageId"
                placeholder="123456789"
                value={pageId || integration?.page_id || ''}
                onChange={(e) => setPageId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagramAccountId">Instagram Account ID</Label>
              <Input
                id="instagramAccountId"
                placeholder="17841400000000000"
                value={instagramAccountId || integration?.instagram_account_id || ''}
                onChange={(e) => setInstagramAccountId(e.target.value)}
              />
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-2">
            <Label htmlFor="accessToken">User Access Token (Long-lived)</Label>
            <Input
              id="accessToken"
              type="password"
              placeholder="EAAxxxxxxx..."
              value={accessToken || (integration?.access_token ? '••••••••' : '')}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Token de longa duração gerado no Meta Developer Console
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="pageAccessToken">Page Access Token</Label>
            <Input
              id="pageAccessToken"
              type="password"
              placeholder="EAAxxxxxxx..."
              value={pageAccessToken || (integration?.page_access_token ? '••••••••' : '')}
              onChange={(e) => setPageAccessToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Token da página conectada ao Instagram Business
            </p>
          </div>

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

      {/* Requisitos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Requisitos</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Conta Instagram Business ou Creator
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Página do Facebook conectada ao Instagram
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Meta App com permissões: instagram_manage_comments, instagram_manage_messages
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              App Review aprovado para produção (opcional para testes)
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
