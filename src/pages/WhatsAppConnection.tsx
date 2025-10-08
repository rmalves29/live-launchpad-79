import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Wifi, WifiOff, QrCode, RefreshCw, Activity } from "lucide-react";
import { useTenantContext } from "@/contexts/TenantContext";

interface ConnectionLog {
  id: string;
  event_type: string;
  message: string | null;
  created_at: string;
}

export default function WhatsAppConnection() {
  const navigate = useNavigate();
  const { tenant } = useTenantContext();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<ConnectionLog[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (!tenant) {
      navigate("/tenant-auth");
      return;
    }
    loadConnectionStatus();
    loadLogs();
  }, [tenant, navigate]);

  const loadConnectionStatus = async () => {
    if (!tenant) return;
    
    try {
      const { data: integration } = await supabase
        .from("integration_whatsapp")
        .select("*")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .single();

      if (integration?.api_url) {
        const response = await fetch(`${integration.api_url}/status/${tenant.id}`);
        const status = await response.json();
        setIsConnected(status.connected || false);
      }
    } catch (error) {
      console.error("Erro ao verificar status:", error);
    }
  };

  const loadLogs = async () => {
    if (!tenant) return;

    const { data } = await supabase
      .from("whatsapp_connection_logs")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) setLogs(data);
  };

  const connectWhatsApp = async () => {
    if (!tenant) return;

    setIsLoading(true);
    setQrCode(null);

    try {
      const { data: integration } = await supabase
        .from("integration_whatsapp")
        .select("api_url")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .single();

      if (!integration?.api_url) {
        toast.error("Configuração de WhatsApp não encontrada");
        return;
      }

      // Conectar via WebSocket para receber QR Code
      const wsUrl = integration.api_url.replace("http", "ws") + `/ws/${tenant.id}`;
      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
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
        console.error("Erro no WebSocket:", error);
        toast.error("Erro na conexão");
        logEvent("error", "Erro ao conectar WebSocket");
      };

      websocket.onclose = () => {
        setIsLoading(false);
      };

      setWs(websocket);
    } catch (error: any) {
      console.error("Erro ao conectar:", error);
      toast.error(error.message || "Erro ao conectar WhatsApp");
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
      console.error("Erro ao desconectar:", error);
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

  const getStatusBadge = () => {
    if (isConnected) {
      return (
        <Badge className="bg-green-500">
          <Wifi className="w-3 h-3 mr-1" />
          Conectado
        </Badge>
      );
    }
    return (
      <Badge variant="destructive">
        <WifiOff className="w-3 h-3 mr-1" />
        Desconectado
      </Badge>
    );
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Conexão WhatsApp</h1>
          <p className="text-muted-foreground">
            Gerencie a conexão do WhatsApp para {tenant?.name}
          </p>
        </div>
        {getStatusBadge()}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status da Conexão</CardTitle>
          <CardDescription>
            Conecte seu WhatsApp para enviar mensagens automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                <div className="flex flex-col items-center space-y-4 p-6 bg-secondary rounded-lg">
                  <p className="font-medium">Escaneie este QR Code com seu WhatsApp:</p>
                  <img 
                    src={qrCode} 
                    alt="QR Code WhatsApp" 
                    className="w-64 h-64 border-4 border-primary rounded-lg"
                  />
                  <p className="text-sm text-muted-foreground text-center">
                    1. Abra o WhatsApp no seu celular<br/>
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
                <p className="text-green-800 dark:text-green-200 font-medium">
                  ✓ WhatsApp conectado e pronto para enviar mensagens
                </p>
              </div>
              <Button 
                onClick={disconnectWhatsApp} 
                variant="destructive"
                className="w-full"
              >
                <WifiOff className="w-4 h-4 mr-2" />
                Desconectar WhatsApp
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Log de Conexões</CardTitle>
              <CardDescription>Histórico de eventos da conexão</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={loadLogs}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhum log de conexão ainda
              </p>
            ) : (
              logs.map((log) => (
                <div 
                  key={log.id} 
                  className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent transition-colors"
                >
                  {getEventIcon(log.event_type)}
                  <div className="flex-1">
                    <p className="font-medium capitalize">
                      {log.event_type.replace(/_/g, " ")}
                    </p>
                    {log.message && (
                      <p className="text-sm text-muted-foreground">{log.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
