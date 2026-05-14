import { useState, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
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
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, Send, Users, Calendar as CalendarIcon, Filter, Tag, RefreshCw, Clock, Database } from 'lucide-react';
import { normalizeForSending } from '@/lib/phone-utils';
import { addMessageVariation, getHumanizedDelayMs } from '@/lib/whatsapp-anti-block';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface FilterCriteria {
  isPaid: string;
  eventType: string;
  orderDate: DateRange | undefined;
}

interface Customer {
  customer_phone: string;
  customer_name?: string;
  event_type?: string;
  event_date?: string;
  total_amount?: number;
  is_paid?: boolean;
}

interface SendStatus {
  phone: string;
  status: 'pending' | 'sending' | 'sent' | 'error';
  error?: string;
}

interface WhatsAppTag {
  id: string;
  name: string;
  color: number;
}

// Helper function to get tag color from Z-API color index
const getTagColor = (colorIndex: number): string => {
  const colors: Record<number, string> = {
    0: '#808080', // Cinza
    1: '#25D366', // Verde
    2: '#128C7E', // Verde escuro
    3: '#FFA500', // Laranja
    4: '#E91E63', // Rosa
    5: '#9C27B0', // Roxo
    6: '#2196F3', // Azul
    7: '#00BCD4', // Ciano
    8: '#4CAF50', // Verde claro
    9: '#FF5722', // Vermelho
    10: '#795548', // Marrom
  };
  return colors[colorIndex] || '#808080';
};

