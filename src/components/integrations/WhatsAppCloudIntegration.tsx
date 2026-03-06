import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { MessageSquare, Save, CheckCircle2, AlertCircle, Loader2, ExternalLink, Eye, EyeOff, Send, HelpCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  tenantId: string;
}

export default function WhatsAppCloudIntegration({ tenantId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [showToken, setShowToken] = useState(false);

  // Form fields
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [testPhone, setTestPhone] = useState('');

  useEffect(() => {
    if (tenantId) loadConfig();
  }, [tenantId]);

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
      {/* Guia Passo a Passo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HelpCircle className="h-5 w-5" />
            Como obter as credenciais?
          </CardTitle>
          <CardDescription>Siga o passo a passo abaixo para configurar a API oficial do WhatsApp</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="step1">
              <AccordionTrigger className="text-sm font-medium">
                1️⃣ Criar App no Meta for Developers
              </AccordionTrigger>
              <AccordionContent className="text-sm space-y-2 text-muted-foreground">
                <p>Acesse <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-primary underline">developers.facebook.com/apps</a> e clique em <strong>"Criar App"</strong>.</p>
                <p>Selecione: Tipo → <strong>"Outro"</strong>, Categoria → <strong>"Negócio"</strong>.</p>
                <p>Após criar, no painel lateral, clique em <strong>"Adicionar Produto"</strong> e escolha <strong>WhatsApp</strong>.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step2">
              <AccordionTrigger className="text-sm font-medium">
                2️⃣ Obter o Phone Number ID
              </AccordionTrigger>
              <AccordionContent className="text-sm space-y-2 text-muted-foreground">
                <p>No menu lateral, vá em <strong>WhatsApp → API Setup</strong>.</p>
                <p>Você verá o <strong>Phone Number ID</strong> logo abaixo do número de teste.</p>
                <p>Para usar seu próprio número, clique em <strong>"Add phone number"</strong> e siga a verificação por SMS/ligação.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step3">
              <AccordionTrigger className="text-sm font-medium">
                3️⃣ Gerar o Access Token (Permanente)
              </AccordionTrigger>
              <AccordionContent className="text-sm space-y-2 text-muted-foreground">
                <p><strong>Token temporário (para teste):</strong> Na página API Setup, clique em "Generate" — válido por 24h.</p>
                <Separator className="my-2" />
                <p><strong>Token permanente (recomendado):</strong></p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Acesse <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="text-primary underline">Business Settings → System Users</a></li>
                  <li>Crie um <strong>System User</strong> com role "Admin"</li>
                  <li>Clique em <strong>"Generate Token"</strong></li>
                  <li>Selecione o App criado no passo 1</li>
                  <li>Marque as permissões: <code className="bg-muted px-1 rounded text-xs">whatsapp_business_management</code> e <code className="bg-muted px-1 rounded text-xs">whatsapp_business_messaging</code></li>
                  <li>Copie o token gerado — ele <strong>não expira</strong></li>
                </ol>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step4">
              <AccordionTrigger className="text-sm font-medium">
                4️⃣ Obter o WABA ID (opcional)
              </AccordionTrigger>
              <AccordionContent className="text-sm space-y-2 text-muted-foreground">
                <p>Acesse <a href="https://business.facebook.com/settings/whatsapp-business-accounts" target="_blank" rel="noopener noreferrer" className="text-primary underline">Business Settings → WhatsApp Accounts</a>.</p>
                <p>Clique na conta desejada — o <strong>WABA ID</strong> aparece na URL e nos detalhes.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step5">
              <AccordionTrigger className="text-sm font-medium">
                5️⃣ Preencher os campos abaixo e conectar
              </AccordionTrigger>
              <AccordionContent className="text-sm space-y-2 text-muted-foreground">
                <p>Cole o <strong>Access Token</strong>, <strong>Phone Number ID</strong> e <strong>WABA ID</strong> nos campos abaixo.</p>
                <p>Clique em <strong>"Conectar"</strong> e depois teste com o botão de envio.</p>
                <p>Por último, configure o <strong>Webhook</strong> no Meta (instruções aparecem após conectar).</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            WhatsApp Cloud API (Oficial)
            {isConnected ? (
              <Badge variant="default" className="ml-2">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
              </Badge>
            ) : (
              <Badge variant="secondary" className="ml-2">
                <AlertCircle className="h-3 w-3 mr-1" /> Desconectado
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Integração com a API oficial do WhatsApp Business (Meta Cloud API) para envio de templates e recebimento de status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Credenciais */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="access-token">Access Token (Permanente)</Label>
              <div className="flex gap-2">
                <Input
                  id="access-token"
                  type={showToken ? 'text' : 'password'}
                  placeholder="EAAxxxxxxx..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                />
                <Button variant="outline" size="icon" onClick={() => setShowToken(!showToken)}>
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="phone-number-id">Phone Number ID</Label>
              <Input
                id="phone-number-id"
                placeholder="Ex: 123456789012345"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="waba-id">WABA ID (opcional)</Label>
              <Input
                id="waba-id"
                placeholder="Ex: 123456789012345"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="business-name">Nome do Negócio (opcional)</Label>
              <Input
                id="business-name"
                placeholder="Ex: Minha Loja"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            {isConnected ? (
              <Button variant="destructive" onClick={handleDisconnect} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Desconectar
              </Button>
            ) : (
              <Button onClick={handleConnect} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Conectar
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            <a
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Obter credenciais no Meta for Developers
            </a>
          </div>
        </CardContent>
      </Card>

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
