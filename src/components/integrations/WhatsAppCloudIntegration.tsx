import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, CheckCircle2, Loader2, Send, Zap, Phone, FileText, Plus, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import WhatsAppCloudTemplates from './WhatsAppCloudTemplates';

interface Props {
  tenantId: string;
}

export default function WhatsAppCloudIntegration({ tenantId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [fbSdkReady, setFbSdkReady] = useState(false);
  const [fbAppId, setFbAppId] = useState('');
  const [fbConfigId, setFbConfigId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [phoneInfo, setPhoneInfo] = useState<any>(null);
  const [loadingPhone, setLoadingPhone] = useState(false);
  const OAUTH_REDIRECT_URI = 'https://live-launchpad-79.lovable.app/auth';

  // Load Facebook SDK
  useEffect(() => {
    if (!fbAppId) return;
    const initializeSdk = () => {
      if (!(window as any).FB) return;
      (window as any).FB.init({ appId: fbAppId, cookie: true, xfbml: true, version: 'v21.0' });
      setFbSdkReady(true);
    };
    if (document.getElementById('facebook-jssdk')) { initializeSdk(); return; }
    (window as any).fbAsyncInit = initializeSdk;
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, [fbAppId]);

  useEffect(() => {
    if (!tenantId) return;
    loadEmbeddedConfig();
    loadConfig();
  }, [tenantId]);

  const handleMessage = useCallback(async (event: MessageEvent) => {
    if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
    try {
      if (typeof event.data === 'string') {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          const { phone_number_id: pnId, waba_id: wId } = data.data || {};
          if (pnId) setPhoneNumberId(pnId);
          if (wId) setWabaId(wId);
        }
      }
    } catch { }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const loadEmbeddedConfig = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-cloud-exchange-token', {
        body: { request_type: 'get_embedded_config' },
      });
      if (error) throw error;
      if (!data?.success || !data?.app_id || !data?.config_id) throw new Error(data?.error || 'Configuração inválida');
      setFbAppId(data.app_id);
      setFbConfigId(data.config_id);
    } catch (error: any) {
      console.error('Erro ao carregar config:', error);
    }
  };

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integration_whatsapp_cloud' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        setConfig(data);
        setPhoneNumberId((data as any).phone_number_id || '');
        setWabaId((data as any).waba_id || '');
      }
    } catch (error: any) {
      console.error('Erro ao carregar config:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load phone info when connected
  useEffect(() => {
    if (config?.is_active && config?.phone_number_id) {
      loadPhoneInfo();
    }
  }, [config?.is_active, config?.phone_number_id]);

  const loadPhoneInfo = async () => {
    setLoadingPhone(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-cloud-templates', {
        body: { tenant_id: tenantId, action: 'get_phone_info' },
      });
      if (error) throw error;
      if (data?.success) setPhoneInfo(data.phone);
    } catch (error: any) {
      console.error('Erro ao carregar info do telefone:', error);
    } finally {
      setLoadingPhone(false);
    }
  };

  const handleEmbeddedSignup = () => {
    if (!fbAppId || !fbConfigId) {
      toast({ title: 'Aguarde', description: 'Carregando configuração da Meta...', variant: 'destructive' });
      return;
    }
    if (!fbSdkReady || !(window as any).FB) {
      toast({ title: 'Aguarde', description: 'SDK do Facebook ainda carregando...', variant: 'destructive' });
      return;
    }
    setConnecting(true);
    (window as any).FB.login(
      (response: any) => {
        if (response.authResponse) {
          const code = response.authResponse.code;
          exchangeCodeForToken(code, OAUTH_REDIRECT_URI);
        } else {
          setConnecting(false);
          toast({ title: 'Cancelado', description: 'Processo de conexão cancelado', variant: 'destructive' });
        }
      },
      {
        config_id: fbConfigId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
      }
    );
  };

  const exchangeCodeForToken = async (code: string, redirectUri?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-cloud-exchange-token', {
        body: {
          code,
          tenant_id: tenantId,
          waba_id: wabaId || undefined,
          phone_number_id: phoneNumberId || undefined,
          redirect_uri: redirectUri || undefined,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: '🎉 Conectado!', description: 'WhatsApp Cloud API conectada com sucesso!' });
        await loadConfig();
      } else {
        toast({ title: 'Erro', description: data?.error || 'Falha na troca do token', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message || 'Erro ao conectar', variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!config?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('integration_whatsapp_cloud' as any)
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', (config as any).id);
      if (error) throw error;
      toast({ title: 'Desconectado', description: 'WhatsApp Cloud API desconectada' });
      setConfig({ ...config, is_active: false });
      setPhoneInfo(null);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    if (!testPhone.trim()) {
      toast({ title: 'Erro', description: 'Informe um número para teste', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-cloud-send', {
        body: { tenant_id: tenantId, template_name: 'hello_world', language_code: 'en_US', to_phone: testPhone },
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: 'Sucesso!', description: `Mensagem de teste enviada! ID: ${data.message_id}` });
      } else {
        toast({ title: 'Erro', description: data?.error || 'Falha no envio', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const isConnected = config?.is_active === true;

  return (
    <div className="space-y-4">
      {/* Conexão Rápida */}
      {!isConnected && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-5 w-5 text-primary" />
              Conexão Rápida (Recomendado)
            </CardTitle>
            <CardDescription>
              Conecte automaticamente sua conta WhatsApp Business com um clique.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleEmbeddedSignup} disabled={connecting || !fbSdkReady} size="lg" className="w-full sm:w-auto">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
              {connecting ? 'Conectando...' : 'Conectar WhatsApp'}
            </Button>
            {!fbSdkReady && <p className="text-xs text-muted-foreground mt-2">Carregando SDK do Facebook...</p>}
          </CardContent>
        </Card>
      )}

      {/* Status + Phone Info */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              WhatsApp Cloud API (Oficial)
              <Badge variant="default" className="ml-2">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
              </Badge>
            </CardTitle>
            <CardDescription>
              Integração com a API oficial do WhatsApp Business (Meta Cloud API).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Phone Info */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Número Conectado
                </h4>
                <Button variant="ghost" size="sm" onClick={loadPhoneInfo} disabled={loadingPhone}>
                  <RefreshCw className={`h-3 w-3 ${loadingPhone ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              {loadingPhone ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                </div>
              ) : phoneInfo ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Telefone:</span>{' '}
                    <span className="font-medium">{phoneInfo.display_phone_number || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Nome Verificado:</span>{' '}
                    <span className="font-medium">{phoneInfo.verified_name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Qualidade:</span>{' '}
                    <Badge variant={phoneInfo.quality_rating === 'GREEN' ? 'default' : 'destructive'} className="ml-1">
                      {phoneInfo.quality_rating || 'N/A'}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phone ID:</span>{' '}
                    <span className="font-mono text-xs">{config.phone_number_id}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Não foi possível carregar informações do telefone.</p>
              )}
            </div>

            <Button variant="destructive" onClick={handleDisconnect} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Desconectar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Templates Section */}
      {isConnected && <WhatsAppCloudTemplates tenantId={tenantId} />}

      {/* Teste de envio */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Teste de Envio</CardTitle>
            <CardDescription>Envie o template "hello_world" para verificar a conexão</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Telefone (ex: 5511999998888)" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              <Button onClick={handleTestSend} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Testar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webhook info */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuração do Webhook</CardTitle>
            <CardDescription>Configure no Meta for Developers para receber status de mensagens</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">URL do Webhook</Label>
              <Input
                readOnly
                value="https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-cloud-webhook"
                className="text-xs font-mono"
                onClick={(e) => {
                  (e.target as HTMLInputElement).select();
                  navigator.clipboard.writeText("https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-cloud-webhook");
                  toast({ title: 'Copiado!' });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Verify Token</Label>
              <Input
                readOnly
                value="orderzap_cloud_verify"
                className="text-xs font-mono"
                onClick={(e) => {
                  (e.target as HTMLInputElement).select();
                  navigator.clipboard.writeText("orderzap_cloud_verify");
                  toast({ title: 'Copiado!' });
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              No Meta for Developers, vá em WhatsApp → Configuration → Webhook e cole a URL acima. Marque o campo <strong>messages</strong>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
