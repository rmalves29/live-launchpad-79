import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MessageSquare, Users, Package, RefreshCw } from 'lucide-react';

interface Order {
  id: number;
  customer_phone: string;
  event_date: string;
  event_type: string;
  total_amount: number;
  is_paid: boolean;
  created_at: string;
}

const WhatsAppMonitor = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [monitoring, setMonitoring] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-monitor', {
        body: { action: 'get_orders' }
      });

      if (error) {
        throw new Error(error.message);
      }

      setOrders(data.orders || []);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar pedidos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const processMessage = async (message: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-monitor', {
        body: {
          action: 'process_message',
          message: {
            phone: '5511999999999', // Mock phone for demo
            message,
            timestamp: new Date().toISOString()
          }
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.success) {
        toast({
          title: 'Pedido processado',
          description: data.message
        });
        loadOrders();
      } else {
        toast({
          title: 'Aviso',
          description: data.message,
          variant: 'default'
        });
      }
    } catch (error) {
      console.error('Error processing message:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao processar mensagem',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // Simulate monitoring toggle
  const toggleMonitoring = () => {
    setMonitoring(!monitoring);
    toast({
      title: monitoring ? 'Monitoramento pausado' : 'Monitoramento iniciado',
      description: monitoring 
        ? 'WhatsApp não está mais sendo monitorado' 
        : 'Monitorando grupos do WhatsApp para novos pedidos'
    });
  };

  return (
    <div className="container mx-auto py-6 max-w-6xl space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Monitor WhatsApp</h1>
        <div className="flex space-x-2">
          <Button onClick={loadOrders} variant="outline" disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Button 
            onClick={toggleMonitoring}
            variant={monitoring ? "destructive" : "default"}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            {monitoring ? 'Pausar Monitor' : 'Iniciar Monitor'}
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Badge variant={monitoring ? "default" : "secondary"}>
                {monitoring ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Monitor de grupos WhatsApp
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pedidos Hoje</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orders.filter(order => 
                new Date(order.created_at).toDateString() === new Date().toDateString()
              ).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Novos pedidos via WhatsApp
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Não Pagos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orders.filter(order => !order.is_paid).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Aguardando pagamento
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Test Message Processing */}
      <Card>
        <CardHeader>
          <CardTitle>Teste de Processamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Teste o processamento automático de mensagens do WhatsApp:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button 
                onClick={() => processMessage("2x Vestido Floral R$45,90 cada - Nome: Maria Silva")}
                variant="outline"
                className="h-auto p-4 text-left"
              >
                <div>
                  <div className="font-medium">Testar Pedido 1</div>
                  <div className="text-sm text-muted-foreground">
                    "2x Vestido Floral R$45,90 cada - Nome: Maria Silva"
                  </div>
                </div>
              </Button>
              
              <Button 
                onClick={() => processMessage("1x Calça Jeans R$79,90 - 1x Blusa Básica R$29,90 - Nome: Ana Costa")}
                variant="outline" 
                className="h-auto p-4 text-left"
              >
                <div>
                  <div className="font-medium">Testar Pedido 2</div>
                  <div className="text-sm text-muted-foreground">
                    "1x Calça Jeans R$79,90 - 1x Blusa Básica R$29,90 - Nome: Ana Costa"
                  </div>
                </div>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <CardTitle>Pedidos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            <div className="space-y-4">
              {orders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum pedido encontrado
                </div>
              ) : (
                orders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-4 border rounded">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">Pedido #{order.id}</span>
                        <Badge variant={order.is_paid ? "default" : "secondary"}>
                          {order.is_paid ? 'Pago' : 'Pendente'}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {order.customer_phone} • {order.event_type}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">
                        R$ {order.total_amount.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Como Usar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• <strong>Monitor Ativo:</strong> Quando ativado, o sistema monitora grupos do WhatsApp em busca de pedidos</p>
            <p>• <strong>Detecção Automática:</strong> Identifica mensagens com padrões de pedidos (quantidade, produto, preço)</p>
            <p>• <strong>Criação de Clientes:</strong> Cria automaticamente clientes baseado no número do WhatsApp</p>
            <p>• <strong>Produtos Dinâmicos:</strong> Cria produtos automaticamente se não existirem no catálogo</p>
            <p>• <strong>Formato Esperado:</strong> "2x Produto R$20,00 - Nome: Cliente"</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppMonitor;