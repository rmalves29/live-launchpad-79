import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Smartphone, Wifi, WifiOff, QrCode, RefreshCw, Activity } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import MassMessageControl from "@/components/MassMessageControl";
import { toast } from "sonner";

interface ConnectionLog {
  id: string;
  event_type: string;
  message: string | null;
  created_at: string;
}

export default function WhatsAppIntegration() {
  const [message, setMessage] = useState("");
  const [orderStatus, setOrderStatus] = useState<'paid' | 'unpaid' | 'all'>('all');
  const [orderDate, setOrderDate] = useState("");
  const { tenant } = useTenant();
  
  // Estados para conexão WhatsApp
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<ConnectionLog[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Carregar template MSG_MASSA e status de conexão ao montar
  useEffect(() => {
    loadTemplate();
    loadConnectionStatus();
    loadLogs();
  }, [tenant?.id]);

  const loadTemplate = async () => {
    if (!tenant?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('content')
        .eq('tenant_id', tenant.id)
        .eq('type', 'MSG_MASSA')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data?.content) {
        setMessage(data.content);
      }
    } catch (error) {
      console.error('Erro ao carregar template:', error);
    }
  };

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
          console.log(`🔍 Verificando status em: ${integration.api_url}/status/${tenant.id}`);
          
          const response = await fetch(`${integration.api_url}/status/${tenant.id}`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000)
          });
          
          if (!response.ok) {
            console.warn(`⚠️ Servidor retornou status ${response.status}`);
            setIsConnected(false);
            return;
          }
          
          const status = await response.json();
          console.log('📊 Status recebido:', status);
          
          // Verificar se tem cliente E se está online
          const connected = status.hasClient && status.status === 'online';
          console.log(`✅ Status da conexão: ${connected ? 'CONECTADO' : 'DESCONECTADO'}`);
          setIsConnected(connected);
        } catch (fetchError) {
          console.warn("⚠️ Servidor WhatsApp não disponível:", fetchError);
          setIsConnected(false);
        }
      } else {
        console.warn("⚠️ api_url não configurada");
        setIsConnected(false);
      }
    } catch (error) {
      console.error("❌ Erro ao verificar status:", error);
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
        toast.error("Servidor WhatsApp não configurado. Configure a URL do servidor abaixo.");
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Smartphone className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Integração WhatsApp</h1>
        </div>
        {getStatusBadge()}
      </div>

      <Tabs defaultValue="connection" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="connection">Conexão</TabsTrigger>
          <TabsTrigger value="messages">Mensagens em Massa</TabsTrigger>
          <TabsTrigger value="instructions">Instruções</TabsTrigger>
        </TabsList>

        {/* Tab: Conexão WhatsApp */}
        <TabsContent value="connection" className="space-y-4">
          {/* Aviso sobre configuração */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
              ℹ️ Requisitos para Conexão:
            </h4>
            <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
              <li>Servidor Node.js deve estar rodando localmente ou em servidor</li>
              <li>Configure a URL do servidor na tabela integration_whatsapp</li>
              <li>Exemplo: http://localhost:3333 ou http://seu-servidor.com:3333</li>
            </ol>
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
        </TabsContent>

        {/* Tab: Mensagens em Massa */}
        <TabsContent value="messages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mensagem em Massa</CardTitle>
              <CardDescription>
                Envie mensagens para clientes filtrados por status de pagamento e data do pedido
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <MassMessageControl
                message={message}
                setMessage={setMessage}
                orderStatus={orderStatus}
                setOrderStatus={setOrderStatus}
                orderDate={orderDate}
                setOrderDate={setOrderDate}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Instruções */}
        <TabsContent value="instructions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Como Usar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm">
                <h4 className="font-medium mb-2">🔌 Conexão WhatsApp:</h4>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Vá para a aba "Conexão"</li>
                  <li>Clique em "Conectar WhatsApp"</li>
                  <li>Escaneie o QR Code com seu celular</li>
                  <li>Aguarde a confirmação de conexão</li>
                </ol>
              </div>

              <div className="text-sm">
                <h4 className="font-medium mb-2">📱 Envio de Mensagens em Massa:</h4>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Certifique-se de que o WhatsApp está conectado</li>
                  <li>Vá para a aba "Mensagens em Massa"</li>
                  <li>Selecione o status dos pedidos (Pagos, Não Pagos ou Todos)</li>
                  <li>Opcionalmente, defina um período de datas para filtrar os pedidos</li>
                  <li>Digite a mensagem que deseja enviar</li>
                  <li>Clique em "Enviar Mensagem em Massa"</li>
                </ol>
              </div>

              <div className="text-sm">
                <h4 className="font-medium mb-2">🚀 Funcionalidades Automáticas:</h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Mensagem automática quando item é adicionado ao pedido</li>
                  <li>Mensagem automática quando item é cancelado</li>
                  <li>Mensagem automática quando pedido é criado</li>
                  <li>Mensagem automática quando pedido é pago</li>
                  <li>Sistema de labels automático (APP)</li>
                </ul>
              </div>

              <div className="text-sm">
                <h4 className="font-medium mb-2">📊 Monitoramento:</h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Visualize o log de conexões na aba "Conexão"</li>
                  <li>Verifique o status da conexão no badge verde/vermelho</li>
                  <li>Acompanhe eventos como QR gerado, conexão estabelecida, desconexões e erros</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}