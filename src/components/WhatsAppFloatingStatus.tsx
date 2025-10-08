import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Wifi, WifiOff, QrCode, RefreshCw, Activity } from "lucide-react";
import { useTenantContext } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ConnectionLog {
  id: string;
  event_type: string;
  message: string | null;
  created_at: string;
}

export function WhatsAppFloatingStatus() {
  const { tenant } = useTenantContext();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<ConnectionLog[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    loadConnectionStatus();
    loadLogs();
    
    // Atualizar status a cada 30 segundos
    const interval = setInterval(loadConnectionStatus, 30000);
    return () => clearInterval(interval);
  }, [tenant]);

  const loadConnectionStatus = async () => {
    if (!tenant) return;
    
    try {
      const { data: integration } = await supabase
        .from("integration_whatsapp")
        .select("*")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .maybeSingle();

      if (integration?.api_url) {
        try {
          const response = await fetch(`${integration.api_url}/status/${tenant.id}`);
          const status = await response.json();
          setIsConnected(status.connected || false);
        } catch {
          setIsConnected(false);
        }
      } else {
        setIsConnected(false);
      }
    } catch (error) {
      console.error("Erro ao verificar status:", error);
      setIsConnected(false);
    }
  };

  const loadLogs = async () => {
    if (!tenant) return;

    const { data } = await supabase
      .from("whatsapp_connection_logs")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (data) setLogs(data);
  };

  const connectWhatsApp = async () => {
    if (!tenant) return;

    setIsLoading(true);
    setQrCode(null);

    try {
      const { data: integration, error: integrationError } = await supabase
        .from("integration_whatsapp")
        .select("api_url")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .maybeSingle();

      if (integrationError) {
        toast.error("Erro ao buscar configuração do WhatsApp");
        setIsLoading(false);
        return;
      }

      if (!integration || !integration.api_url) {
        toast.error("Servidor WhatsApp não configurado. Configure em Integração WhatsApp.");
        setIsLoading(false);
        return;
      }

      // Testar se o servidor está respondendo
      try {
        const testResponse = await fetch(`${integration.api_url}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000) // 5 segundos timeout
        });
        
        if (!testResponse.ok) {
          throw new Error("Servidor não responde");
        }
      } catch (healthError) {
        toast.error("Servidor WhatsApp não está rodando. Inicie o servidor primeiro.");
        logEvent("error", "Servidor WhatsApp não está rodando");
        setIsLoading(false);
        return;
      }

      const wsUrl = integration.api_url.replace("http", "ws") + `/ws/${tenant.id}`;
      const websocket = new WebSocket(wsUrl);

      let connectionTimeout = setTimeout(() => {
        websocket.close();
        toast.error("Timeout: Servidor WhatsApp não respondeu");
        logEvent("error", "Timeout ao conectar WebSocket");
        setIsLoading(false);
      }, 10000); // 10 segundos timeout

      websocket.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log("WebSocket conectado");
        toast.info("Aguardando QR Code...");
      };

      websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === "qr") {
          setQrCode(data.qr);
          toast.success("QR Code gerado! Escaneie com seu WhatsApp.");
          logEvent("qr_generated", "QR Code gerado");
        } else if (data.type === "ready") {
          setIsConnected(true);
          setQrCode(null);
          toast.success("WhatsApp conectado com sucesso!");
          logEvent("ready", "WhatsApp conectado");
          websocket.close();
          loadLogs();
        } else if (data.type === "error") {
          toast.error(`Erro: ${data.message}`);
          logEvent("error", data.message);
        }
      };

      websocket.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error("Erro no WebSocket:", error);
        toast.error("Erro ao conectar com servidor WhatsApp");
        logEvent("error", "Erro ao conectar WebSocket");
        setIsLoading(false);
      };

      websocket.onclose = () => {
        clearTimeout(connectionTimeout);
        setIsLoading(false);
      };

      setWs(websocket);
    } catch (error: any) {
      console.error("Erro ao conectar:", error);
      toast.error(error.message || "Erro ao conectar WhatsApp");
      logEvent("error", error.message || "Erro desconhecido");
      setIsLoading(false);
    }
  };

  const disconnectWhatsApp = async () => {
    if (!tenant) return;

    try {
      const { data: integration } = await supabase
        .from("integration_whatsapp")
        .select("api_url")
        .eq("tenant_id", tenant.id)
        .single();

      if (integration?.api_url) {
        await fetch(`${integration.api_url}/disconnect/${tenant.id}`, {
          method: "POST"
        });
        setIsConnected(false);
        toast.success("WhatsApp desconectado");
        logEvent("disconnected", "WhatsApp desconectado pelo usuário");
        loadLogs();
      }
    } catch (error) {
      toast.error("Erro ao desconectar");
    }
  };

  const logEvent = async (eventType: string, message: string) => {
    if (!tenant) return;

    await supabase.from("whatsapp_connection_logs").insert({
      tenant_id: tenant.id,
      event_type: eventType,
      message: message
    });
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "qr_generated":
        return <QrCode className="w-4 h-4 text-blue-500" />;
      case "ready":
        return <Wifi className="w-4 h-4 text-green-500" />;
      case "disconnected":
        return <WifiOff className="w-4 h-4 text-orange-500" />;
      case "error":
        return <Activity className="w-4 h-4 text-red-500" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  if (!tenant) return null;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-4 right-4 z-50 shadow-lg"
        >
          {isConnected ? (
            <Wifi className="w-4 h-4 mr-2 text-green-500" />
          ) : (
            <WifiOff className="w-4 h-4 mr-2 text-red-500" />
          )}
          WhatsApp
          <Badge 
            className={`ml-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
          >
            {isConnected ? "ON" : "OFF"}
          </Badge>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Conexão WhatsApp</SheetTitle>
          <SheetDescription>
            Gerencie a conexão do WhatsApp para {tenant?.name}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Aviso sobre configuração */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
              ℹ️ Antes de conectar:
            </h4>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
              <li>1. Configure o servidor em "WhatsApp → Integração WhatsApp"</li>
              <li>2. Certifique-se que o servidor Node.js está rodando</li>
              <li>3. Verifique se a URL do servidor está correta</li>
            </ul>
          </div>

          {/* Status da Conexão */}
          <div className="space-y-4">
            {!isConnected ? (
              <>
                <Button 
                  onClick={connectWhatsApp} 
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4 mr-2" />
                      Conectar WhatsApp
                    </>
                  )}
                </Button>

                {qrCode && (
                  <div className="flex flex-col items-center space-y-4 p-4 bg-secondary rounded-lg">
                    <p className="font-medium text-sm">Escaneie este QR Code:</p>
                    <img 
                      src={qrCode} 
                      alt="QR Code WhatsApp" 
                      className="w-48 h-48 border-2 border-primary rounded-lg"
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      1. Abra o WhatsApp no celular<br/>
                      2. Toque em Mais opções → Aparelhos conectados<br/>
                      3. Toque em Conectar um aparelho<br/>
                      4. Aponte seu celular para esta tela
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-green-800 dark:text-green-200 text-sm font-medium">
                    ✓ WhatsApp conectado e pronto para enviar mensagens
                  </p>
                </div>
                <Button 
                  onClick={disconnectWhatsApp} 
                  variant="destructive"
                  size="sm"
                  className="w-full"
                >
                  <WifiOff className="w-4 h-4 mr-2" />
                  Desconectar WhatsApp
                </Button>
              </div>
            )}
          </div>

          {/* Log de Conexões */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Últimos Eventos</h3>
              <Button size="sm" variant="ghost" onClick={loadLogs}>
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
            
            <div className="space-y-2">
              {logs.length === 0 ? (
                <p className="text-muted-foreground text-xs text-center py-4">
                  Nenhum log ainda
                </p>
              ) : (
                logs.map((log) => (
                  <div 
                    key={log.id} 
                    className="flex items-start gap-2 p-2 border rounded text-xs"
                  >
                    {getEventIcon(log.event_type)}
                    <div className="flex-1">
                      <p className="font-medium capitalize">
                        {log.event_type.replace(/_/g, " ")}
                      </p>
                      {log.message && (
                        <p className="text-muted-foreground">{log.message}</p>
                      )}
                      <p className="text-muted-foreground mt-1">
                        {new Date(log.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