export default function Cobranca() {
  const { toast } = useToast();
  const { tenant } = useTenant();
  
  const [filters, setFilters] = useState<FilterCriteria>({
    isPaid: 'all',
    eventType: 'all',
    orderDate: undefined
  });
  
  const [messageTemplate, setMessageTemplate] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [whatsappApiUrl, setWhatsappApiUrl] = useState<string | null>(null);
  const [sendStatuses, setSendStatuses] = useState<Record<string, SendStatus>>({});
  
  // Tags state
  const [tags, setTags] = useState<WhatsAppTag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [loadingTags, setLoadingTags] = useState(false);
  
  // Configurações de timer para envio
  const [delayBetweenMessages, setDelayBetweenMessages] = useState(15); // segundos entre cada mensagem (anti-bloqueio: 15s recomendado)
  const [messagesBeforePause, setMessagesBeforePause] = useState(10); // qtd de mensagens antes da pausa
  const [pauseDuration, setPauseDuration] = useState(120); // segundos de pausa a cada X mensagens (2min recomendado)

  // Estado para agendamento
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [scheduledTime, setScheduledTime] = useState('09:00');

  // Estado para filtro de toda base
  const [useAllCustomers, setUseAllCustomers] = useState(false);

  // Carregar template padrão MSG_MASSA e URL do WhatsApp
  useEffect(() => {
    loadDefaultTemplate();
    loadWhatsAppUrl();
    if (tenant?.id) {
      loadTags();
    }
  }, [tenant]);

  const loadTags = async () => {
    if (!tenant?.id) return;
    
    setLoadingTags(true);
    try {
      const { data, error } = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
        body: { action: 'list-tags', tenant_id: tenant.id }
      });

      if (error) throw error;
      
      if (Array.isArray(data)) {
        setTags(data);
        console.log('✅ Tags carregadas:', data.length);
      } else {
        console.warn('⚠️ Resposta de tags não é array:', data);
        setTags([]);
      }
    } catch (error: any) {
      // Silenciar erros quando WhatsApp não configurado
      console.log('Tags não disponíveis (WhatsApp pode não estar conectado):', error?.message);
      setTags([]);
    } finally {
      setLoadingTags(false);
    }
  };

  const addTagToContact = async (phone: string, tagId: string): Promise<boolean> => {
    if (!tenant?.id || !tagId || tagId === 'none') return true; // Se não tiver tag selecionada, sucesso
    
    try {
      const formattedPhone = normalizeForSending(phone);
      const { data, error } = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
        body: { 
          action: 'add-tag', 
          tenant_id: tenant.id,
          phone: formattedPhone,
          tagId: tagId
        }
      });

      if (error) throw error;
      console.log(`✅ Tag adicionada ao contato ${formattedPhone}`);
      return true;
    } catch (error) {
      console.error(`❌ Erro ao adicionar tag ao contato ${phone}:`, error);
      return false;
    }
  };

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
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(1)
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
    // Se estiver usando toda a base, carregar da tabela customers
    if (useAllCustomers) {
      await loadAllCustomers();
      return;
    }

    if (!filters.orderDate?.from) {
      setCustomers([]);
      return;
    }

    try {
      setLoading(true);
      
      const fromStr = format(filters.orderDate.from, 'yyyy-MM-dd');
      let query = supabaseTenant
        .from('orders')
        .select('customer_phone, customer_name, event_type, event_date, total_amount, is_paid');

      if (filters.orderDate.to) {
        const toStr = format(filters.orderDate.to, 'yyyy-MM-dd');
        query = query.gte('event_date', fromStr).lte('event_date', toStr);
      } else {
        query = query.eq('event_date', fromStr);
      }

      // Aplicar filtro de pagamento
      if (filters.isPaid === 'paid') {
        query = query.eq('is_paid', true);
      } else if (filters.isPaid === 'unpaid') {
        query = query.eq('is_paid', false);
      }

      // Aplicar filtro de tipo de evento
      if (filters.eventType === 'bazar') {
        query = query.in('event_type', ['BAZAR', 'MANUAL']);
      } else if (filters.eventType !== 'all') {
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
    } catch (error: any) {
      console.error('Erro ao carregar clientes:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao aplicar filtros',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Carregar todos os clientes da base (sem filtro de pedidos)
  const loadAllCustomers = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabaseTenant
        .from('customers')
        .select('phone, name')
        .order('name', { ascending: true });

      if (error) throw error;

      // Mapear para o formato esperado
      const mappedCustomers: Customer[] = data?.map(c => ({
        customer_phone: c.phone,
        customer_name: c.name
      })) || [];

      setCustomers(mappedCustomers);
      
      // Inicializar status como pendente para todos
      const initialStatuses: Record<string, SendStatus> = {};
      mappedCustomers.forEach(c => {
        initialStatuses[c.customer_phone] = { phone: c.customer_phone, status: 'pending' };
      });
      setSendStatuses(initialStatuses);
      
      toast({
        title: 'Base completa carregada',
        description: `${mappedCustomers.length} cliente(s) encontrado(s)`,
      });
    } catch (error: any) {
      console.error('Erro ao carregar todos os clientes:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao carregar base de clientes',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (useAllCustomers) {
      loadAllCustomers();
    } else if (filters.orderDate?.from) {
      loadCustomers();
    } else {
      setCustomers([]);
    }
  }, [filters, useAllCustomers]);

  // Função para agendar envio
  const scheduleMessage = async () => {
    if (!scheduledDate || !scheduledTime) {
      toast({
        title: 'Erro',
        description: 'Selecione a data e hora para o agendamento',
        variant: 'destructive'
      });
      return;
    }

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

    if (!tenant?.id) {
      toast({
        title: 'Erro',
        description: 'Tenant não identificado',
        variant: 'destructive'
      });
      return;
    }

    // Criar data/hora completa
    const [hours, minutes] = scheduledTime.split(':').map(Number);
    const scheduledDateTime = new Date(scheduledDate);
    scheduledDateTime.setHours(hours, minutes, 0, 0);

    // Verificar se a data é no futuro
    if (scheduledDateTime <= new Date()) {
      toast({
        title: 'Erro',
        description: 'A data e hora de agendamento devem ser no futuro',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Criar job agendado na tabela sending_jobs
      const { error } = await supabaseTenant.from('sending_jobs').insert({
        tenant_id: tenant.id,
        job_type: 'mass_message',
        status: 'running',
        total_items: customers.length,
        processed_items: 0,
        current_index: 0,
        started_at: scheduledDateTime.toISOString(),
        job_data: {
          scheduled_at: scheduledDateTime.toISOString(),
          message_template: messageTemplate,
          customers: customers.map(c => ({
            phone: c.customer_phone,
            name: c.customer_name || ''
          })),
          tag_id: selectedTagId && selectedTagId !== 'none' ? selectedTagId : null,
          delay_between_messages: delayBetweenMessages,
          messages_before_pause: messagesBeforePause,
          pause_duration: pauseDuration,
          filters: {
            is_paid: filters.isPaid,
            event_type: filters.eventType,
            order_date: filters.orderDate?.from ? format(filters.orderDate.from, 'yyyy-MM-dd') : '',
            order_date_to: filters.orderDate?.to ? format(filters.orderDate.to, 'yyyy-MM-dd') : '',
            use_all_customers: useAllCustomers
          }
        }
      });

      if (error) throw error;

      toast({
        title: 'Envio agendado!',
        description: `${customers.length} mensagens serão enviadas em ${format(scheduledDateTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
      });

      // Resetar campos de agendamento
      setIsScheduled(false);
      setScheduledDate(undefined);
      setScheduledTime('09:00');

    } catch (error: any) {
      console.error('Erro ao agendar envio:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao agendar envio',
        variant: 'destructive'
      });
    }
  };

  const handleSendMessages = async () => {
    // Se for agendado, usar a função de agendamento
    if (isScheduled) {
      await scheduleMessage();
      return;
    }

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

    if (!tenant?.id) {
      toast({
        title: 'Erro',
        description: 'Tenant não identificado',
        variant: 'destructive'
      });
      return;
    }

    console.log('🚀 Iniciando envio em massa para', customers.length, 'clientes');
    if (selectedTagId && selectedTagId !== 'none') {
      const tagName = tags.find(t => t.id === selectedTagId)?.name;
      console.log(`🏷️ Tag selecionada: ${tagName} (${selectedTagId})`);
    }

    setSending(true);
    setSendProgress({ current: 0, total: customers.length });

    let successCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < customers.length; i++) {
        const customer = customers[i];
        setSendProgress({ current: i + 1, total: customers.length });

        // Atualizar status para "enviando"
        setSendStatuses(prev => ({
          ...prev,
          [customer.customer_phone]: { phone: customer.customer_phone, status: 'sending' }
        }));

        // Personalizar mensagem com nome do cliente (com fallback genérico)
        let personalizedMessage = messageTemplate;
        const rawName = (customer.customer_name || '').trim();
        // Usa só o primeiro nome quando disponível; senão, fallback neutro
        const firstName = rawName ? rawName.split(/\s+/)[0] : '';
        if (firstName) {
          personalizedMessage = personalizedMessage.replace(/\{\{nome\}\}/g, firstName);
        } else {
          // Sem nome: remove a saudação "Olá {{nome}}, " ou "Oi {{nome}}, " inteira
          // e, se restar algum {{nome}} solto, troca por "tudo bem"
          personalizedMessage = personalizedMessage
            .replace(/(Olá|Oi|Ola|Olá,)\s*\{\{nome\}\}\s*,?\s*/gi, 'Olá, ')
            .replace(/\{\{nome\}\}/g, '');
          // Limpa espaços duplicados resultantes
          personalizedMessage = personalizedMessage.replace(/\s{2,}/g, ' ').trim();
        }

        // 🛡️ Anti-bloqueio: aplicar variação sutil (emoji swap + zero-width space)
        // para evitar que o WhatsApp filtre mensagens idênticas em massa
        const variedMessage = addMessageVariation(personalizedMessage);

        // Normalizar telefone para envio
        const phoneToSend = normalizeForSending(customer.customer_phone);
        console.log(`📱 Enviando para ${phoneToSend} (${i + 1}/${customers.length})`);

        // Enviar mensagem via Z-API
        try {
          const { data, error } = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
            body: { 
              action: 'send-text', 
              tenant_id: tenant.id,
              phone: phoneToSend,
              message: variedMessage
            }
          });

          if (error) {
            console.error(`❌ Erro ao enviar para ${phoneToSend}:`, error);
            
            setSendStatuses(prev => ({
              ...prev,
              [customer.customer_phone]: { 
                phone: customer.customer_phone, 
                status: 'error',
                error: error.message || 'Erro ao enviar'
              }
            }));
            errorCount++;
          } else {
            console.log(`✅ Mensagem enviada com sucesso para ${phoneToSend}`);
            
            // Adicionar tag ao contato se selecionada
            if (selectedTagId && selectedTagId !== 'none') {
              await addTagToContact(phoneToSend, selectedTagId);
            }
            
            setSendStatuses(prev => ({
              ...prev,
              [customer.customer_phone]: { phone: customer.customer_phone, status: 'sent' }
            }));
            successCount++;
          }

          // Registrar no banco de dados
          await supabaseTenant.from('whatsapp_messages').insert({
            phone: phoneToSend,
            message: variedMessage,
            type: 'bulk',
            sent_at: new Date().toISOString(),
            processed: true
          });

        } catch (error) {
          console.error(`❌ Erro ao enviar mensagem para ${customer.customer_phone}:`, error);
          
          setSendStatuses(prev => ({
            ...prev,
            [customer.customer_phone]: { 
              phone: customer.customer_phone, 
              status: 'error',
              error: error instanceof Error ? error.message : 'Erro desconhecido'
            }
          }));
          errorCount++;
        }

        // Sistema de delay customizado com jitter humanizado (anti-bloqueio)
        if (i < customers.length - 1) {
          // Delay entre cada mensagem com variação 0.7x-1.3x para parecer humano
          const humanDelay = getHumanizedDelayMs(delayBetweenMessages);
          console.log(`⏱️ Aguardando ${(humanDelay / 1000).toFixed(1)}s (humanizado)`);
          await new Promise(resolve => setTimeout(resolve, humanDelay));

          // Pausa maior a cada X mensagens
          if ((i + 1) % messagesBeforePause === 0) {
            const humanPause = getHumanizedDelayMs(pauseDuration);
            console.log(`⏸️ Pausa de ${(humanPause / 1000).toFixed(1)}s após ${i + 1} mensagens`);
            await new Promise(resolve => setTimeout(resolve, humanPause));
          }
        }
      }

      toast({
        title: 'Envio concluído',
        description: `${successCount} enviada(s), ${errorCount} erro(s)${selectedTagId && selectedTagId !== 'none' ? '. Tags aplicadas!' : ''}`,
      });

      console.log('✅ Processo de envio finalizado');
      console.log(`📊 Sucesso: ${successCount}, Erros: ${errorCount}`);

    } catch (error: any) {
      console.error('Erro ao enviar mensagens:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao enviar mensagens em massa',
        variant: 'destructive'
      });
    } finally {
      setSending(false);
      setSendProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          WhatsApp <span className="text-muted-foreground font-semibold">— Cobrança Automática</span>
        </h1>
        <p className="text-muted-foreground mt-1">Configure o envio automático de cobranças para clientes pendentes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ============ COLUNA 1 — FILTROS DE CLIENTES ============ */}
        <Card className="rounded-2xl border-[#e5e7eb] shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Filtros de Clientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Toggle base completa */}
            <div className="flex items-center justify-between p-3 bg-[#f9fafb] rounded-xl border border-[#e5e7eb]">
              <div className="flex items-center gap-2 min-w-0">
                <Database className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <Label htmlFor="useAllCustomers" className="font-medium text-sm">Toda a base</Label>
                  <p className="text-xs text-muted-foreground truncate">Ignora filtros e envia para todos</p>
                </div>
              </div>
              <Switch id="useAllCustomers" checked={useAllCustomers} onCheckedChange={setUseAllCustomers} />
            </div>

            <div className={cn("space-y-4 transition-opacity", useAllCustomers && "opacity-50 pointer-events-none")}>
              <div className="space-y-2">
                <Label htmlFor="isPaid" className="text-sm">Status do Pedido</Label>
                <Select value={filters.isPaid} onValueChange={(value) => setFilters({ ...filters, isPaid: value })} disabled={useAllCustomers}>
                  <SelectTrigger id="isPaid" className="h-11 rounded-xl bg-white border-[#e5e7eb]">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="unpaid">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="eventType" className="text-sm">Evento</Label>
                <Select value={filters.eventType} onValueChange={(value) => setFilters({ ...filters, eventType: value })} disabled={useAllCustomers}>
                  <SelectTrigger id="eventType" className="h-11 rounded-xl bg-white border-[#e5e7eb]">
                    <SelectValue placeholder="Todos os eventos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os eventos</SelectItem>
                    <SelectItem value="bazar">Bazar</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Data do Pedido</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full h-11 justify-start text-left font-normal rounded-xl bg-white border-[#e5e7eb]",
                        !filters.orderDate?.from && "text-muted-foreground"
                      )}
                      disabled={useAllCustomers}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.orderDate?.from
                        ? (filters.orderDate.to
                            ? `${format(filters.orderDate.from, "dd/MM/yy", { locale: ptBR })} - ${format(filters.orderDate.to, "dd/MM/yy", { locale: ptBR })}`
                            : format(filters.orderDate.from, "dd/MM/yyyy", { locale: ptBR }))
                        : "dd/mm/aaaa"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={filters.orderDate}
                      onSelect={(range) => setFilters({ ...filters, orderDate: range })}
                      initialFocus
                      numberOfMonths={1}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tag" className="text-sm">Tag WhatsApp</Label>
                  <Button variant="ghost" size="icon" onClick={loadTags} disabled={loadingTags} title="Recarregar tags" className="h-7 w-7">
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingTags ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <Select value={selectedTagId} onValueChange={setSelectedTagId}>
                  <SelectTrigger id="tag" className="h-11 rounded-xl bg-white border-[#e5e7eb]">
                    <SelectValue placeholder="Nenhuma tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma tag</SelectItem>
                    {tags.filter(tag => tag.id && tag.id !== '').map((tag) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getTagColor(tag.color) }} />
                          {tag.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Resumo: clientes encontrados */}
            <div className="p-4 rounded-xl bg-[#eef2ff] border border-[#c7d2fe]">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-[#4338ca]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Calculando...
                </div>
              ) : (
                <>
                  <div className="text-base font-semibold text-[#4338ca]">
                    {customers.length} cliente{customers.length === 1 ? '' : 's'} encontrado{customers.length === 1 ? '' : 's'}
                  </div>
                  <div className="text-xs text-[#6366f1] mt-0.5">
                    {useAllCustomers ? 'base completa' : (filters.isPaid === 'unpaid' ? 'com pedidos pendentes' : 'pelos filtros aplicados')}
                  </div>
                </>
              )}
            </div>

            {/* Lista expandida (opcional) */}
            {customers.length > 0 && (
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                  Ver lista de clientes
                </summary>
                <div className="mt-2 max-h-48 overflow-y-auto border rounded-xl p-3 space-y-1.5 bg-white">
                  {customers.map((customer, index) => {
                    const status = sendStatuses[customer.customer_phone];
                    return (
                      <div key={index} className="flex items-center justify-between text-xs">
                        <span className="font-medium truncate">{customer.customer_name || customer.customer_phone}</span>
                        <Badge
                          variant={
                            status?.status === 'sent' ? 'default' :
                            status?.status === 'sending' ? 'outline' :
                            status?.status === 'error' ? 'destructive' :
                            'secondary'
                          }
                          className="text-[10px]"
                        >
                          {status?.status === 'sent' ? '✓' :
                           status?.status === 'sending' ? '⏳' :
                           status?.status === 'error' ? '✗' :
                           '•'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </CardContent>
        </Card>

        {/* ============ COLUNA 2 — MENSAGEM DE COBRANÇA ============ */}
        <Card className="rounded-2xl border-[#e5e7eb] shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Mensagem de Cobrança</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Mensagem personalizada</Label>
              <Textarea
                placeholder="Olá {nome}! 👋&#10;&#10;Você ainda tem um pedido pendente no valor de *R$ {valor}*."
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                rows={9}
                className="resize-none rounded-xl bg-white border-[#e5e7eb]"
              />
              <div className="text-xs text-muted-foreground text-right">{messageTemplate.length} caracteres</div>
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between p-3 bg-[#f9fafb] rounded-xl border border-[#e5e7eb] mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <Label htmlFor="isScheduled" className="font-medium text-sm">Agendar envio</Label>
                </div>
                <Switch id="isScheduled" checked={isScheduled} onCheckedChange={setIsScheduled} />
              </div>

              {isScheduled && (
                <>
                  <Label className="text-sm mb-2 block">Agendamento</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Data</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full h-11 justify-start text-left font-normal rounded-xl bg-white border-[#e5e7eb]",
                              !scheduledDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {scheduledDate ? format(scheduledDate, "dd/MM/yyyy", { locale: ptBR }) : "dd/mm/aaaa"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={scheduledDate}
                            onSelect={setScheduledDate}
                            disabled={(date) => date < new Date()}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="scheduledTime" className="text-xs text-muted-foreground">Hora</Label>
                      <Input
                        id="scheduledTime"
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="h-11 rounded-xl bg-white border-[#e5e7eb]"
                      />
                    </div>
                  </div>
                  {scheduledDate && scheduledTime && (
                    <p className="text-xs text-primary mt-2 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Agendado para <strong>{format(scheduledDate, "dd/MM/yyyy", { locale: ptBR })}</strong> às <strong>{scheduledTime}</strong>
                    </p>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ============ COLUNA 3 — CONFIGURAÇÕES DE ENVIO ============ */}
        <Card className="rounded-2xl border-[#e5e7eb] shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold">Configurações de Envio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delayBetweenMessages" className="text-sm">Delay entre mensagens (segundos)</Label>
              <Input
                id="delayBetweenMessages"
                type="number"
                min="1"
                max="60"
                value={delayBetweenMessages}
                onChange={(e) => setDelayBetweenMessages(Number(e.target.value))}
                className="h-11 rounded-xl bg-white border-[#e5e7eb]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="messagesBeforePause" className="text-sm">Pausa a cada</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="messagesBeforePause"
                  type="number"
                  min="1"
                  max="100"
                  value={messagesBeforePause}
                  onChange={(e) => setMessagesBeforePause(Number(e.target.value))}
                  className="h-11 rounded-xl bg-white border-[#e5e7eb] w-24"
                />
                <span className="text-sm text-muted-foreground">mensagens</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pauseDuration" className="text-sm">Pausa por</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="pauseDuration"
                  type="number"
                  min="5"
                  max="300"
                  value={pauseDuration}
                  onChange={(e) => setPauseDuration(Number(e.target.value))}
                  className="h-11 rounded-xl bg-white border-[#e5e7eb] w-24"
                />
                <span className="text-sm text-muted-foreground">segundos</span>
              </div>
            </div>

            {/* Progresso */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progresso</span>
                <span className="text-muted-foreground">{sendProgress.current} / {sendProgress.total || customers.length}</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${sendProgress.total ? (sendProgress.current / sendProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>

            <Button
              onClick={handleSendMessages}
              disabled={sending || customers.length === 0 || !messageTemplate.trim() || (isScheduled && (!scheduledDate || !scheduledTime))}
              className="w-full h-12 rounded-xl gap-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold text-base shadow-sm"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando {sendProgress.current}/{sendProgress.total}
                </>
              ) : isScheduled ? (
                <>
                  <Clock className="w-4 h-4" />
                  Agendar Envio
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Iniciar Envio
                </>
              )}
            </Button>

            <Button
              variant="outline"
              className="w-full h-11 rounded-xl border-[#e5e7eb] font-medium"
              disabled={!sending}
              onClick={() => { /* placeholder pause */ }}
            >
              ⏸ Pausar
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
