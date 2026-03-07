import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { MessageSquare, Save, CheckCircle2, AlertCircle, Loader2, ExternalLink, Eye, EyeOff, Send, HelpCircle, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/lib/supabasePublic';

interface Props {
  tenantId: string;
}

// Facebook App ID (publishable, safe to use client-side)
const FB_APP_ID = "1833875230349524";
const FB_CONFIG_ID = "2178957892873201";
const EMBEDDED_REDIRECT_URI = `${SUPABASE_URL}/functions/v1/whatsapp-cloud-exchange-token`;

export default function WhatsAppCloudIntegration({ tenantId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [showToken, setShowToken] = useState(false);
  const [fbSdkReady, setFbSdkReady] = useState(false);

  // Form fields
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [testPhone, setTestPhone] = useState('');

  // Load Facebook SDK
  useEffect(() => {
    if (document.getElementById('facebook-jssdk')) {
      setFbSdkReady(true);
      return;
    }

    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({
        appId: FB_APP_ID,
        cookie: true,
        xfbml: true,
        version: 'v21.0',
      });
      setFbSdkReady(true);
    };

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup not needed for SDK
    };
  }, []);

  useEffect(() => {
    if (tenantId) loadConfig();
  }, [tenantId]);

  // Listen for Embedded Signup messages
  const handleMessage = useCallback(async (event: MessageEvent) => {
    if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;

    try {
      if (typeof event.data === 'string') {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP') {
          const { phone_number_id: pnId, waba_id: wId } = data.data || {};
          console.log('📱 Embedded Signup data:', data.data);

          if (pnId) setPhoneNumberId(pnId);
          if (wId) setWabaId(wId);
        }
      }
    } catch {
      // Not a JSON message, ignore
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

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
        setAccessToken((data as any).access_token || '');
        setPhoneNumberId((data as any).phone_number_id || '');
        setWabaId((data as any).waba_id || '');
        setBusinessName((data as any).business_name || '');
      }
    } catch (error: any) {
      console.error('Erro ao carregar config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmbeddedSignup = () => {
    if (!fbSdkReady || !(window as any).FB) {
      toast({ title: 'Aguarde', description: 'SDK do Facebook ainda carregando...', variant: 'destructive' });
      return;
    }

    setConnecting(true);

    (window as any).FB.login(
      (response: any) => {
        if (response.authResponse) {
          const code = response.authResponse.code;
          console.log('✅ Code obtido do Embedded Signup:', code);

          // Enviar code para a Edge Function trocar por token
          exchangeCodeForToken(code);
        } else {
          console.log('❌ Login cancelado pelo usuário');
          setConnecting(false);
          toast({ title: 'Cancelado', description: 'Processo de conexão cancelado', variant: 'destructive' });
        }
      },
      {
        config_id: FB_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        redirect_uri: EMBEDDED_REDIRECT_URI,
        extras: {
          setup: {},
          featureType: '',
          sessionInfoVersion: '3',
        },
      }
    );
  };

  const exchangeCodeForToken = async (code: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-cloud-exchange-token', {
        body: {
          code,
          tenant_id: tenantId,
          waba_id: wabaId || undefined,
          phone_number_id: phoneNumberId || undefined,
          redirect_uri: EMBEDDED_REDIRECT_URI,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: '🎉 Conectado!', description: 'WhatsApp Cloud API conectada com sucesso via Embedded Signup!' });
        // Reload config
        await loadConfig();
      } else {
        toast({ title: 'Erro', description: data?.error || 'Falha na troca do token', variant: 'destructive' });
      }
    } catch (error: any) {
      console.error('Erro ao trocar code:', error);
      toast({ title: 'Erro', description: error.message || 'Erro ao conectar', variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    if (!accessToken.trim() || !phoneNumberId.trim()) {
      toast({ title: 'Erro', description: 'Access Token e Phone Number ID são obrigatórios', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        access_token: accessToken,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        business_name: businessName,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (config?.id) {
        const { error } = await supabase
          .from('integration_whatsapp_cloud' as any)
          .update(payload)
          .eq('id', (config as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_whatsapp_cloud' as any)
          .insert(payload);
        if (error) throw error;
      }

      toast({ title: 'Sucesso', description: 'WhatsApp Cloud API conectada!' });
      loadConfig();
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
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
        body: {
          tenant_id: tenantId,
          template_name: 'hello_world',
          language_code: 'en_US',
          to_phone: testPhone,
        },
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
      {/* Conexão Rápida - Embedded Signup */}
      {!isConnected && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-5 w-5 text-primary" />
              Conexão Rápida (Recomendado)
            </CardTitle>
            <CardDescription>
              Conecte automaticamente sua conta WhatsApp Business com um clique. O sistema obterá as credenciais automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleEmbeddedSignup}
              disabled={connecting || !fbSdkReady}
              size="lg"
              className="w-full sm:w-auto"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <MessageSquare className="h-4 w-4 mr-2" />
              )}
              {connecting ? 'Conectando...' : 'Conectar WhatsApp'}
            </Button>
            {!fbSdkReady && (
              <p className="text-xs text-muted-foreground mt-2">Carregando SDK do Facebook...</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status card when connected */}
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
              Integração com a API oficial do WhatsApp Business (Meta Cloud API) para envio de templates e recebimento de status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleDisconnect} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Desconectar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Teste de envio */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Teste de Envio</CardTitle>
            <CardDescription>Envie o template "hello_world" para verificar a conexão</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Telefone (ex: 5511999998888)"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
              />
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
                  toast({ title: 'Copiado!', description: 'URL copiada para a área de transferência' });
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
