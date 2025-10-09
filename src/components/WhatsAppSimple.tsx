import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Wifi, WifiOff, Send, Loader2 } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function WhatsAppSimple() {
  const { tenant } = useTenant();
  const [isConnected, setIsConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [contactCount, setContactCount] = useState(0);

  useEffect(() => {
    if (tenant?.id) {
      checkConnection();
      loadContactCount();
    }
  }, [tenant?.id]);

  const checkConnection = async () => {
    if (!tenant) return;

    try {
      const { data: integration } = await supabase
        .from("integration_whatsapp")
        .select("api_url")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .maybeSingle();

      if (integration?.api_url) {
        const response = await fetch(`${integration.api_url}/status/${tenant.id}`);
        const status = await response.json();
        setIsConnected(status.hasClient && status.status === 'ready');
      }
    } catch (error) {
      setIsConnected(false);
    }
  };

  const loadContactCount = async () => {
    if (!tenant) return;

    const { count } = await supabase
      .from("orders")
      .select("customer_phone", { count: 'exact', head: true })
      .eq("tenant_id", tenant.id);

    setContactCount(count || 0);
  };

  const handleSendBroadcast = async () => {
    if (!tenant || !message.trim()) return;

    setIsSending(true);

    try {
      // Buscar todos os telefones únicos de clientes com pedidos
      const { data: orders } = await supabase
        .from("orders")
        .select("customer_phone")
        .eq("tenant_id", tenant.id);

      if (!orders || orders.length === 0) {
        toast.error("Nenhum cliente encontrado");
        return;
      }

      const uniquePhones = [...new Set(orders.map(o => o.customer_phone))];

      // Buscar API URL
      const { data: integration } = await supabase
        .from("integration_whatsapp")
        .select("api_url")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .single();

      if (!integration?.api_url) {
        toast.error("Configure a integração do WhatsApp primeiro");
        return;
      }

      // Enviar mensagem em massa
      const response = await fetch(`${integration.api_url}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id,
          phones: uniquePhones,
          message: message.trim()
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`Mensagens enviadas: ${result.successful}/${result.total}`);
        setMessage("");
      } else {
        toast.error("Erro ao enviar mensagens");
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao enviar mensagens");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Smartphone className="h-6 w-6" />
          <h1 className="text-2xl font-bold">WhatsApp</h1>
        </div>
        <Badge variant={isConnected ? "default" : "destructive"}>
          {isConnected ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
          {isConnected ? "Conectado" : "Desconectado"}
        </Badge>
      </div>

      {!isConnected && (
        <Card className="mb-6 border-yellow-500">
          <CardHeader>
            <CardTitle className="text-yellow-600">⚠️ WhatsApp Não Conectado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Para usar o WhatsApp, você precisa:
            </p>
            <ol className="text-sm space-y-2 list-decimal list-inside">
              <li>Configurar a URL do servidor em Config → Integrações</li>
              <li>Iniciar o servidor Node.js: <code className="bg-secondary px-2 py-1 rounded">node server-whatsapp-simple.js</code></li>
              <li>Escanear o QR Code que aparece no terminal</li>
            </ol>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Mensagem em Massa</CardTitle>
          <CardDescription>
            Enviar para {contactCount} contatos únicos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Digite sua mensagem aqui..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            disabled={!isConnected}
          />
          
          <Button
            onClick={handleSendBroadcast}
            disabled={!isConnected || !message.trim() || isSending}
            className="w-full"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Enviar para {contactCount} contatos
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
