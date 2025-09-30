import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle, Clock, Smartphone, Send } from "lucide-react";
import { whatsappService } from "@/lib/whatsapp-service";
import { useToast } from "@/components/ui/use-toast";
import { useTenant } from "@/hooks/useTenant";

export default function WhatsAppIntegration() {
  const [status, setStatus] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [orderStatus, setOrderStatus] = useState<'paid' | 'unpaid' | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { tenant } = useTenant();

  const fetchStatus = async () => {
    if (!tenant?.id) return;
    
    try {
      const statusData = await whatsappService.getStatus(tenant.id);
      setStatus(statusData);
    } catch (error) {
      console.error('Erro ao buscar status:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Não foi possível conectar ao servidor WhatsApp.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (tenant?.id) {
      fetchStatus();
      const interval = setInterval(fetchStatus, 5000); // Atualiza a cada 5 segundos
      return () => clearInterval(interval);
    }
  }, [tenant?.id]);

  const getStatusIcon = (instanceStatus: string) => {
    switch (instanceStatus) {
      case 'online':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'qr_code':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'offline':
      case 'auth_failure':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusLabel = (instanceStatus: string) => {
    switch (instanceStatus) {
      case 'online':
        return 'Online';
      case 'qr_code':
        return 'Aguardando QR';
      case 'authenticated':
        return 'Autenticado';
      case 'offline':
        return 'Offline';
      case 'auth_failure':
        return 'Falha na Auth';
      default:
        return 'Desconhecido';
    }
  };

  const handleBroadcast = async () => {
    if (!message.trim()) {
      toast({
        title: "Erro",
        description: "Digite uma mensagem para enviar.",
        variant: "destructive",
      });
      return;
    }

    if (!tenant?.id) {
      toast({
        title: "Erro",
        description: "Tenant não identificado.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await whatsappService.broadcastByOrderStatus(orderStatus, message);
      
      toast({
        title: "Sucesso",
        description: `Mensagem enviada para ${response.total || 0} contatos com status '${orderStatus}'`,
      });
      
      setMessage("");
    } catch (error) {
      console.error('Erro ao enviar broadcast:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao enviar mensagem em massa.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Smartphone className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Integração WhatsApp</h1>
      </div>

      {/* Status das Instâncias */}
      <Card>
        <CardHeader>
          <CardTitle>Status das Instâncias</CardTitle>
          <CardDescription>
            Status das conexões WhatsApp ativas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {status?.instancias ? (
              status.instancias.map((instance: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(instance.status)}
                    <div>
                      <div className="font-medium">{instance.nome}</div>
                      <div className="text-sm text-muted-foreground">
                        {instance.numero || 'Número não definido'}
                      </div>
                    </div>
                  </div>
                  <Badge 
                    variant={instance.status === 'online' ? 'default' : 'secondary'}
                  >
                    {getStatusLabel(instance.status)}
                  </Badge>
                </div>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-4">
                Carregando status das instâncias...
              </div>
            )}
          </div>
          
          <div className="mt-4">
            <Button onClick={fetchStatus} variant="outline" size="sm">
              Atualizar Status
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Envio de Mensagem em Massa */}
      <Card>
        <CardHeader>
          <CardTitle>Mensagem em Massa</CardTitle>
          <CardDescription>
            Envie mensagens para clientes filtrados por status de pagamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Filtrar por Status do Pedido
            </label>
            <Select value={orderStatus} onValueChange={(value: 'paid' | 'unpaid' | 'all') => setOrderStatus(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Clientes</SelectItem>
                <SelectItem value="paid">Apenas Pedidos Pagos</SelectItem>
                <SelectItem value="unpaid">Apenas Pedidos Não Pagos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              Mensagem
            </label>
            <Textarea
              placeholder="Digite a mensagem que será enviada para os clientes..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>

          <Button 
            onClick={handleBroadcast} 
            disabled={loading || !message.trim()}
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            {loading ? 'Enviando...' : 'Enviar Mensagem em Massa'}
          </Button>
        </CardContent>
      </Card>

      {/* Instruções */}
      <Card>
        <CardHeader>
          <CardTitle>Como Usar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <h4 className="font-medium mb-2">📱 Configuração Inicial:</h4>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Inicie o servidor: <code className="bg-muted px-1 py-0.5 rounded">node server-whatsapp.js</code></li>
              <li>Escaneie o QR Code que aparece no terminal</li>
              <li>Aguarde o status mudar para "Online"</li>
            </ol>
          </div>

          <div className="text-sm">
            <h4 className="font-medium mb-2">🚀 Funcionalidades Automáticas:</h4>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Mensagem automática quando item é adicionado ao pedido</li>
              <li>Mensagem automática quando item é cancelado</li>
              <li>Mensagem automática quando pedido é criado</li>
              <li>Sistema de labels automático (APP)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}