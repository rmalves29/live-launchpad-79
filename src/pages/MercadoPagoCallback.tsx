import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PaymentInfo {
  status: string;
  paymentId: string;
  preferenceId: string;
  amount?: number;
  orderId?: string;
}

export default function MercadoPagoCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    // Extrair parâmetros da URL
    const status = searchParams.get('status') || 'unknown';
    const paymentId = searchParams.get('payment_id') || '';
    const preferenceId = searchParams.get('preference_id') || '';
    
    setPaymentInfo({
      status,
      paymentId,
      preferenceId
    });

    // Buscar informações do pedido se temos preferenceId
    if (preferenceId && status === 'approved') {
      loadOrderInfo(preferenceId);
    }

    // Iniciar contagem regressiva
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/checkout', { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [searchParams, navigate]);

  const loadOrderInfo = async (preferenceId: string) => {
    try {
      const { data: order } = await supabase
        .from('orders')
        .select('id, total_amount')
        .ilike('payment_link', `%${preferenceId}%`)
        .single();

      if (order) {
        setPaymentInfo(prev => prev ? {
          ...prev,
          amount: order.total_amount,
          orderId: order.id.toString()
        } : null);
      }
    } catch (error) {
      console.error('Erro ao carregar informações do pedido:', error);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'approved':
        return {
          icon: <CheckCircle className="h-16 w-16 text-green-500" />,
          title: 'Pagamento Aprovado!',
          description: 'Seu pagamento foi processado com sucesso.',
          color: 'text-green-600'
        };
      case 'rejected':
        return {
          icon: <XCircle className="h-16 w-16 text-red-500" />,
          title: 'Pagamento Rejeitado',
          description: 'Não foi possível processar seu pagamento.',
          color: 'text-red-600'
        };
      case 'pending':
        return {
          icon: <Clock className="h-16 w-16 text-yellow-500" />,
          title: 'Pagamento Pendente',
          description: 'Seu pagamento está sendo processado.',
          color: 'text-yellow-600'
        };
      default:
        return {
          icon: <AlertCircle className="h-16 w-16 text-gray-500" />,
          title: 'Status Desconhecido',
          description: 'Não foi possível determinar o status do pagamento.',
          color: 'text-gray-600'
        };
    }
  };

  if (!paymentInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusInfo = getStatusInfo(paymentInfo.status);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {statusInfo.icon}
          </div>
          <CardTitle className={`text-2xl ${statusInfo.color}`}>
            {statusInfo.title}
          </CardTitle>
          <p className="text-muted-foreground">
            {statusInfo.description}
          </p>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {paymentInfo.orderId && (
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm font-medium">Número do Pedido:</p>
              <p className="text-lg font-bold">#{paymentInfo.orderId}</p>
            </div>
          )}
          
          {paymentInfo.amount && (
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm font-medium">Valor Pago:</p>
              <p className="text-lg font-bold">
                R$ {paymentInfo.amount.toFixed(2).replace('.', ',')}
              </p>
            </div>
          )}
          
          {paymentInfo.paymentId && (
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm font-medium">ID do Pagamento:</p>
              <p className="text-xs font-mono break-all">{paymentInfo.paymentId}</p>
            </div>
          )}
          
          <div className="text-center pt-4">
            <p className="text-sm text-muted-foreground">
              Redirecionando em {countdown} segundo{countdown !== 1 ? 's' : ''}...
            </p>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-1000"
                style={{ width: `${((10 - countdown) / 10) * 100}%` }}
              ></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}