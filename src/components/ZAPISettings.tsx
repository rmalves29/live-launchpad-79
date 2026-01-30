import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { MessageSquare, Save, CheckCircle2, AlertCircle, ExternalLink, Eye, EyeOff, Loader2, QrCode, RefreshCw, Bell, BellOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

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

  useEffect(() => {
    loadIntegration();
  }, [tenant?.id]);

  const loadIntegration = async () => {
    if (!tenant?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integration_whatsapp')
        .select('id, zapi_instance_id, zapi_token, zapi_client_token, provider, is_active, connected_phone, send_item_added_msg, send_paid_order_msg, send_product_canceled_msg, send_out_of_stock_msg')
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

  const handleToggleFlag = (flag: keyof MessageFlags) => {
    setMessageFlags(prev => ({
      ...prev,
      [flag]: !prev[flag]
    }));
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
