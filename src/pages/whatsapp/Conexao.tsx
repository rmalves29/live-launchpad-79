import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabaseTenant } from "@/lib/supabase-tenant";
import { useTenantContext } from "@/contexts/TenantContext";
import { 
  Smartphone, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  QrCode as QrCodeIcon
} from "lucide-react";

interface WhatsAppStatus {
  connected: boolean;
  status: string;
  qrCode?: string;
  hasQR?: boolean;
  message?: string;
  error?: string;
  user?: any;
}

const POLLING_INTERVAL_MS = 3000; // Baileys é mais rápido
const MAX_RETRIES = 5;

export default function ConexaoWhatsApp() {
  const { tenant } = useTenantContext();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Load integration on tenant change
  useEffect(() => {
    if (tenant?.id) {
      loadWhatsAppIntegration();
    }
  }, [tenant?.id]);

  // Start polling when serverUrl is available
  useEffect(() => {
    if (serverUrl && tenant?.id) {
      startPolling();
      return () => stopPolling();
    }
  }, [serverUrl, tenant?.id]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    checkStatus();
    pollingRef.current = setInterval(() => {
      if (mountedRef.current) {
        checkStatus();
      }
    }, POLLING_INTERVAL_MS);
  }, []);

  const loadWhatsAppIntegration = async () => {
    if (!tenant?.id) return;

    try {
      setLoading(true);
      
      const { data, error } = await supabaseTenant
        .from('integration_whatsapp')
        .select('api_url, is_active')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Create integration automatically
        const { error: insertError } = await supabaseTenant
          .from('integration_whatsapp')
          .insert({
            tenant_id: tenant.id,
            instance_name: `whatsapp_${tenant.slug}`,
            webhook_secret: crypto.randomUUID(),
            api_url: '',
            is_active: true
          });

        if (insertError) {
          toast({
            title: "Erro ao criar integração",
            description: "Por favor, configure a URL do servidor.",
            variant: "destructive"
          });
        }
        return;
      }

      if (!data?.api_url) {
        toast({
          title: "URL não configurada",
          description: "Configure a URL do servidor WhatsApp nas configurações.",
        });
        return;
      }

      setServerUrl(data.api_url);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao carregar configuração",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    if (!serverUrl || !tenant?.id || !mountedRef.current) return;

    try {
      // Use action 'status' para checar, 'start' para conectar
      const { data, error } = await supabaseTenant.functions.invoke(
        'whatsapp-proxy',
        {
          body: {
            action: 'status',
            tenant_id: tenant.id
          }
        }
      );

      if (!mountedRef.current) return;

      if (error) {
        // Fallback direto se edge function falhar
        try {
          const directResponse = await fetch(
            `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-proxy`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4`,
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4'
              },
              body: JSON.stringify({
                action: 'status',
                tenant_id: tenant.id
              })
            }
          );
          
          const responseData = await directResponse.json();
          handleStatusResponse(responseData);
          return;
        } catch {
          setRetryCount(prev => prev + 1);
          if (retryCount >= MAX_RETRIES) {
            setWhatsappStatus({
              connected: false,
              status: 'error',
              error: 'Falha ao conectar após múltiplas tentativas'
            });
          }
          return;
        }
      }

      handleStatusResponse(data);
      setRetryCount(0);

    } catch (error: any) {
      if (!mountedRef.current) return;
      
      setWhatsappStatus({
        connected: false,
        status: 'error',
        error: error.message || 'Erro ao verificar status'
      });
    }
  };

  const handleStatusResponse = (data: any) => {
    if (!data) return;

    // Handle errors
    if (data.error) {
      const isBackendOutdated = data.status === 'backend_outdated' || 
        data.error?.includes('não encontrada');
      
      setWhatsappStatus({
        connected: false,
        status: isBackendOutdated ? 'backend_outdated' : 'error',
        error: data.error,
        message: data.message
      });
      return;
    }

    // Handle connected - Baileys retorna user quando conectado
    if (data.connected === true || data.status === 'connected' || data.user) {
      setWhatsappStatus({
        connected: true,
        status: 'connected',
        message: data.message || 'WhatsApp conectado',
        user: data.user
      });
      return;
    }

    // Handle QR code ready - Baileys usa 'qr' ou 'hasQR'
    if (data.qr || data.hasQR || data.status === 'waiting_qr' || data.status === 'qr_ready') {
      setWhatsappStatus({
        connected: false,
        status: 'qr_ready',
        qrCode: data.qr || data.qrCode,
        hasQR: data.hasQR,
        message: data.message || 'Escaneie o QR Code'
      });
      return;
    }

    // Handle connecting state
    if (data.status === 'connecting') {
      setWhatsappStatus({
        connected: false,
        status: 'connecting',
        message: data.message || 'Conectando...'
      });
      return;
    }

    // Handle timeout
    if (data.status === 'timeout') {
      setWhatsappStatus({
        connected: false,
        status: 'timeout',
        message: data.message || 'Timeout ao gerar QR code'
      });
      return;
    }

    // Default: disconnected
    setWhatsappStatus({
      connected: false,
      status: data.status || 'disconnected',
      message: data.message
    });
  };

  const handleConnect = async () => {
    if (!serverUrl || !tenant?.id || isReconnecting) return;

    try {
      setIsReconnecting(true);
      
      toast({
        title: "Iniciando sessão",
        description: "Aguarde o QR Code...",
      });

      // Usar action 'start' para iniciar sessão no Baileys
      const { data, error } = await supabaseTenant.functions.invoke(
        'whatsapp-proxy',
        {
          body: {
            action: 'start',
            tenant_id: tenant.id
          }
        }
      );

      if (error) throw error;

      // Processar resposta imediata
      if (data) {
        handleStatusResponse(data);
      }

      toast({
        title: "Sessão iniciada",
        description: data?.qr ? "Escaneie o QR Code" : "Aguardando QR Code...",
      });

    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao iniciar sessão",
        variant: "destructive"
      });
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!tenant?.id) return;

    try {
      setIsReconnecting(true);
      
      const { error } = await supabaseTenant.functions.invoke(
        'whatsapp-proxy',
        {
          body: {
            action: 'stop',
            tenant_id: tenant.id
          }
        }
      );

      if (error) throw error;

      setWhatsappStatus({
        connected: false,
        status: 'disconnected',
        message: 'Sessão encerrada'
      });

      toast({
        title: "Desconectado",
        description: "Sessão WhatsApp encerrada.",
      });

    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsReconnecting(false);
    }
  };

  // Render loading state
  if (loading && !serverUrl) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        </div>
      </div>
    );
  }

  // Render no server URL
  if (!serverUrl) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Smartphone className="h-8 w-8" />
            Conexão WhatsApp
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <AlertCircle className="h-5 w-5" />
              Configuração Necessária
            </CardTitle>
            <CardDescription>
              A URL do servidor WhatsApp precisa ser configurada
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Configure a URL do servidor WhatsApp nas configurações de integração.
                A URL deve apontar para o backend no Railway.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render main content
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Smartphone className="h-8 w-8" />
          Conexão WhatsApp
        </h1>
        <p className="text-muted-foreground mt-2">
          Conecte seu WhatsApp para enviar mensagens automáticas
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {whatsappStatus?.connected ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-green-600">Conectado</span>
              </>
            ) : whatsappStatus?.status === 'connecting' ? (
              <>
                <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                <span className="text-blue-600">Conectando...</span>
              </>
            ) : whatsappStatus?.status === 'qr_ready' ? (
              <>
                <QrCodeIcon className="h-5 w-5 text-blue-500" />
                <span className="text-blue-600">Aguardando Escaneamento</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <span className="text-muted-foreground">Desconectado</span>
              </>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Connected State */}
          {whatsappStatus?.connected && (
            <div className="text-center space-y-4">
              <div className="p-6 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <h3 className="text-lg font-medium text-green-700 dark:text-green-300">
                  WhatsApp Conectado!
                </h3>
                <p className="text-green-600 dark:text-green-400 mt-2">
                  Você pode enviar mensagens automáticas.
                </p>
                {whatsappStatus.user && (
                  <p className="text-sm text-green-500 mt-1">
                    Número: {whatsappStatus.user.id?.split('@')[0] || 'N/A'}
                  </p>
                )}
              </div>
              <Button 
                variant="destructive" 
                onClick={handleDisconnect}
                disabled={isReconnecting}
              >
                {isReconnecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Desconectar
              </Button>
            </div>
          )}

          {/* QR Code State */}
          {whatsappStatus?.status === 'qr_ready' && whatsappStatus.qrCode && (
            <div className="text-center space-y-4">
              <div className="inline-block p-4 bg-white rounded-lg shadow-lg">
                <img 
                  src={whatsappStatus.qrCode} 
                  alt="QR Code WhatsApp" 
                  className="w-64 h-64 mx-auto"
                />
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Abra o WhatsApp no celular → Menu → Aparelhos conectados → Conectar
                </p>
                <p className="text-sm text-muted-foreground">
                  O QR Code atualiza automaticamente.
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={handleConnect}
                disabled={isReconnecting}
              >
                {isReconnecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Gerar Novo QR Code
              </Button>
            </div>
          )}

          {/* Connecting State */}
          {whatsappStatus?.status === 'connecting' && (
            <div className="text-center space-y-4">
              <div className="p-6 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <Loader2 className="h-12 w-12 mx-auto mb-4 text-blue-500 animate-spin" />
                <h3 className="text-lg font-medium text-blue-700 dark:text-blue-300">
                  Conectando...
                </h3>
                <p className="text-blue-600 dark:text-blue-400 mt-2">
                  Aguarde enquanto estabelecemos a conexão.
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {whatsappStatus?.status === 'error' && (
            <div className="text-center space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {whatsappStatus.error}
                </AlertDescription>
              </Alert>
              <Button onClick={handleConnect} disabled={isReconnecting}>
                {isReconnecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Tentar Novamente
              </Button>
            </div>
          )}

          {/* Backend Outdated State */}
          {whatsappStatus?.status === 'backend_outdated' && (
            <div className="text-center space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Backend desatualizado:</strong> O servidor WhatsApp precisa ser 
                  atualizado. Faça um redeploy no Railway com o novo código Baileys.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Disconnected State */}
          {!whatsappStatus?.connected && 
           !whatsappStatus?.qrCode && 
           whatsappStatus?.status !== 'connecting' &&
           whatsappStatus?.status !== 'error' &&
           whatsappStatus?.status !== 'backend_outdated' && (
            <div className="text-center space-y-4">
              <div className="p-6 bg-muted rounded-lg">
                <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium">
                  WhatsApp Desconectado
                </h3>
                <p className="text-muted-foreground mt-2">
                  Clique no botão abaixo para conectar.
                </p>
              </div>
              <Button onClick={handleConnect} disabled={isReconnecting}>
                {isReconnecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <QrCodeIcon className="h-4 w-4 mr-2" />
                )}
                Conectar WhatsApp
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
