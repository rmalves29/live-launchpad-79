/**
 * Componente de Integração com Instagram Live
 * Conexão via OAuth (botão "Conectar Instagram")
 */

import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Instagram, CheckCircle2, AlertTriangle, Copy, ExternalLink, Link2, Radio } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import InstagramLiveComments from './InstagramLiveComments';
import { liveShopUrl } from '@/lib/live-shop';
import InstagramProfileAvatar from './InstagramProfileAvatar';

interface InstagramIntegrationProps {
  tenantId: string;
  tenantSlug?: string;
}

export default function InstagramIntegration({ tenantId, tenantSlug }: InstagramIntegrationProps) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const webhookUrl = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/instagram-webhook';

  // Verificar parâmetros de sucesso/erro do OAuth
  useEffect(() => {
    const instagramSuccess = searchParams.get('instagram_success');
    const instagramError = searchParams.get('instagram_error');

    if (instagramSuccess === 'true') {
      toast.success('Instagram conectado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['instagram-integration', tenantId] });
      searchParams.delete('instagram_success');
      setSearchParams(searchParams, { replace: true });
    }

    if (instagramError) {
      const errorMessages: Record<string, string> = {
        'codigo_nao_fornecido': 'Código de autorização não fornecido',
        'tenant_nao_identificado': 'Tenant não identificado',
        'credenciais_nao_configuradas': 'Credenciais do Facebook App não configuradas',
        'nenhuma_pagina_encontrada': 'Nenhuma página do Facebook encontrada',
        'instagram_business_nao_vinculado': 'Nenhuma conta Business do Instagram vinculada à página',
        'erro_inesperado': 'Erro inesperado durante a conexão',
      };
      toast.error(errorMessages[instagramError] || `Erro: ${instagramError}`);
      searchParams.delete('instagram_error');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, queryClient, tenantId]);

  // Buscar configuração atual
  const { data: config, isLoading } = useQuery({
    queryKey: ['instagram-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_instagram')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const isConnected = !!(config?.is_active && (config?.access_token || config?.page_access_token));

  // Aviso de token: a renovação é automática (cron diário); só alerta se vencido, com erro ou perto de vencer.
  const tokenWarning = (() => {
    if (!isConnected) return null;
    const expiresAt = (config as any)?.token_expires_at ? new Date((config as any).token_expires_at).getTime() : null;
    const lastError = (config as any)?.token_last_error as string | null | undefined;
    if (expiresAt) {
      const days = Math.floor((expiresAt - Date.now()) / 86400000);
      if (days < 0) {
        return { critical: true, message: 'O acesso ao Instagram expirou. Reconecte para voltar a receber pedidos e enviar DMs.' };
      }
      if (days <= 7 && lastError) {
        return { critical: days <= 2, message: `O acesso ao Instagram vence em ${days} dia(s) e a renovação automática falhou. Reconecte para evitar interrupções.` };
      }
    } else if (lastError) {
      return { critical: false, message: 'Não foi possível renovar o acesso ao Instagram automaticamente. Se os pedidos pararem, reconecte.' };
    }
    return null;
  })();

  // Iniciar OAuth
  const handleConnectInstagram = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('instagram-oauth-url', {
        body: { tenantId }
      });

      if (error || !data?.url) {
        toast.error('Erro ao gerar URL de autorização');
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      console.error('Erro ao conectar Instagram:', err);
      toast.error('Erro ao iniciar conexão com Instagram');
    }
  };

  // Desconectar
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('integration_instagram')
        .update({
          is_active: false,
          page_access_token: null,
          access_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Instagram desconectado');
      queryClient.invalidateQueries({ queryKey: ['instagram-integration', tenantId] });
    },
    onError: () => {
      toast.error('Erro ao desconectar Instagram');
    },
  });

  // Toggle DM Cadastro
  const toggleCadastroDm = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('integration_instagram')
        .update({
          send_cadastro_dm: enabled,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('tenant_id', tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-integration', tenantId] });
      toast.success('Configuração atualizada');
    },
    onError: () => toast.error('Erro ao atualizar configuração'),
  });

  // Respostas públicas automáticas (opcionais)
  const updateIntegrationField = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from('integration_instagram')
        .update({ ...patch, updated_at: new Date().toISOString() } as any)
        .eq('tenant_id', tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-integration', tenantId] });
      toast.success('Configuração atualizada');
    },
    onError: () => toast.error('Erro ao atualizar configuração'),
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Conteúdo de configuração (existente)
  const configContent = (
    <div className="space-y-6">
      {/* Status & Conexão */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
                <Instagram className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle>Instagram Live Commerce</CardTitle>
                <CardDescription>
                  Capture pedidos automaticamente dos comentários em suas Lives
                </CardDescription>
              </div>
            </div>
            {isConnected ? (
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Conectado</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-sm font-medium">Desconectado</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <>
            <div className="flex items-center gap-4">
              <InstagramProfileAvatar
                tenantId={tenantId}
                username={config?.instagram_username || null}
                profilePictureUrl={(config as any)?.profile_picture_url || null}
              />
              <div className="flex-1 space-y-1">
                <p className="text-sm text-muted-foreground">
                  Conta conectada: <span className="font-medium text-foreground">
                    {(config as any)?.instagram_username 
                      ? `@${(config as any).instagram_username}` 
                      : config?.instagram_account_id}
                  </span>
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  if (window.confirm('Desconectar o Instagram? Os comentários deixarão de virar pedidos até você reconectar.')) {
                    disconnectMutation.mutate();
                  }
                }}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Desconectar
              </Button>
            </div>
            {tokenWarning && (
              <Alert variant={tokenWarning.critical ? 'destructive' : 'default'} className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>{tokenWarning.message}</span>
                  <Button size="sm" variant="outline" onClick={handleConnectInstagram}>
                    Reconectar agora
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            </>
          ) : (
            <div className="space-y-4">
              <Button
                onClick={handleConnectInstagram}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
              >
                <Link2 className="h-4 w-4 mr-2" />
                Conectar Instagram
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Você será redirecionado para o Facebook para autorizar o acesso à sua conta Business do Instagram
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhook URL — só mostra quando conectado */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">URL do Webhook</CardTitle>
            <CardDescription>
              Configure esta URL no Meta for Developers para receber comentários das Lives
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-sm" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(webhookUrl, 'URL do Webhook')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Configure em{' '}
              <a
                href="https://developers.facebook.com/apps"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Meta for Developers <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Link de Cadastro de Clientes */}
      {isConnected && tenantSlug && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Link de Cadastro de Clientes</CardTitle>
            <CardDescription>
              Compartilhe este link para que seus clientes vinculem o @ do Instagram ao telefone
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input
                value={`${window.location.origin}/t/${tenantSlug}/cadastro-instagram`}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(`${window.location.origin}/t/${tenantSlug}/cadastro-instagram`, 'Link de cadastro')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DM Instagram Cadastro */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">DM Instagram Cadastro</CardTitle>
            <CardDescription>
              Quando ativado, clientes não cadastrados receberão uma DM pedindo para se cadastrar antes de receber o link de checkout
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label htmlFor="send-cadastro-dm" className="text-sm">
                Enviar DM de cadastro para clientes não registrados
              </Label>
              <Switch
                id="send-cadastro-dm"
                checked={!!(config as any)?.send_cadastro_dm}
                onCheckedChange={(checked) => toggleCadastroDm.mutate(checked)}
                disabled={toggleCadastroDm.isPending}
              />
            </div>

            <div className="mt-4 space-y-3 border-t pt-4">
              <p className="text-sm font-medium">Respostas públicas automáticas no comentário</p>
              <p className="text-xs text-muted-foreground">
                Opcional. Responde publicamente ao comentário quando a venda é registrada ou quando a peça esgotou.
                Use {'{{produto}}'} e {'{{usuario}}'} no texto. Depende do Instagram permitir resposta no tipo de comentário.
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-reply-added" className="text-sm">Responder quando a venda for registrada</Label>
                  <Switch
                    id="auto-reply-added"
                    checked={!!(config as any)?.auto_reply_added}
                    onCheckedChange={(checked) => updateIntegrationField.mutate({ auto_reply_added: checked })}
                    disabled={updateIntegrationField.isPending}
                  />
                </div>
                <Input
                  key={`added-${(config as any)?.auto_reply_added_text ?? ''}`}
                  defaultValue={(config as any)?.auto_reply_added_text || ''}
                  placeholder="✅ {{produto}} anotado, @{{usuario}}! Te enviei os detalhes por DM."
                  maxLength={300}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value !== ((config as any)?.auto_reply_added_text || '')) {
                      updateIntegrationField.mutate({ auto_reply_added_text: value || null });
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-reply-oos" className="text-sm">Responder quando a peça esgotar</Label>
                  <Switch
                    id="auto-reply-oos"
                    checked={!!(config as any)?.auto_reply_out_of_stock}
                    onCheckedChange={(checked) => updateIntegrationField.mutate({ auto_reply_out_of_stock: checked })}
                    disabled={updateIntegrationField.isPending}
                  />
                </div>
                <Input
                  key={`oos-${(config as any)?.auto_reply_out_of_stock_text ?? ''}`}
                  defaultValue={(config as any)?.auto_reply_out_of_stock_text || ''}
                  placeholder="😕 Essa peça esgotou, @{{usuario}}. Fique de olho nas próximas!"
                  maxLength={300}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value !== ((config as any)?.auto_reply_out_of_stock_text || '')) {
                      updateIntegrationField.mutate({ auto_reply_out_of_stock_text: value || null });
                    }
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Link da Loja da Live */}
      {tenantSlug && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Link de compra da live</CardTitle>
            <CardDescription>
              Cole este link na live do Instagram. O cliente vê a vitrine, monta o carrinho e paga em poucos toques.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-xs break-all">{liveShopUrl(tenantSlug)}</code>
              <Button size="sm" variant="outline" onClick={() => copyToClipboard(liveShopUrl(tenantSlug), 'Link da Loja da Live')}>
                <Copy className="h-4 w-4 mr-1" /> Copiar
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={`/t/${tenantSlug}/live`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" /> Abrir</a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Só aparecem peças de venda LIVE ou AMBOS com estoque. Cupons, brindes, frete e reserva de estoque ficam na página Loja da Live.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Como funciona */}
      <Alert>
        <Instagram className="h-4 w-4" />
        <AlertDescription>
          <strong>Como funciona:</strong> Quando um cliente comentar o código de um produto
          durante sua Live (ex: <code className="bg-muted px-1 rounded">ABC123</code>), o sistema
          automaticamente adiciona ao carrinho e envia uma DM com o link de checkout.
        </AlertDescription>
      </Alert>
    </div>
  );

  // Se não estiver conectado, mostra apenas a configuração sem tabs
  if (!isConnected) {
    return configContent;
  }

  // Conectado: mostra tabs com Configuração + LIVE
  return (
    <Tabs defaultValue="config" className="space-y-4">
      <TabsList>
        <TabsTrigger value="config">Configuração</TabsTrigger>
        <TabsTrigger value="live" className="flex items-center gap-1.5">
          <Radio className="h-3.5 w-3.5" />
          LIVE
        </TabsTrigger>
      </TabsList>

      <TabsContent value="config">
        {configContent}
      </TabsContent>

      <TabsContent value="live">
        <InstagramLiveComments tenantId={tenantId} />
      </TabsContent>
    </Tabs>
  );
}
