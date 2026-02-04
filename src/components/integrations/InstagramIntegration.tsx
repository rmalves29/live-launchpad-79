/**
 * Componente de Integração com Instagram Live
 * Permite configurar Instagram Account ID e Page Access Token
 * para receber comentários de Lives via Webhook oficial
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Instagram, CheckCircle2, AlertTriangle, Copy, ExternalLink, Link2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

interface InstagramIntegrationProps {
  tenantId: string;
}

interface InstagramConfig {
  id: string;
  tenant_id: string;
  instagram_account_id: string | null;
  page_access_token: string | null;
  page_id: string | null;
  webhook_verify_token: string | null;
  is_active: boolean;
  environment: string;
}

// A URL do OAuth é obtida via edge function para não expor o App ID no frontend

export default function InstagramIntegration({ tenantId }: InstagramIntegrationProps) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [instagramAccountId, setInstagramAccountId] = useState('');
  const [pageAccessToken, setPageAccessToken] = useState('');
  const [pageId, setPageId] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');
  const [isActive, setIsActive] = useState(false);

  // URL do Webhook
  const webhookUrl = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/instagram-webhook';
  const redirectUri = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/instagram-auth-callback';

  // Verificar parâmetros de sucesso/erro do OAuth
  useEffect(() => {
    const instagramSuccess = searchParams.get('instagram_success');
    const instagramError = searchParams.get('instagram_error');

    if (instagramSuccess === 'true') {
      toast.success('Instagram conectado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['instagram-integration', tenantId] });
      // Limpar parâmetros da URL
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
      // Limpar parâmetros da URL
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
      return data as InstagramConfig | null;
    },
    enabled: !!tenantId,
  });

  // Preencher formulário com dados existentes
  useEffect(() => {
    if (config) {
      setInstagramAccountId(config.instagram_account_id || '');
      setPageAccessToken(config.page_access_token || '');
      setPageId(config.page_id || '');
      setWebhookVerifyToken(config.webhook_verify_token || '');
      setIsActive(config.is_active);
    }
  }, [config]);

  // Função para iniciar OAuth do Instagram/Facebook
  const handleConnectInstagram = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('instagram-oauth-url', {
        body: { tenantId }
      });

      if (error || !data?.url) {
        toast.error('Erro ao gerar URL de autorização');
        console.error('Erro OAuth URL:', error);
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      console.error('Erro ao conectar Instagram:', err);
      toast.error('Erro ao iniciar conexão com Instagram');
    }
  };

  // Função para desconectar
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
    onError: (error) => {
      console.error('Erro ao desconectar:', error);
      toast.error('Erro ao desconectar Instagram');
    },
  });

  // Salvar configuração
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        tenant_id: tenantId,
        instagram_account_id: instagramAccountId || null,
        page_access_token: pageAccessToken || null,
        page_id: pageId || null,
        webhook_verify_token: webhookVerifyToken || null,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      if (config?.id) {
        // Atualizar
        const { error } = await supabase
          .from('integration_instagram')
          .update(payload)
          .eq('id', config.id);

        if (error) throw error;
      } else {
        // Criar novo
        const { error } = await supabase
          .from('integration_instagram')
          .insert(payload);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Configuração do Instagram salva com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['instagram-integration', tenantId] });
    },
    onError: (error) => {
      console.error('Erro ao salvar integração Instagram:', error);
      toast.error('Erro ao salvar configuração');
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado para a área de transferência`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
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
            {config?.is_active && config?.page_access_token ? (
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
          {config?.is_active && config?.page_access_token ? (
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Conta conectada: <span className="font-medium text-foreground">{config.instagram_account_id}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Page ID: {config.page_id}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Desconectar
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleConnectInstagram}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
            >
              <Link2 className="h-4 w-4 mr-2" />
              Conectar Instagram
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Webhook URL */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">URL do Webhook</CardTitle>
          <CardDescription>
            Use esta URL para configurar o Webhook no Meta for Developers
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
            Configure esta URL em{' '}
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

      {/* Configuração */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Credenciais do Instagram</CardTitle>
          <CardDescription>
            Obtenha essas informações no Meta for Developers após criar seu App
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="instagram-account-id">Instagram Account ID</Label>
              <Input
                id="instagram-account-id"
                placeholder="17841400123456789"
                value={instagramAccountId}
                onChange={(e) => setInstagramAccountId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                ID da conta Business do Instagram
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="page-id">Page ID (Facebook)</Label>
              <Input
                id="page-id"
                placeholder="123456789012345"
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                ID da Página do Facebook vinculada
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="page-access-token">Page Access Token</Label>
            <Input
              id="page-access-token"
              type="password"
              placeholder="EAAxxxxxxx..."
              value={pageAccessToken}
              onChange={(e) => setPageAccessToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Token de acesso permanente da Página (obtenha um token de longa duração)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhook-verify-token">Webhook Verify Token</Label>
            <Input
              id="webhook-verify-token"
              placeholder="meu_token_secreto"
              value={webhookVerifyToken}
              onChange={(e) => setWebhookVerifyToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Token personalizado para verificação do Webhook (você define)
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-0.5">
              <Label htmlFor="is-active">Integração Ativa</Label>
              <p className="text-xs text-muted-foreground">
                Ative para começar a receber comentários das Lives
              </p>
            </div>
            <Switch
              id="is-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </CardContent>
      </Card>

      {/* Instruções */}
      <Alert>
        <Instagram className="h-4 w-4" />
        <AlertDescription>
          <strong>Como funciona:</strong> Quando um cliente comentar o código de um produto
          durante sua Live (ex: <code className="bg-muted px-1 rounded">ABC123</code>), o sistema
          automaticamente adiciona ao carrinho e envia uma DM com o link de checkout.
        </AlertDescription>
      </Alert>

      {/* Botão Salvar */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Configurações
        </Button>
      </div>

      {/* Link para documentação */}
      <div className="text-center">
        <a
          href="/docs/INTEGRACAO_INSTAGRAM_LIVE.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          Ver documentação completa de configuração <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
