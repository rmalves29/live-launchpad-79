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
  QrCode as QrCodeIcon,
  Wifi,
  WifiOff,
  MessageCircle,
  Zap,
  Shield
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

const POLLING_INTERVAL_MS = 3000;
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (tenant?.id) {
      loadWhatsAppIntegration();
    }
  }, [tenant?.id]);

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

    if (data.connected === true || data.status === 'connected' || data.user) {
      setWhatsappStatus({
        connected: true,
        status: 'connected',
        message: data.message || 'WhatsApp conectado',
        user: data.user
      });
      return;
    }

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

    if (data.status === 'connecting') {
      setWhatsappStatus({
        connected: false,
        status: 'connecting',
        message: data.message || 'Conectando...'
      });
      return;
    }

    if (data.status === 'timeout') {
      setWhatsappStatus({
        connected: false,
        status: 'timeout',
        message: data.message || 'Timeout ao gerar QR code'
      });
      return;
    }

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

  // Loading state
  if (loading && !serverUrl) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center animate-fade-in">
              <div className="relative inline-flex">
                <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              </div>
              <p className="mt-4 text-muted-foreground font-medium">Carregando...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No server URL configured
  if (!serverUrl) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
        <div className="container mx-auto p-6 max-w-4xl">
          {/* Header */}
          <div className="mb-8 animate-fade-in">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg">
                <Smartphone className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">Conexão WhatsApp</h1>
            </div>
            <p className="text-muted-foreground ml-14">
              Configure seu WhatsApp para automatizar mensagens
            </p>
          </div>

          <Card className="border-warning/30 bg-warning/5 animate-slide-up">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-warning">
                <div className="p-2 rounded-lg bg-warning/10">
                  <AlertCircle className="h-5 w-5" />
                </div>
                Configuração Necessária
              </CardTitle>
              <CardDescription>
                A URL do servidor WhatsApp precisa ser configurada
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert className="border-warning/30 bg-warning/5">
                <AlertCircle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-foreground">
                  Configure a URL do servidor WhatsApp nas <strong>Integrações</strong>. 
                  A URL deve apontar para o backend no Railway.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const getStatusConfig = () => {
    if (whatsappStatus?.connected) {
      return {
        gradient: 'from-green-500 to-emerald-500',
        bg: 'bg-green-500/10',
        border: 'border-green-500/30',
        text: 'text-green-600 dark:text-green-400',
        icon: Wifi,
        label: 'Conectado',
        pulse: true
      };
    }
    if (whatsappStatus?.status === 'connecting') {
      return {
        gradient: 'from-blue-500 to-cyan-500',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        text: 'text-blue-600 dark:text-blue-400',
        icon: Loader2,
        label: 'Conectando...',
        pulse: false
      };
    }
    if (whatsappStatus?.status === 'qr_ready') {
      return {
        gradient: 'from-purple-500 to-violet-500',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/30',
        text: 'text-purple-600 dark:text-purple-400',
        icon: QrCodeIcon,
        label: 'Aguardando QR',
        pulse: true
      };
    }
    return {
      gradient: 'from-gray-400 to-gray-500',
      bg: 'bg-muted',
      border: 'border-border',
      text: 'text-muted-foreground',
      icon: WifiOff,
      label: 'Desconectado',
      pulse: false
    };
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container mx-auto p-6 max-w-4xl">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg">
              <Smartphone className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Conexão WhatsApp</h1>
          </div>
          <p className="text-muted-foreground ml-14">
            Conecte seu WhatsApp para enviar mensagens automáticas
          </p>
        </div>

        {/* Status Card */}
        <Card className="mb-6 overflow-hidden animate-slide-up shadow-lg">
          <div className={`h-1.5 bg-gradient-to-r ${statusConfig.gradient}`} />
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${statusConfig.bg} ${statusConfig.border} border`}>
                  <StatusIcon className={`h-5 w-5 ${statusConfig.text} ${whatsappStatus?.status === 'connecting' ? 'animate-spin' : ''}`} />
                </div>
                <span className={statusConfig.text}>{statusConfig.label}</span>
              </CardTitle>
              {statusConfig.pulse && (
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-2.5 w-2.5 rounded-full ${whatsappStatus?.connected ? 'bg-green-500' : 'bg-purple-500'}`}>
                    <span className={`animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full ${whatsappStatus?.connected ? 'bg-green-400' : 'bg-purple-400'} opacity-75`} />
                  </span>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Connected State */}
            {whatsappStatus?.connected && (
              <div className="text-center space-y-6 animate-scale-in">
                <div className="relative p-8 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 border border-green-200/50 dark:border-green-800/50">
                  <div className="absolute top-4 right-4">
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">Online</span>
                    </div>
                  </div>
                  
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg glow-success">
                    <CheckCircle2 className="h-10 w-10 text-white" />
                  </div>
                  
                  <h3 className="text-xl font-semibold text-green-700 dark:text-green-300">
                    WhatsApp Conectado!
                  </h3>
                  <p className="text-green-600/80 dark:text-green-400/80 mt-2">
                    Seu WhatsApp está pronto para enviar mensagens automáticas
                  </p>
                  
                  {whatsappStatus.user && (
                    <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/50 dark:bg-black/20 border border-green-200/50 dark:border-green-700/30">
                      <Smartphone className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-mono text-green-700 dark:text-green-300">
                        {whatsappStatus.user.id?.split('@')[0] || 'N/A'}
                      </span>
                    </div>
                  )}
                </div>
                
                <Button 
                  variant="outline" 
                  onClick={handleDisconnect}
                  disabled={isReconnecting}
                  className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
                >
                  {isReconnecting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <WifiOff className="h-4 w-4 mr-2" />
                  )}
                  Desconectar
                </Button>
              </div>
            )}

            {/* QR Code State */}
            {whatsappStatus?.status === 'qr_ready' && whatsappStatus.qrCode && (
              <div className="text-center space-y-6 animate-scale-in">
                <div className="relative inline-block p-6 bg-white rounded-2xl shadow-xl">
                  <div className="absolute -top-3 -right-3 p-2 rounded-full bg-purple-500 text-white shadow-lg animate-float">
                    <QrCodeIcon className="h-4 w-4" />
                  </div>
                  <img 
                    src={whatsappStatus.qrCode} 
                    alt="QR Code WhatsApp" 
                    className="w-64 h-64 mx-auto rounded-lg"
                  />
                </div>
                
                <div className="max-w-md mx-auto space-y-3">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50 text-left">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Smartphone className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Abra o WhatsApp</p>
                      <p className="text-xs text-muted-foreground">Menu → Aparelhos conectados → Conectar</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O QR Code atualiza automaticamente a cada 30 segundos
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
              <div className="text-center space-y-4 animate-scale-in">
                <div className="p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/50 dark:to-cyan-950/50 border border-blue-200/50 dark:border-blue-800/50">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-blue-200 border-t-blue-500 animate-spin" />
                  <h3 className="text-xl font-semibold text-blue-700 dark:text-blue-300">
                    Conectando...
                  </h3>
                  <p className="text-blue-600/80 dark:text-blue-400/80 mt-2">
                    Aguarde enquanto estabelecemos a conexão
                  </p>
                </div>
              </div>
            )}

            {/* Error State */}
            {whatsappStatus?.status === 'error' && (
              <div className="text-center space-y-4 animate-scale-in">
                <Alert variant="destructive" className="text-left">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {whatsappStatus.error}
                  </AlertDescription>
                </Alert>
                <Button onClick={handleConnect} disabled={isReconnecting} className="btn-gradient-primary">
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
              <div className="text-center space-y-4 animate-scale-in">
                <Alert className="text-left border-warning/30 bg-warning/5">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <AlertDescription>
                    <strong>Backend desatualizado:</strong> O servidor WhatsApp precisa ser 
                    atualizado. Faça um redeploy no Railway com o novo código.
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
              <div className="text-center space-y-6 animate-scale-in">
                <div className="p-8 rounded-2xl bg-gradient-to-br from-muted/50 to-muted border border-border">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted-foreground/10 flex items-center justify-center">
                    <WifiOff className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">
                    WhatsApp Desconectado
                  </h3>
                  <p className="text-muted-foreground mt-2">
                    Conecte seu WhatsApp para começar a enviar mensagens
                  </p>
                </div>
                
                <Button 
                  onClick={handleConnect} 
                  disabled={isReconnecting}
                  size="lg"
                  className="btn-gradient-primary px-8"
                >
                  {isReconnecting ? (
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  ) : (
                    <QrCodeIcon className="h-5 w-5 mr-2" />
                  )}
                  Conectar WhatsApp
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <Card className="card-hover border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Mensagens Automáticas</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Envie confirmações e atualizações automaticamente
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Respostas Rápidas</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Responda seus clientes instantaneamente
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover border-border/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-green-500/10 text-green-600 dark:text-green-400">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Conexão Segura</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sua conta protegida com criptografia
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
