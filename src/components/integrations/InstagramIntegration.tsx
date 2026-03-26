/**
 * Componente de Integração com Instagram Live
 * Conexão via OAuth (botão "Conectar Instagram")
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Instagram, CheckCircle2, AlertTriangle, Copy, ExternalLink, Link2, Radio } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import InstagramLiveComments from './InstagramLiveComments';

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

  // Buscar foto de perfil do Instagram
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  useEffect(() => {
    if (isConnected && config?.instagram_account_id && (config?.access_token || config?.page_access_token)) {
      const token = config.page_access_token || config.access_token;
      fetch(`https://graph.facebook.com/v21.0/${config.instagram_account_id}?fields=profile_picture_url&access_token=${token}`)
        .then(r => r.json())
        .then(data => {
          if (data?.profile_picture_url) setProfilePicUrl(data.profile_picture_url);
        })
        .catch(() => {});
    }
  }, [isConnected, config?.instagram_account_id, config?.access_token, config?.page_access_token]);

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
            <div className="flex items-center gap-4">
              <Avatar className="h-10 w-10 border border-border">
                <AvatarImage src={profilePicUrl || undefined} alt="Instagram profile" />
                <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-xs">
                  <Instagram className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
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
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Desconectar
              </Button>
            </div>
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
