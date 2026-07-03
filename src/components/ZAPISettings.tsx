import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
 import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, Save, CheckCircle2, AlertCircle, ExternalLink, Eye, EyeOff, Loader2, QrCode, RefreshCw, Bell, BellOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

// Templates padrão
const DEFAULT_TEMPLATE_SOLICITACAO = `🛒 *Item adicionado ao pedido*

✅ {{produto}}
Qtd: *{{quantidade}}*
Valor: *R$ {{valor}}*

Posso te enviar o link para finalizar o pedido por aqui?

Responda *SIM* para receber o link. ✨`;

const DEFAULT_TEMPLATE_COM_LINK = `🛒 *Item adicionado ao pedido*

✅ {{produto}}
Qtd: *{{quantidade}}*
Valor: *R$ {{valor}}*

👉 Finalize seu pedido: {{link_checkout}}

Qualquer dúvida, estou à disposição! ✨`;

const DEFAULT_TEMPLATE_ITEM_ADDED = `🛒 *Item adicionado ao pedido*

✅ {{produto}}
Qtd: *{{quantidade}}*
Valor: *R$ {{valor}}*

Deseja receber o link para finalizar a compra?
Responda *SIM* para receber! ✨`;

const DEFAULT_CONFIRMATION_TEMPLATE = `Perfeito! 🎉

Aqui está o seu link exclusivo para finalizar a compra:

👉 {{checkout_url}}

Qualquer dúvida estou à disposição! ✨`;

interface ZAPIIntegration {
  id: string;
  zapi_instance_id: string | null;
  zapi_token: string | null;
  zapi_client_token: string | null;
  provider: string;
  is_active: boolean;
  connected_phone: string | null;
  send_item_added_msg: boolean;
  send_paid_order_msg: boolean;
  send_product_canceled_msg: boolean;
  send_out_of_stock_msg: boolean;
  template_item_added: string | null;
  item_added_confirmation_template: string | null;
  confirmation_timeout_minutes: number;
  // Proteção por consentimento (consent v2 — regras fixas no backend)
  consent_protection_enabled: boolean;
}

interface MessageFlags {
  send_item_added_msg: boolean;
  send_paid_order_msg: boolean;
  send_product_canceled_msg: boolean;
  send_out_of_stock_msg: boolean;
}

