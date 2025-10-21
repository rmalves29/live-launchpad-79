import { useState, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Users, Calendar, Filter } from 'lucide-react';
import { normalizeForSending } from '@/lib/phone-utils';

interface FilterCriteria {
  isPaid: string;
  eventType: string;
  orderDate: string;
}

interface Customer {
  customer_phone: string;
  customer_name?: string;
  event_type: string;
  event_date: string;
  total_amount: number;
  is_paid: boolean;
}

interface SendStatus {
  phone: string;
  status: 'pending' | 'sending' | 'sent' | 'error';
  error?: string;
}

export default function Cobranca() {
  const { toast } = useToast();
  const { tenant } = useTenant();
  
  const [filters, setFilters] = useState<FilterCriteria>({
    isPaid: 'all',
    eventType: 'all',
    orderDate: ''
  });
  
  const [messageTemplate, setMessageTemplate] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [whatsappApiUrl, setWhatsappApiUrl] = useState<string | null>(null);
  const [sendStatuses, setSendStatuses] = useState<Record<string, SendStatus>>({});

  // Carregar template padrão MSG_MASSA e URL do WhatsApp
  useEffect(() => {
    loadDefaultTemplate();
    loadWhatsAppUrl();
  }, [tenant]);

  const loadWhatsAppUrl = async () => {
    try {
      const { data, error } = await supabaseTenant
        .from('integration_whatsapp')
        .select('api_url')
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      
      if (data?.api_url) {
        console.log('✅ WhatsApp API URL carregada:', data.api_url);
        setWhatsappApiUrl(data.api_url);
      } else {
        console.warn('⚠️ Nenhuma integração WhatsApp ativa encontrada');
      }
    } catch (error) {
      console.error('❌ Erro ao carregar URL do WhatsApp:', error);
    }
  };

  const loadDefaultTemplate = async () => {
    try {
      const { data, error } = await supabaseTenant
        .from('whatsapp_templates')
        .select('content')
        .eq('type', 'MSG_MASSA')
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setMessageTemplate(data.content);
      }
    } catch (error) {
      console.error('Erro ao carregar template:', error);
    }
  };

  const loadCustomers = async () => {
    if (!filters.orderDate) {
      setCustomers([]);
      return;
    }

    try {
      setLoading(true);
      
      let query = supabaseTenant
        .from('orders')
        .select('customer_phone, customer_name, event_type, event_date, total_amount, is_paid')
        .eq('event_date', filters.orderDate);

      // Aplicar filtro de pagamento
      if (filters.isPaid === 'paid') {
        query = query.eq('is_paid', true);
      } else if (filters.isPaid === 'unpaid') {
        query = query.eq('is_paid', false);
      }

      // Aplicar filtro de tipo de evento
      if (filters.eventType !== 'all') {
        query = query.eq('event_type', filters.eventType.toUpperCase());
      }

      const { data, error } = await query;

      if (error) throw error;

      // Remover duplicatas por telefone (pegar apenas o mais recente)
      const uniqueCustomers = data?.reduce((acc: Customer[], current) => {
        const exists = acc.find(c => c.customer_phone === current.customer_phone);
        if (!exists) {
          acc.push(current);
        }
        return acc;
      }, []) || [];

      setCustomers(uniqueCustomers);
      
      // Inicializar status como pendente para todos
      const initialStatuses: Record<string, SendStatus> = {};
      uniqueCustomers.forEach(c => {
        initialStatuses[c.customer_phone] = { phone: c.customer_phone, status: 'pending' };
      });
      setSendStatuses(initialStatuses);
      
      toast({
        title: 'Filtro aplicado',
        description: `${uniqueCustomers.length} cliente(s) encontrado(s)`,
      });
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao aplicar filtros',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (filters.orderDate) {
      loadCustomers();
    }
  }, [filters]);

  const handleSendMessages = async () => {
    if (!messageTemplate.trim()) {
      toast({
        title: 'Erro',
        description: 'Digite uma mensagem para enviar',
        variant: 'destructive'
      });
      return;
    }

    if (customers.length === 0) {
      toast({
        title: 'Erro',
        description: 'Nenhum cliente encontrado com os filtros aplicados',
        variant: 'destructive'
      });
      return;
    }

    if (!whatsappApiUrl) {
      toast({
        title: 'Erro',
        description: 'Servidor WhatsApp não configurado. Verifique as configurações.',
        variant: 'destructive'
      });
      console.error('❌ whatsappApiUrl não está definido');
      return;
    }

    console.log('🚀 Iniciando envio em massa para', customers.length, 'clientes');
    console.log('📡 URL do servidor:', whatsappApiUrl);

    setSending(true);
    setSendProgress({ current: 0, total: customers.length });

    try {
      for (let i = 0; i < customers.length; i++) {
        const customer = customers[i];
        setSendProgress({ current: i + 1, total: customers.length });

        // Atualizar status para "enviando"
        setSendStatuses(prev => ({
          ...prev,
          [customer.customer_phone]: { phone: customer.customer_phone, status: 'sending' }
        }));

        // Personalizar mensagem com nome do cliente se disponível
        let personalizedMessage = messageTemplate;
        if (customer.customer_name) {
          personalizedMessage = personalizedMessage.replace(/\{\{nome\}\}/g, customer.customer_name);
        }

        // Normalizar telefone para envio
        const phoneToSend = normalizeForSending(customer.customer_phone);
        console.log(`📱 Enviando para ${phoneToSend} (${i + 1}/${customers.length})`);

        // Enviar mensagem diretamente para o servidor Node.js WhatsApp
        try {
          const response = await fetch(`${whatsappApiUrl}/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-tenant-id': tenant?.id || ''
            },
            body: JSON.stringify({
              phone: phoneToSend,
              message: personalizedMessage
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Erro ao enviar para ${phoneToSend}:`, errorText);
            
            // Atualizar status para erro
            setSendStatuses(prev => ({
              ...prev,
              [customer.customer_phone]: { 
                phone: customer.customer_phone, 
                status: 'error',
                error: `Erro HTTP ${response.status}`
              }
            }));
          } else {
            console.log(`✅ Mensagem enviada com sucesso para ${phoneToSend}`);
            
            // Atualizar status para enviado
            setSendStatuses(prev => ({
              ...prev,
              [customer.customer_phone]: { phone: customer.customer_phone, status: 'sent' }
            }));
          }

          // Registrar no banco de dados
          await supabaseTenant.from('whatsapp_messages').insert({
            phone: phoneToSend,
            message: personalizedMessage,
            type: 'bulk',
            sent_at: new Date().toISOString(),
            processed: true
          });

        } catch (error) {
          console.error(`❌ Erro ao enviar mensagem para ${customer.customer_phone}:`, error);
          
          // Atualizar status para erro
          setSendStatuses(prev => ({
            ...prev,
            [customer.customer_phone]: { 
              phone: customer.customer_phone, 
              status: 'error',
              error: error instanceof Error ? error.message : 'Erro desconhecido'
            }
          }));
        }

        // Delay de 2 segundos entre mensagens (exceto na última)
        if (i < customers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      const successCount = Object.values(sendStatuses).filter(s => s.status === 'sent').length;
      const errorCount = Object.values(sendStatuses).filter(s => s.status === 'error').length;

      toast({
        title: 'Envio concluído',
        description: `${successCount} enviada(s), ${errorCount} erro(s)`,
      });

      console.log('✅ Processo de envio finalizado');
      console.log(`📊 Sucesso: ${successCount}, Erros: ${errorCount}`);

    } catch (error) {
      console.error('Erro ao enviar mensagens:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao enviar mensagens em massa',
        variant: 'destructive'
      });
    } finally {
      setSending(false);
      setSendProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cobrança em Massa</h1>
          <p className="text-muted-foreground">Envie mensagens para clientes filtrados por critérios</p>
        </div>
      </div>

      {/* Card de Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filtros de Clientes
          </CardTitle>
          <CardDescription>
            Selecione os critérios para filtrar os clientes que receberão a mensagem
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Filtro de Pagamento */}
            <div className="space-y-2">
              <Label htmlFor="isPaid">Status de Pagamento</Label>
              <Select
                value={filters.isPaid}
                onValueChange={(value) => setFilters({ ...filters, isPaid: value })}
              >
                <SelectTrigger id="isPaid">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="paid">Apenas Pagos</SelectItem>
                  <SelectItem value="unpaid">Apenas Não Pagos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro de Tipo de Evento */}
            <div className="space-y-2">
              <Label htmlFor="eventType">Tipo de Evento</Label>
              <Select
                value={filters.eventType}
                onValueChange={(value) => setFilters({ ...filters, eventType: value })}
              >
                <SelectTrigger id="eventType">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="bazar">Bazar</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro de Data do Pedido */}
            <div className="space-y-2">
              <Label htmlFor="orderDate">Data do Pedido</Label>
              <Input
                id="orderDate"
                type="date"
                value={filters.orderDate}
                onChange={(e) => setFilters({ ...filters, orderDate: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card de Preview de Clientes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Clientes que Receberão a Mensagem
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  <Users className="w-4 h-4 mr-2" />
                  {customers.length} cliente(s)
                </Badge>
                {filters.orderDate && (
                  <Badge variant="outline" className="text-sm px-3 py-1">
                    <Calendar className="w-3 h-3 mr-2" />
                    {filters.orderDate}
                  </Badge>
                )}
              </div>

              {customers.length > 0 && (
                <div className="mt-4 max-h-60 overflow-y-auto border rounded-md p-4 space-y-2">
                  {customers.map((customer, index) => {
                    const status = sendStatuses[customer.customer_phone];
                    return (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {customer.customer_name || customer.customer_phone}
                        </span>
                        <Badge 
                          variant={
                            status?.status === 'sent' ? 'default' :
                            status?.status === 'sending' ? 'outline' :
                            status?.status === 'error' ? 'destructive' :
                            'secondary'
                          }
                        >
                          {status?.status === 'sent' ? '✓ Enviado' :
                           status?.status === 'sending' ? '⏳ Enviando...' :
                           status?.status === 'error' ? '✗ Erro' :
                           'Pendente'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}

              {!filters.orderDate ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Selecione a data do pedido para visualizar os clientes
                </p>
              ) : customers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum cliente encontrado com os filtros aplicados
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card de Template de Mensagem */}
      <Card>
        <CardHeader>
          <CardTitle>Template de Mensagem</CardTitle>
          <CardDescription>
            Personalize a mensagem que será enviada. Use {'{{nome}}'} para incluir o nome do cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Digite sua mensagem aqui..."
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            rows={8}
            className="resize-none"
          />

          <div className="flex items-center justify-between pt-4">
            <div className="text-sm text-muted-foreground">
              {messageTemplate.length} caracteres
            </div>

            <Button
              onClick={handleSendMessages}
              disabled={sending || customers.length === 0 || !messageTemplate.trim()}
              size="lg"
              className="gap-2"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando {sendProgress.current}/{sendProgress.total}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enviar para {customers.length} Cliente(s)
                </>
              )}
            </Button>
          </div>

          {sending && (
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{
                  width: `${(sendProgress.current / sendProgress.total) * 100}%`
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
