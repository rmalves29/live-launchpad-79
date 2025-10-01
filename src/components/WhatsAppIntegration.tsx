import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Smartphone } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import MassMessageControl from "@/components/MassMessageControl";

export default function WhatsAppIntegration() {
  const [message, setMessage] = useState("");
  const [orderStatus, setOrderStatus] = useState<'paid' | 'unpaid' | 'all'>('all');
  const [orderDate, setOrderDate] = useState("");
  const { tenant } = useTenant();

  // Carregar template MSG_MASSA ao montar
  useEffect(() => {
    loadTemplate();
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