export function ZAPISettings() {
  const { toast } = useToast();
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [integration, setIntegration] = useState<ZAPIIntegration | null>(null);
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [clientToken, setClientToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showClientToken, setShowClientToken] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loadingQR, setLoadingQR] = useState(false);
  
  // Message flags state
  const [messageFlags, setMessageFlags] = useState<MessageFlags>({
    send_item_added_msg: true,
    send_paid_order_msg: true,
    send_product_canceled_msg: true,
    send_out_of_stock_msg: true,
  });
 
   // Confirmation message template (legacy mode)
   const [templateItemAdded, setTemplateItemAdded] = useState(DEFAULT_TEMPLATE_ITEM_ADDED);
   const [confirmationTemplate, setConfirmationTemplate] = useState(DEFAULT_CONFIRMATION_TEMPLATE);
   const [confirmationTimeout, setConfirmationTimeout] = useState(30);
   
   // Proteção por consentimento
   const [consentProtectionEnabled, setConsentProtectionEnabled] = useState(false);

   // Botão "Pagar Agora" na mensagem de Item Adicionado
   const [itemAddedButtonEnabled, setItemAddedButtonEnabled] = useState(true);
   const [itemAddedButtonLabel, setItemAddedButtonLabel] = useState('Pagar Agora');
   const [itemAddedButtonUrl, setItemAddedButtonUrl] = useState('');

  useEffect(() => {
    loadIntegration();
  }, [tenant?.id]);

  const loadIntegration = async () => {
    if (!tenant?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integration_whatsapp')
        .select('id, zapi_instance_id, zapi_token, zapi_client_token, provider, is_active, connected_phone, send_item_added_msg, send_paid_order_msg, send_product_canceled_msg, send_out_of_stock_msg, template_item_added, item_added_confirmation_template, confirmation_timeout_minutes, consent_protection_enabled, item_added_button_enabled, item_added_button_label, item_added_button_url')
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        const typedData = data as ZAPIIntegration;
        setIntegration(typedData);
        setInstanceId(typedData.zapi_instance_id || '');
        setToken(typedData.zapi_token || '');
        setClientToken(typedData.zapi_client_token || '');
        setMessageFlags({
          send_item_added_msg: typedData.send_item_added_msg ?? true,
          send_paid_order_msg: typedData.send_paid_order_msg ?? true,
          send_product_canceled_msg: typedData.send_product_canceled_msg ?? true,
          send_out_of_stock_msg: typedData.send_out_of_stock_msg ?? true,
        });
         // Usa o valor do banco se existir, senão mantém o default
         if (typedData.template_item_added) setTemplateItemAdded(typedData.template_item_added);
         if (typedData.item_added_confirmation_template) setConfirmationTemplate(typedData.item_added_confirmation_template);
         setConfirmationTimeout(typedData.confirmation_timeout_minutes || 30);
         // Proteção por consentimento - respeitar valor salvo (incluindo vazio/null)
         setConsentProtectionEnabled(typedData.consent_protection_enabled ?? false);
         // Botão "Pagar Agora"
         setItemAddedButtonEnabled((typedData as any).item_added_button_enabled ?? true);
         setItemAddedButtonLabel((typedData as any).item_added_button_label ?? 'Pagar Agora');
         setItemAddedButtonUrl((typedData as any).item_added_button_url ?? '');
      }
    } catch (error: any) {
      console.error('Error loading Z-API integration:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar integração Z-API',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tenant?.id) return;

    if (!instanceId.trim() || !token.trim()) {
      toast({
        title: 'Erro',
        description: 'Instance ID e Token são obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      const updateData = {
        zapi_instance_id: instanceId,
        zapi_token: token,
        zapi_client_token: clientToken || null,
        provider: 'zapi',
        updated_at: new Date().toISOString(),
        ...messageFlags,
         template_item_added: templateItemAdded || null,
         item_added_confirmation_template: confirmationTemplate || null,
         confirmation_timeout_minutes: confirmationTimeout,
         // Proteção por consentimento
         consent_protection_enabled: consentProtectionEnabled,
         // Botão "Pagar Agora"
         item_added_button_enabled: itemAddedButtonEnabled,
         item_added_button_label: (itemAddedButtonLabel || 'Pagar Agora').slice(0, 20),
          item_added_button_url: (() => {
            const v = (itemAddedButtonUrl || '').trim();
            if (!v) return null;
            if (/^https?:\/\//i.test(v)) return v;
            return `https://${v.replace(/^[a-z]{0,4}:?\/\//i, '')}`;
          })(),
      };

      if (integration?.id) {
        const { error } = await supabase
          .from('integration_whatsapp')
          .update(updateData)
          .eq('id', integration.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_whatsapp')
          .insert({
            tenant_id: tenant.id,
            ...updateData,
            instance_name: tenant.name || 'default',
            webhook_secret: crypto.randomUUID(),
            is_active: true
          });

        if (error) throw error;
      }

      toast({
        title: 'Sucesso',
        description: 'Configuração Z-API salva com sucesso',
      });

      loadIntegration();
    } catch (error: any) {
      console.error('Error saving Z-API integration:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar configuração',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGetQRCode = async () => {
    if (!tenant?.id || !instanceId || !token) {
      toast({
        title: 'Erro',
        description: 'Salve as credenciais Z-API primeiro',
        variant: 'destructive'
      });
      return;
    }

    setLoadingQR(true);
    setQrCode(null);
    try {
      const { data, error } = await supabase.functions.invoke('zapi-proxy', {
        body: { action: 'get_qr', tenant_id: tenant.id }
      });

      if (error) throw error;

      if (data?.qrCode) {
        setQrCode(data.qrCode);
      } else if (data?.status === 'connected') {
        toast({
          title: 'Já conectado',
          description: 'WhatsApp já está conectado nesta instância',
        });
      } else {
        toast({
          title: 'Aviso',
          description: data?.message || 'Não foi possível obter o QR Code',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      console.error('Error getting QR Code:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao obter QR Code',
        variant: 'destructive'
      });
    } finally {
      setLoadingQR(false);
    }
  };

  const handleToggleFlag = async (flag: keyof MessageFlags) => {
    if (!tenant?.id || !integration?.id) return;

    const newValue = !messageFlags[flag];
    
    // Update local state immediately for responsive UI
    setMessageFlags(prev => ({
      ...prev,
      [flag]: newValue
    }));

    // Save to database immediately
    try {
      const { error } = await supabase
        .from('integration_whatsapp')
        .update({ 
          [flag]: newValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', integration.id);

      if (error) throw error;

      toast({
        title: newValue ? 'Ativado' : 'Desativado',
        description: `Mensagem "${getFlagLabel(flag)}" ${newValue ? 'ativada' : 'desativada'}`,
      });
    } catch (error: any) {
      // Revert on error
      setMessageFlags(prev => ({
        ...prev,
        [flag]: !newValue
      }));
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar a configuração',
        variant: 'destructive'
      });
    }
  };

  const getFlagLabel = (flag: keyof MessageFlags): string => {
    const labels: Record<keyof MessageFlags, string> = {
      send_item_added_msg: 'Item Adicionado',
      send_paid_order_msg: 'Pagamento Confirmado',
      send_product_canceled_msg: 'Produto Cancelado',
      send_out_of_stock_msg: 'Produto Esgotado',
    };
    return labels[flag];
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Z-API
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Z-API WhatsApp
        </CardTitle>
        <CardDescription>
          Configure sua instância Z-API para integração WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        <div className="space-y-2">
          <Label htmlFor="instance-id">Instance ID</Label>
          <Input
            id="instance-id"
            placeholder="Ex: 3CCA7BAXXXXXXXXXXXX"
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="token">Token</Label>
          <div className="relative">
            <Input
              id="token"
              type={showToken ? 'text' : 'password'}
              placeholder="Seu token Z-API"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="client-token">Client-Token (Segurança)</Label>
          <div className="relative">
            <Input
              id="client-token"
              type={showClientToken ? 'text' : 'password'}
              placeholder="Token de segurança opcional"
              value={clientToken}
              onChange={(e) => setClientToken(e.target.value)}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowClientToken(!showClientToken)}
            >
              {showClientToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure o Client-Token no painel Z-API em Segurança e insira aqui o mesmo valor
          </p>
        </div>

        {integration?.provider === 'zapi' && (
          <div className="pt-4 border-t space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Badge variant={integration.is_active ? 'default' : 'secondary'}>
                {integration.is_active ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Configurado
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Inativo
                  </>
                )}
              </Badge>
            </div>
            
            {integration.connected_phone && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Número Conectado</span>
                <span className="text-sm text-muted-foreground">{integration.connected_phone}</span>
              </div>
            )}
          </div>
        )}

        {/* QR Code Section */}
        {integration?.provider === 'zapi' && instanceId && token && (
          <div className="pt-4 border-t space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">QR Code WhatsApp</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleGetQRCode}
                disabled={loadingQR}
              >
                {loadingQR ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <QrCode className="h-4 w-4 mr-2" />
                )}
                {loadingQR ? 'Gerando...' : 'Gerar QR Code'}
              </Button>
            </div>
            
            {qrCode && (
              <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-lg border">
                <img 
                  src={qrCode} 
                  alt="QR Code WhatsApp" 
                  className="w-64 h-64 object-contain"
                />
                <p className="text-sm text-muted-foreground text-center">
                  Escaneie com seu WhatsApp para conectar
                </p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleGetQRCode}
                  disabled={loadingQR}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar QR Code
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Message Flags Section */}
        <div className="pt-4 border-t space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Mensagens Automáticas</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Controle quais mensagens automáticas serão enviadas via WhatsApp
          </p>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="space-y-0.5">
                <Label htmlFor="send_item_added_msg" className="text-sm font-medium cursor-pointer">
                  Item Adicionado
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enviar quando um item for adicionado ao carrinho
                </p>
              </div>
              <Switch
                id="send_item_added_msg"
                checked={messageFlags.send_item_added_msg}
                onCheckedChange={() => handleToggleFlag('send_item_added_msg')}
              />
            </div>

            {messageFlags.send_item_added_msg && (
              <div className="ml-3 pl-4 border-l-2 border-primary/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="item_added_button_enabled" className="text-sm font-medium cursor-pointer">
                      Enviar com botão clicável
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Adiciona um botão de ação (ex.: "Pagar Agora") com link direto.
                    </p>
                  </div>
                  <Switch
                    id="item_added_button_enabled"
                    checked={itemAddedButtonEnabled}
                    onCheckedChange={setItemAddedButtonEnabled}
                  />
                </div>

                {itemAddedButtonEnabled && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="item_added_button_label" className="text-xs">Texto do botão (máx. 20)</Label>
                      <Input
                        id="item_added_button_label"
                        maxLength={20}
                        value={itemAddedButtonLabel}
                        onChange={(e) => setItemAddedButtonLabel(e.target.value)}
                        placeholder="Pagar Agora"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="item_added_button_url" className="text-xs">Link do botão</Label>
                      <Input
                        id="item_added_button_url"
                        type="url"
                        value={itemAddedButtonUrl}
                        onChange={(e) => setItemAddedButtonUrl(e.target.value)}
                        placeholder="Deixe em branco para usar o checkout padrão da loja"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Variáveis disponíveis no template ITEM_ADDED: <code>{'{{itens_pedido}}'}</code>, <code>{'{{total_pedido}}'}</code>, <code>{'{{numero_pedido}}'}</code>, <code>{'{{produto}}'}</code>, <code>{'{{quantidade}}'}</code>, <code>{'{{valor}}'}</code>, <code>{'{{codigo}}'}</code>.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}


            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="space-y-0.5">
                <Label htmlFor="send_paid_order_msg" className="text-sm font-medium cursor-pointer">
                  Pagamento Confirmado
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enviar quando o pagamento for confirmado
                </p>
              </div>
              <Switch
                id="send_paid_order_msg"
                checked={messageFlags.send_paid_order_msg}
                onCheckedChange={() => handleToggleFlag('send_paid_order_msg')}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="space-y-0.5">
                <Label htmlFor="send_product_canceled_msg" className="text-sm font-medium cursor-pointer">
                  Produto Cancelado
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enviar quando um produto for cancelado do pedido
                </p>
              </div>
              <Switch
                id="send_product_canceled_msg"
                checked={messageFlags.send_product_canceled_msg}
                onCheckedChange={() => handleToggleFlag('send_product_canceled_msg')}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="space-y-0.5">
                <Label htmlFor="send_out_of_stock_msg" className="text-sm font-medium cursor-pointer">
                  Produto Esgotado
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enviar quando um produto estiver sem estoque
                </p>
              </div>
              <Switch
                id="send_out_of_stock_msg"
                checked={messageFlags.send_out_of_stock_msg}
                onCheckedChange={() => handleToggleFlag('send_out_of_stock_msg')}
              />
            </div>
          </div>
        </div>

         {/* Proteção por Consentimento - NOVA SEÇÃO */}
         <div className="pt-4 border-t space-y-4">
           <div className="flex items-center justify-between">
             <div className="space-y-0.5">
               <div className="flex items-center gap-2">
                 <span className="text-sm font-medium">🛡️ Modo de Proteção por Consentimento</span>
               </div>
               <p className="text-xs text-muted-foreground">
                 Controla o envio de mensagens com base na resposta do cliente
               </p>
             </div>
             <Switch
               id="consent_protection"
               checked={consentProtectionEnabled}
               onCheckedChange={setConsentProtectionEnabled}
             />
           </div>

           <div className="p-3 bg-muted/30 rounded-lg border">
             <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
               <li>Ao enviar a mensagem de <strong>Item Adicionado</strong>, o sistema aguarda a resposta do cliente por <strong>20 minutos</strong>.</li>
               <li>Se o cliente responder (qualquer mensagem), fica liberado por <strong>3 dias</strong>.</li>
               <li>Se não responder, entra em bloqueio de <strong>1 hora</strong> — só recebe <strong>Pagamento Confirmado</strong> e <strong>Mensagem em Massa</strong>.</li>
               <li>Após os 3 dias, o consentimento expira automaticamente e o ciclo recomeça.</li>
             </ul>
           </div>
         </div>

         {/* Confirmation Message Template Section - LEGACY (quando proteção está OFF) */}
         {false && !consentProtectionEnabled && (
           <div className="pt-4 border-t space-y-4">
             <div className="flex items-center gap-2">
               <MessageSquare className="h-4 w-4 text-muted-foreground" />
               <span className="text-sm font-medium">Templates de Mensagem (Modo Padrão)</span>
             </div>
             <p className="text-xs text-muted-foreground">
               Configure os templates para o fluxo de confirmação em duas etapas
             </p>
             
             <div className="space-y-4 pl-4 border-l-2 border-muted">
               {/* Template Mensagem 1 - Item Adicionado */}
               <div className="space-y-2">
                 <Label className="text-sm font-medium">
                   📩 Mensagem 1 - Notificação de Item Adicionado
                 </Label>
                 <p className="text-xs text-muted-foreground">
                   Enviada quando um item é adicionado. Variáveis: {'{{'}<code>produto</code>{'}}'},
                   {'{{'}<code>quantidade</code>{'}}'},
                   {'{{'}<code>valor</code>{'}}'}
                 </p>
                 <Textarea
                   value={templateItemAdded}
                   onChange={(e) => setTemplateItemAdded(e.target.value)}
                   placeholder={`🛒 *Item adicionado ao pedido*

✅ {{produto}}
Qtd: *{{quantidade}}*
Valor: *R$ {{valor}}*

Deseja receber o link para finalizar a compra?
Responda *SIM* para receber! ✨`}
                   rows={8}
                   className="font-mono text-sm"
                 />
               </div>
               
               {/* Template Mensagem 2 - Confirmação com Link */}
               <div className="space-y-2">
                 <Label className="text-sm font-medium">
                   🔗 Mensagem 2 - Confirmação com Link
                 </Label>
                 <p className="text-xs text-muted-foreground">
                   Enviada após o cliente responder "SIM". Use {'{{'}<code>checkout_url</code>{'}}'}
                 </p>
                 <Textarea
                   value={confirmationTemplate}
                   onChange={(e) => setConfirmationTemplate(e.target.value)}
                   placeholder={`Perfeito! 🎉

Aqui está o seu link exclusivo para finalizar a compra:

👉 {{checkout_url}}

Qualquer dúvida estou à disposição! ✨`}
                   rows={6}
                   className="font-mono text-sm"
                 />
               </div>
             </div>
             
             <div className="space-y-2">
               <Label htmlFor="timeout">Tempo limite para resposta (minutos)</Label>
               <Input
                 id="timeout"
                 type="number"
                 min={5}
                 max={1440}
                 value={confirmationTimeout}
                 onChange={(e) => setConfirmationTimeout(parseInt(e.target.value) || 30)}
                 className="w-32"
               />
               <p className="text-xs text-muted-foreground">
                 Após esse tempo, o sistema não aguarda mais a resposta (padrão: 30 min)
               </p>
             </div>
           </div>
         )}
 
        <div className="flex items-center justify-between pt-4">
          <a 
            href="https://developer.z-api.io/docs" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            Documentação Z-API
          </a>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
