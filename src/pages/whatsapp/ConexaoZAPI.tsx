import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
  Shield,
  ExternalLink
} from "lucide-react";
import { ZAPISettings } from "@/components/ZAPISettings";

interface WhatsAppStatus {
  connected: boolean;
  status: string;
  qrCode?: string;
  hasQR?: boolean;
  message?: string;
  error?: string;
  user?: { phone?: string };
}

const POLLING_INTERVAL_MS = 5000;

export default function ConexaoZAPI() {
  const { tenant } = useTenantContext();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [hasZAPIConfig, setHasZAPIConfig] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [loadingQR, setLoadingQR] = useState(false);
  
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
      checkZAPIConfig();
    }
  }, [tenant?.id]);

  useEffect(() => {
    if (hasZAPIConfig && tenant?.id) {
      startPolling();
      return () => stopPolling();
    }
  }, [hasZAPIConfig, tenant?.id]);

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

  const checkZAPIConfig = async () => {
    if (!tenant?.id) return;

    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('integration_whatsapp')
        .select('zapi_instance_id, zapi_token, provider, is_active')
        .eq('tenant_id', tenant.id)
        .eq('provider', 'zapi')
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      const hasConfig = !!(data?.zapi_instance_id && data?.zapi_token);
      setHasZAPIConfig(hasConfig);

      if (!hasConfig) {
        setWhatsappStatus(null);
      }
    } catch (error: any) {
      console.error('Error checking Z-API config:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    if (!tenant?.id || !mountedRef.current) return;

    try {
      const response = await fetch(
        'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-proxy',
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

      if (!mountedRef.current) return;

      const data = await response.json();

      if (data.error) {
        // Se temos QR Code ativo, não substituir pelo erro - apenas atualizar se conectar
        setWhatsappStatus(prev => {
          if (prev?.status === 'qr_ready' && prev?.qrCode) {
            // Preserva o QR Code atual - usuário ainda pode estar escaneando
            return prev;
          }
          return {
            connected: false,
            status: 'error',
            error: data.error,
            message: data.message
          };
        });
        return;
      }

      // Se está conectado, limpa o QR Code e atualiza o status
      if (data.connected) {
        setWhatsappStatus({
          connected: true,
          status: data.status,
          message: data.message,
          user: data.user
        });
      } else {
        // Se não está conectado, preserva o QR Code se existir
        setWhatsappStatus(prev => {
          if (prev?.status === 'qr_ready' && prev?.qrCode) {
            // Mantém o QR Code ativo para o usuário escanear
            return prev;
          }
          return {
            connected: false,
            status: data.status || 'disconnected',
            message: data.message,
            user: data.user
          };
        });
      }

    } catch (error: any) {
      if (!mountedRef.current) return;
      console.error('Error checking status:', error);
    }
  };

  const getQRCode = async () => {
    if (!tenant?.id) return;

    try {
      setLoadingQR(true);

      const response = await fetch(
        'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-proxy',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4'
          },
          body: JSON.stringify({
            action: 'qr-code',
            tenant_id: tenant.id
          })
        }
      );

      const data = await response.json();

      if (data.qrCode) {
        setWhatsappStatus(prev => ({
          ...prev,
          connected: false,
          status: 'qr_ready',
          qrCode: data.qrCode,
          hasQR: true,
          message: 'Escaneie o QR Code com seu WhatsApp'
        }));

        toast({
          title: "QR Code gerado",
          description: "Escaneie com seu WhatsApp",
        });
      } else if (data.error) {
        toast({
          title: "Erro",
          description: data.message || data.error,
          variant: "destructive"
        });
      }

    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao obter QR Code",
        variant: "destructive"
      });
    } finally {
      setLoadingQR(false);
    }
  };

  const handleDisconnect = async () => {
    if (!tenant?.id) return;

    try {
      setIsReconnecting(true);

      const response = await fetch(
        'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-proxy',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4`,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4'
          },
          body: JSON.stringify({
            action: 'disconnect',
            tenant_id: tenant.id
          })
        }
      );

      setWhatsappStatus({
        connected: false,
        status: 'disconnected',
        message: 'WhatsApp desconectado'
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
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <p className="mt-4 text-muted-foreground">Carregando...</p>
            </div>
          </div>
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
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 text-white shadow-lg">
              <Smartphone className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">WhatsApp Z-API</h1>
          </div>
          <p className="text-muted-foreground ml-14">
            Conecte seu WhatsApp usando Z-API
          </p>
        </div>

        {/* Configuration Card */}
        <div className="mb-6">
          <ZAPISettings />
        </div>

        {/* Connection Card */}
        {hasZAPIConfig && (
          <Card className="overflow-hidden shadow-lg">
            <div className={`h-1.5 bg-gradient-to-r ${statusConfig.gradient}`} />
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${statusConfig.bg} ${statusConfig.border} border`}>
                    <StatusIcon className={`h-5 w-5 ${statusConfig.text}`} />
                  </div>
                  <span className={statusConfig.text}>{statusConfig.label}</span>
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkStatus}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Atualizar
                </Button>
              </div>
              {whatsappStatus?.user?.phone && (
                <CardDescription className="ml-14">
                  Número: {whatsappStatus.user.phone}
                </CardDescription>
              )}
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Connected State */}
              {whatsappStatus?.connected && (
                <div className="space-y-4">
                  <Alert className="border-green-500/30 bg-green-500/5">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <AlertDescription className="text-foreground">
                      WhatsApp conectado e pronto para enviar mensagens!
                    </AlertDescription>
                  </Alert>
                  
                  <Button 
                    variant="destructive" 
                    onClick={handleDisconnect}
                    disabled={isReconnecting}
                    className="w-full"
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
                <div className="space-y-4">
                  <div className="flex flex-col items-center p-6 bg-white rounded-xl">
                    <img 
                      src={whatsappStatus.qrCode} 
                      alt="QR Code WhatsApp"
                      className="w-64 h-64"
                    />
                  </div>
                  <p className="text-center text-sm text-muted-foreground">
                    Abra o WhatsApp no celular → Menu → Aparelhos conectados → Conectar aparelho
                  </p>
                </div>
              )}

              {/* Disconnected State */}
              {(!whatsappStatus || whatsappStatus.status === 'disconnected') && (
                <div className="space-y-4">
                  <Alert className="border-muted">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      WhatsApp não conectado. Clique em "Gerar QR Code" para conectar.
                    </AlertDescription>
                  </Alert>
                  
                  <Button 
                    onClick={getQRCode}
                    disabled={loadingQR}
                    className="w-full"
                  >
                    {loadingQR ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <QrCodeIcon className="h-4 w-4 mr-2" />
                    )}
                    Gerar QR Code
                  </Button>
                </div>
              )}

              {/* Error State */}
              {whatsappStatus?.status === 'error' && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {whatsappStatus.error || whatsappStatus.message || 'Erro desconhecido'}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Mensagens Automáticas</h3>
                <p className="text-xs text-muted-foreground">Envie mensagens automaticamente</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Alta Disponibilidade</h3>
                <p className="text-xs text-muted-foreground">Infraestrutura Z-API</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Conexão Segura</h3>
                <p className="text-xs text-muted-foreground">API criptografada</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
