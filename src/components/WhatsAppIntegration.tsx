import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Smartphone, Send } from "lucide-react";
import { whatsappService } from "@/lib/whatsapp-service";
import { useToast } from "@/components/ui/use-toast";
import { useTenant } from "@/hooks/useTenant";

export default function WhatsAppIntegration() {
  const [message, setMessage] = useState("");
  const [orderStatus, setOrderStatus] = useState<'paid' | 'unpaid' | 'all'>('all');
  const [orderDate, setOrderDate] = useState("");
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { tenant } = useTenant();

  const fetchContactCount = async () => {
    if (!tenant?.id) return;
    
    setLoadingCount(true);
    try {
      const count = await whatsappService.getContactCount(
        orderStatus,
        tenant.id,
        orderDate || undefined
      );
      setContactCount(count);
    } catch (error) {
      console.error('Erro ao buscar contagem:', error);
      setContactCount(null);
    } finally {
      setLoadingCount(false);
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
      const response = await whatsappService.broadcastByOrderStatusAndDate(
        orderStatus, 
        message, 
        tenant.id,
        orderDate || undefined
      );
      
      toast({
        title: "Sucesso",
        description: `Mensagem enviada para ${response.total || 0} contatos`,
      });
      
      setMessage("");
      setOrderDate("");
      setContactCount(null);
    } catch (error) {
      console.error('Erro ao enviar broadcast:', error);
      // Não mostrar erro de configuração para o usuário
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

      {/* Envio de Mensagem em Massa */}
      <Card>
        <CardHeader>
          <CardTitle>Mensagem em Massa</CardTitle>
          <CardDescription>
            Envie mensagens para clientes filtrados por status de pagamento e data do pedido
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="orderStatus">Status do Pedido</Label>
              <Select value={orderStatus} onValueChange={(value: 'paid' | 'unpaid' | 'all') => {
                setOrderStatus(value);
                setContactCount(null);
              }}>
                <SelectTrigger id="orderStatus">
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Clientes</SelectItem>
                  <SelectItem value="paid">Pedidos Pagos</SelectItem>
                  <SelectItem value="unpaid">Pedidos Não Pagos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="orderDate">Data do Pedido (opcional)</Label>
              <Input
                id="orderDate"
                type="date"
                value={orderDate}
                onChange={(e) => {
                  setOrderDate(e.target.value);
                  setContactCount(null);
                }}
              />
            </div>
          </div>

          <Button 
            onClick={fetchContactCount} 
            disabled={loadingCount}
            variant="outline"
            className="w-full"
          >
            {loadingCount ? 'Contando...' : 'Verificar Quantidade de Contatos'}
          </Button>

          {contactCount !== null && (
            <Card className="bg-muted">
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">Contatos que receberão a mensagem:</p>
                  <p className="text-3xl font-bold">{contactCount}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div>
            <Label htmlFor="message">Mensagem</Label>
            <Textarea
              id="message"
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
            <h4 className="font-medium mb-2">📱 Envio de Mensagens em Massa:</h4>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
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
              <li>Sistema de labels automático (APP)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}