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
  dateFrom: string;
  dateTo: string;
}

interface Customer {
  customer_phone: string;
  customer_name?: string;
  event_type: string;
  event_date: string;
  total_amount: number;
  is_paid: boolean;
}

export default function Cobranca() {
  const { toast } = useToast();
  const { tenant } = useTenant();
  
  const [filters, setFilters] = useState<FilterCriteria>({
    isPaid: 'all',
    eventType: 'all',
    dateFrom: '',
    dateTo: ''
  });
  
  const [messageTemplate, setMessageTemplate] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });

  // Carregar template padrão MSG_MASSA
  useEffect(() => {
    loadDefaultTemplate();
  }, [tenant]);

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
    if (!filters.dateFrom || !filters.dateTo) {
      setCustomers([]);
      return;
    }

    try {
      setLoading(true);
      
      let query = supabaseTenant
        .from('orders')
        .select('customer_phone, customer_name, event_type, event_date, total_amount, is_paid')
        .gte('event_date', filters.dateFrom)
        .lte('event_date', filters.dateTo);

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
    if (filters.dateFrom && filters.dateTo) {
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

    setSending(true);
    setSendProgress({ current: 0, total: customers.length });

    try {
      const whatsappApiUrl = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1';

      for (let i = 0; i < customers.length; i++) {
        const customer = customers[i];
        setSendProgress({ current: i + 1, total: customers.length });

        // Personalizar mensagem com nome do cliente se disponível
        let personalizedMessage = messageTemplate;
        if (customer.customer_name) {
          personalizedMessage = personalizedMessage.replace(/\{\{nome\}\}/g, customer.customer_name);
        }

        // Normalizar telefone para envio
        const phoneToSend = normalizeForSending(customer.customer_phone);

        // Enviar mensagem via edge function
        try {
          const response = await fetch(`${whatsappApiUrl}/whatsapp-send-item-added`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tenant_id: tenant?.id,
              customer_phone: phoneToSend,
              message: personalizedMessage,
              type: 'mass_message'
            })
          });

          if (!response.ok) {
            console.error(`Erro ao enviar para ${phoneToSend}:`, await response.text());
          }

          // Registrar no banco de dados
          await supabaseTenant.from('whatsapp_messages').insert({
            phone: customer.customer_phone,
            message: personalizedMessage,
            type: 'bulk',
            sent_at: new Date().toISOString(),
            processed: true
          });

        } catch (error) {
          console.error(`Erro ao enviar mensagem para ${customer.customer_phone}:`, error);
        }

        // Delay de 2 segundos entre mensagens (exceto na última)
        if (i < customers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      toast({
        title: 'Envio concluído',
        description: `${customers.length} mensagem(ns) enviada(s) com sucesso`,
      });

      // Limpar seleção após envio
      setCustomers([]);
      setFilters({
        isPaid: 'all',
        eventType: 'all',
        dateFrom: '',
        dateTo: ''
      });

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

            {/* Filtro de Data Inicial */}
            <div className="space-y-2">
              <Label htmlFor="dateFrom">Data Inicial</Label>
              <Input
                id="dateFrom"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              />
            </div>

            {/* Filtro de Data Final */}
            <div className="space-y-2">
              <Label htmlFor="dateTo">Data Final</Label>
              <Input
                id="dateTo"
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
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
                {filters.dateFrom && filters.dateTo && (
                  <Badge variant="outline" className="text-sm px-3 py-1">
                    <Calendar className="w-3 h-3 mr-2" />
                    {filters.dateFrom} até {filters.dateTo}
                  </Badge>
                )}
              </div>

              {customers.length > 0 && (
                <div className="mt-4 max-h-40 overflow-y-auto border rounded-md p-4 space-y-2">
                  {customers.slice(0, 10).map((customer, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {customer.customer_name || customer.customer_phone}
                      </span>
                      <Badge variant={customer.is_paid ? 'default' : 'secondary'}>
                        {customer.is_paid ? 'Pago' : 'Pendente'}
                      </Badge>
                    </div>
                  ))}
                  {customers.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      ... e mais {customers.length - 10} cliente(s)
                    </p>
                  )}
                </div>
              )}

              {!filters.dateFrom || !filters.dateTo ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Selecione as datas para visualizar os clientes
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
