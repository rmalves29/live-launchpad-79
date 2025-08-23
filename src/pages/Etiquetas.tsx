import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Package, Tag, Download, Eye, CreditCard } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Order {
  id: number;
  customer_phone: string;
  total_amount: number;
  event_type: string;
  created_at: string;
}

interface FreteEnvio {
  id: number;
  pedido_id: number;
  shipment_id: string | null;
  status: string;
  label_url: string | null;
  tracking_code: string | null;
  created_at: string;
  order?: Order;
}

export default function Etiquetas() {
  const [envios, setEnvios] = useState<FreteEnvio[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<{ [key: number]: boolean }>({});
  const { toast } = useToast();

  useEffect(() => {
    loadShipments();
  }, []);

  const loadShipments = async () => {
    setLoading(true);
    try {
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('is_paid', true)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      const { data: enviosData, error: enviosError } = await supabase
        .from('frete_envios')
        .select('*')
        .order('created_at', { ascending: false });

      if (enviosError) throw enviosError;

      // Merge orders with shipments
      const mergedData = (ordersData || []).map(order => {
        const envio = (enviosData || []).find(e => e.pedido_id === order.id);
        return envio ? { ...envio, order } : {
          id: 0,
          pedido_id: order.id,
          shipment_id: null,
          status: 'pending',
          label_url: null,
          tracking_code: null,
          created_at: order.created_at,
          order
        };
      });

      setEnvios(mergedData);
    } catch (error) {
      console.error('Error loading shipments:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados dos envios",
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  const generateLabel = async (envio: FreteEnvio) => {
    if (!envio.order) return;
    
    setActionLoading({...actionLoading, [envio.pedido_id]: true});
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio-labels', {
        body: {
          action: 'create_shipment',
          order_id: envio.order.id,
          customer_phone: envio.order.customer_phone,
        }
      });

      if (error) throw error;

      if (data?.shipment_id) {
        // Update or create frete_envios record
        const envioData = {
          pedido_id: envio.order.id,
          shipment_id: data.shipment_id,
          status: 'created',
          raw_response: data,
        };

        const { error: updateError } = await supabase
          .from('frete_envios')
          .upsert(envioData, { onConflict: 'pedido_id' });

        if (updateError) throw updateError;

        toast({
          title: "Sucesso",
          description: "Etiqueta gerada com sucesso",
        });

        loadShipments(); // Reload to get updated data
      }
    } catch (error) {
      console.error('Error generating label:', error);
      toast({
        title: "Erro",
        description: "Erro ao gerar etiqueta",
        variant: "destructive",
      });
    }
    setActionLoading({...actionLoading, [envio.pedido_id]: false});
  };

  const payLabel = async (envio: FreteEnvio) => {
    if (!envio.shipment_id) return;
    
    setActionLoading({...actionLoading, [envio.pedido_id]: true});
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio-labels', {
        body: {
          action: 'pay_shipment',
          shipment_id: envio.shipment_id,
        }
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Pagamento da etiqueta processado",
      });

      loadShipments();
    } catch (error) {
      console.error('Error paying label:', error);
      toast({
        title: "Erro",
        description: "Erro ao pagar etiqueta",
        variant: "destructive",
      });
    }
    setActionLoading({...actionLoading, [envio.pedido_id]: false});
  };

  const downloadLabel = async (envio: FreteEnvio) => {
    if (!envio.shipment_id) return;
    
    setActionLoading({...actionLoading, [envio.pedido_id]: true});
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio-labels', {
        body: {
          action: 'download_label',
          shipment_id: envio.shipment_id,
        }
      });

      if (error) throw error;

      if (data?.label_url) {
        window.open(data.label_url, '_blank');
        
        // Update label_url in database
        const { error: updateError } = await supabase
          .from('frete_envios')
          .update({ label_url: data.label_url })
          .eq('shipment_id', envio.shipment_id);

        if (updateError) console.error('Error updating label URL:', updateError);
        
        toast({
          title: "Sucesso",
          description: "Etiqueta baixada com sucesso",
        });
      }
    } catch (error) {
      console.error('Error downloading label:', error);
      toast({
        title: "Erro",
        description: "Erro ao baixar etiqueta",
        variant: "destructive",
      });
    }
    setActionLoading({...actionLoading, [envio.pedido_id]: false});
  };

  const trackShipment = (envio: FreteEnvio) => {
    if (envio.tracking_code) {
      const trackingUrl = `https://melhorenvio.com.br/rastreamento/${envio.tracking_code}`;
      window.open(trackingUrl, '_blank');
    } else {
      toast({
        title: "Aviso",
        description: "Código de rastreamento não disponível",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      pending: { label: "Pendente", variant: "secondary" as const },
      created: { label: "Criado", variant: "default" as const },
      paid: { label: "Pago", variant: "default" as const },
      posted: { label: "Postado", variant: "default" as const },
      delivered: { label: "Entregue", variant: "default" as const },
    };

    const statusInfo = statusMap[status as keyof typeof statusMap] || { label: status, variant: "secondary" as const };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center gap-2 mb-6">
        <Tag className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Gerenciar Etiquetas</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Pedidos para Envio
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Código Rastreamento</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {envios.map((envio) => (
                  <TableRow key={envio.pedido_id}>
                    <TableCell className="font-medium">
                      #{envio.order?.id}
                    </TableCell>
                    <TableCell>
                      {envio.order?.customer_phone}
                    </TableCell>
                    <TableCell>
                      R$ {envio.order?.total_amount?.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {envio.order?.event_type}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(envio.status)}
                    </TableCell>
                    <TableCell>
                      {envio.tracking_code || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {!envio.shipment_id && (
                          <Button
                            size="sm"
                            onClick={() => generateLabel(envio)}
                            disabled={actionLoading[envio.pedido_id]}
                          >
                            <Tag className="w-4 h-4 mr-1" />
                            Gerar
                          </Button>
                        )}
                        
                        {envio.shipment_id && envio.status === 'created' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => payLabel(envio)}
                            disabled={actionLoading[envio.pedido_id]}
                          >
                            <CreditCard className="w-4 h-4 mr-1" />
                            Pagar
                          </Button>
                        )}
                        
                        {envio.shipment_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadLabel(envio)}
                            disabled={actionLoading[envio.pedido_id]}
                          >
                            <Download className="w-4 h-4 mr-1" />
                            PDF
                          </Button>
                        )}
                        
                        {envio.tracking_code && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => trackShipment(envio)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Rastrear
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {envios.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum pedido encontrado para envio
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}