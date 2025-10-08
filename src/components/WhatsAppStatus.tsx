import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Smartphone, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WhatsAppStatusData {
  whatsapp?: {
    ready: boolean;
    clientReady: boolean;
    clientState: string;
    canSendMessages: boolean;
    readyToSend: string;
    phoneNumber: string;
  };
  tenant?: {
    id: string;
    slug: string;
  };
}

export default function WhatsAppStatus() {
  const [status, setStatus] = useState<WhatsAppStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverUrl, setServerUrl] = useState<string>('');
  const { tenant } = useTenant();

  useEffect(() => {
    loadServerUrl();
  }, [tenant?.id]);

  const loadServerUrl = async () => {
    if (!tenant?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('integration_whatsapp')
        .select('api_url')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      if (data?.api_url) {
        setServerUrl(data.api_url);
        checkStatus(data.api_url);
      }
    } catch (error) {
      console.error('Erro ao carregar URL do servidor:', error);
    }
  };

  const checkStatus = async (url?: string) => {
    const targetUrl = url || serverUrl;
    if (!targetUrl) return;

    setLoading(true);
    try {
      const response = await fetch(`${targetUrl}/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setStatus(data);
      
      if (data.whatsapp?.ready) {
        toast.success('WhatsApp conectado e pronto!');
      } else {
        toast.warning('WhatsApp não está conectado. Verifique o QR Code no servidor.');
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      setStatus(null);
      toast.error('Não foi possível conectar ao servidor WhatsApp. Certifique-se de que o servidor Node.js está rodando.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = () => {
    if (!status) return <XCircle className="h-5 w-5 text-destructive" />;
    if (status.whatsapp?.ready) return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    return <AlertCircle className="h-5 w-5 text-yellow-500" />;
  };

  const getStatusBadge = () => {
    if (!status) return <Badge variant="destructive">Offline</Badge>;
    if (status.whatsapp?.ready) return <Badge className="bg-green-500">Conectado</Badge>;
    return <Badge variant="secondary">Aguardando</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            <CardTitle>Status do WhatsApp</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkStatus()}
            disabled={loading || !serverUrl}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
        <CardDescription>
          Verifique a conexão com o servidor WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 p-4 border rounded-lg">
          {getStatusIcon()}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">Status da Conexão</span>
              {getStatusBadge()}
            </div>
            <p className="text-sm text-muted-foreground">
              {!status && 'Servidor não está respondendo'}
              {status && status.whatsapp?.readyToSend}
            </p>
          </div>
        </div>

        {status?.whatsapp && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Estado do Cliente:</span>
              <span className="font-medium">{status.whatsapp.clientState}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Pode Enviar Mensagens:</span>
              <span className="font-medium">{status.whatsapp.canSendMessages ? '✅ Sim' : '❌ Não'}</span>
            </div>
            {status.whatsapp.phoneNumber && status.whatsapp.phoneNumber !== 'N/A' && (
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Número Conectado:</span>
                <span className="font-medium">{status.whatsapp.phoneNumber}</span>
              </div>
            )}
          </div>
        )}

        {serverUrl && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            <span className="font-medium">Servidor:</span> {serverUrl}
          </div>
        )}

        {!serverUrl && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
            ⚠️ Configure a URL do servidor WhatsApp em Integrações
          </div>
        )}

        {!status && serverUrl && (
          <div className="text-sm bg-yellow-500/10 p-3 rounded-lg space-y-2">
            <p className="font-medium">💡 Servidor não está respondendo</p>
            <p className="text-muted-foreground">Certifique-se de que:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-2">
              <li>O servidor Node.js está rodando</li>
              <li>Execute: <code className="bg-background px-1 rounded">node server-whatsapp-individual-no-env.js</code></li>
              <li>Escaneie o QR Code no terminal</li>
              <li>A porta configurada está correta ({serverUrl})</li>
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
