import { useState, useEffect, useRef } from 'react';
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
import { Loader2, Send, Users, Calendar as CalendarIcon, Filter, Tag, RefreshCw, Clock, Database, ImagePlus, X as XIcon } from 'lucide-react';
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

interface OrderItem {
  product_name: string;
  product_code: string;
  qty: number;
  unit_price: number;
}

interface Customer {
  customer_phone: string;
  customer_name?: string;
  event_type?: string;
  event_date?: string;
  total_amount?: number;
  is_paid?: boolean;
  order_id?: number;
  payment_link?: string;
  items?: OrderItem[];
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
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
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

  // Estado para botão (CTA) customizável
  const [buttonEnabled, setButtonEnabled] = useState(false);
  const [buttonLabel, setButtonLabel] = useState('Acessar');
  const [buttonUrl, setButtonUrl] = useState('');

  // Controle de pausa/cancelamento do envio em massa
  const [isPaused, setIsPaused] = useState(false);
  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);

  // Persistência em sending_jobs
  const jobIdRef = useRef<string | null>(null);
  const [orphanJob, setOrphanJob] = useState<{ id: string; processed: number; total: number; status: string } | null>(null);


  // Formata moeda no padrão BR (sem símbolo R$ duplicado)
  const fmtBRL = (n: number) =>
    `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Renderiza variáveis do template para um cliente específico
  const renderTemplate = (tpl: string, customer: Customer): string => {
    let out = tpl || '';

    // {{nome}} — primeiro nome ou fallback
    const rawName = (customer.customer_name || '').trim();
    const firstName = rawName ? rawName.split(/\s+/)[0] : '';
    if (firstName) {
      out = out.replace(/\{\{nome\}\}/g, firstName);
    } else {
      out = out
        .replace(/(Olá|Oi|Ola|Olá,)\s*\{\{nome\}\}\s*,?\s*/gi, 'Olá, ')
        .replace(/\{\{nome\}\}/g, '');
    }

    // {{produtos}} — lista formatada
    const items = customer.items || [];
    const produtosBlock = items.length > 0
      ? items
          .map(it => {
            const code = it.product_code ? ` (${it.product_code})` : '';
            return `• ${it.product_name}${code} — ${it.qty}x ${fmtBRL(it.unit_price)}`;
          })
          .join('\n')
      : '';

    if (items.length === 0) {
      // Remove linhas que contenham {{produtos}} se não houver itens
      out = out
        .split('\n')
        .filter(line => !line.includes('{{produtos}}'))
        .join('\n');
    } else {
      out = out.replace(/\{\{produtos\}\}/g, produtosBlock);
    }

    // {{total}} e {{pedido}}
    const totalNum = Number(customer.total_amount || 0);
    out = out.replace(/\{\{total\}\}/g, totalNum ? fmtBRL(totalNum) : '');
    out = out.replace(/\{\{valor\}\}/g, totalNum ? fmtBRL(totalNum) : '');
    out = out.replace(/\{\{pedido\}\}/g, customer.order_id ? `#${customer.order_id}` : '');
    out = out.replace(/\{\{payment_link\}\}/g, customer.payment_link || '');
    out = out.replace(/\{\{link\}\}/g, customer.payment_link || '');

    // Limpa espaços duplicados
    out = out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return out;
  };

  // Carregar template padrão MSG_MASSA e URL do WhatsApp
  useEffect(() => {
    loadDefaultTemplate();
    loadWhatsAppUrl();
    if (tenant?.id) {
      loadTags();
      checkOrphanJob();
    }
  }, [tenant]);

  // Detecta envio órfão (running/paused) ao montar — provavelmente o usuário recarregou a página
  const checkOrphanJob = async () => {
    if (!tenant?.id) return;
    try {
      const { data, error } = await supabaseTenant
        .from('sending_jobs')
        .select('id, status, processed_items, total_items, updated_at')
        .eq('job_type', 'cobranca')
        .in('status', ['running', 'paused'])
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (data && data.length > 0) {
        const j = data[0] as any;
        setOrphanJob({ id: j.id, processed: j.processed_items, total: j.total_items, status: j.status });
      }
    } catch (e) {
      console.warn('Erro ao checar envios órfãos:', e);
    }
  };

  const cancelOrphanJob = async () => {
    if (!orphanJob) return;
    try {
      await supabaseTenant
        .from('sending_jobs')
        .update({ status: 'cancelled', completed_at: new Date().toISOString(), error_message: 'Cancelado pelo usuário (banner)' })
        .eq('id', orphanJob.id);
      toast({ title: 'Envio anterior cancelado' });
      setOrphanJob(null);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };


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
      const buildQuery = () => {
        let q = supabaseTenant
          .from('orders')
          .select('id, cart_id, payment_link, customer_phone, customer_name, event_type, event_date, total_amount, is_paid, created_at')
          .order('created_at', { ascending: false });

        if (filters.orderDate!.to) {
          const toStr = format(filters.orderDate!.to, 'yyyy-MM-dd');
          q = q.gte('event_date', fromStr).lte('event_date', toStr);
        } else {
          q = q.eq('event_date', fromStr);
        }

        if (filters.isPaid === 'paid') q = q.eq('is_paid', true);
        else if (filters.isPaid === 'unpaid') q = q.eq('is_paid', false);

        if (filters.eventType === 'bazar') q = q.in('event_type', ['BAZAR', 'MANUAL']);
        else if (filters.eventType !== 'all') q = q.eq('event_type', filters.eventType.toUpperCase());

        return q;
      };

      // Paginação para superar o limite default de 1000 do PostgREST
      const PAGE = 1000;
      let offset = 0;
      let data: any[] = [];
      while (true) {
        const { data: pageData, error } = await buildQuery().range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!pageData || pageData.length === 0) break;
        data = data.concat(pageData);
        if (pageData.length < PAGE) break;
        offset += PAGE;
      }

      // Remover duplicatas por telefone (pegar apenas o mais recente — já ordenado desc)
      const uniqueCustomers = data?.reduce((acc: Customer[], current: any) => {
        const exists = acc.find(c => c.customer_phone === current.customer_phone);
        if (!exists) {
          acc.push({
            customer_phone: current.customer_phone,
            customer_name: current.customer_name,
            event_type: current.event_type,
            event_date: current.event_date,
            total_amount: current.total_amount,
            is_paid: current.is_paid,
            order_id: current.id,
            payment_link: current.payment_link,
            items: [],
          });
        }
        return acc;
      }, []) || [];

      // Buscar itens dos carrinhos correspondentes
      const cartIds = data
        ?.filter((o: any) => uniqueCustomers.some(c => c.order_id === o.id) && o.cart_id)
        .map((o: any) => ({ orderId: o.id, cartId: o.cart_id })) || [];

      if (cartIds.length > 0) {
        const uniqueCartIds = Array.from(new Set(cartIds.map(c => c.cartId)));
        // Buscar em chunks de IN + paginar cada chunk para superar limite de 1000
        const CHUNK = 200;
        const PAGE2 = 1000;
        const allItems: any[] = [];
        for (let i = 0; i < uniqueCartIds.length; i += CHUNK) {
          const chunk = uniqueCartIds.slice(i, i + CHUNK);
          let off = 0;
          while (true) {
            const { data: pageItems, error: itemsError } = await supabaseTenant
              .from('cart_items')
              .select('cart_id, qty, unit_price, product_name, product_code')
              .in('cart_id', chunk)
              .range(off, off + PAGE2 - 1);
            if (itemsError) break;
            if (!pageItems || pageItems.length === 0) break;
            allItems.push(...pageItems);
            if (pageItems.length < PAGE2) break;
            off += PAGE2;
          }
        }

        if (allItems.length > 0) {
          const itemsByCart = new Map<number, OrderItem[]>();
          allItems.forEach((it: any) => {
            const list = itemsByCart.get(it.cart_id) || [];
            list.push({
              product_name: it.product_name || '',
              product_code: it.product_code || '',
              qty: Number(it.qty || 0),
              unit_price: Number(it.unit_price || 0),
            });
            itemsByCart.set(it.cart_id, list);
          });

          const orderToCart = new Map<number, number>();
          cartIds.forEach(c => orderToCart.set(c.orderId, c.cartId));
          uniqueCustomers.forEach(c => {
            if (c.order_id) {
              const cartId = orderToCart.get(c.order_id);
              if (cartId) c.items = itemsByCart.get(cartId) || [];
            }
          });
        }
      }

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
      
      // Paginação para superar o limite default de 1000 do PostgREST
      const PAGE = 1000;
      let offset = 0;
      let data: any[] = [];
      while (true) {
        const { data: pageData, error } = await supabaseTenant
          .from('customers')
          .select('phone, name')
          .order('name', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!pageData || pageData.length === 0) break;
        data = data.concat(pageData);
        if (pageData.length < PAGE) break;
        offset += PAGE;
      }

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
            name: c.customer_name || '',
            order_id: c.order_id || null,
            total_amount: c.total_amount || 0,
            payment_link: c.payment_link || '',
            items: c.items || [],
          })),
          tag_id: selectedTagId && selectedTagId !== 'none' ? selectedTagId : null,
          delay_between_messages: delayBetweenMessages,
          messages_before_pause: messagesBeforePause,
          pause_duration: pauseDuration,
          button: buttonEnabled && buttonUrl && buttonLabel ? {
            label: buttonLabel.slice(0, 20),
            url: buttonUrl,
          } : null,
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

    // Validar botão se ativado
    if (buttonEnabled) {
      if (!buttonLabel.trim()) {
        toast({ title: 'Erro', description: 'Defina o texto do botão', variant: 'destructive' });
        return;
      }
      // O URL pode conter variáveis — só rejeitamos se for evidente que não vira link
      const sampleUrl = buttonUrl.trim();
      if (!sampleUrl || (!sampleUrl.includes('{{') && !/^https?:\/\/.+/i.test(sampleUrl))) {
        toast({ title: 'Erro', description: 'Informe um link válido (começando com http:// ou https://)', variant: 'destructive' });
        return;
      }
    }



    console.log('🚀 Iniciando envio em massa para', customers.length, 'clientes');
    if (selectedTagId && selectedTagId !== 'none') {
      const tagName = tags.find(t => t.id === selectedTagId)?.name;
      console.log(`🏷️ Tag selecionada: ${tagName} (${selectedTagId})`);
    }

    setSending(true);
    setSendProgress({ current: 0, total: customers.length });
    pausedRef.current = false;
    cancelledRef.current = false;
    setIsPaused(false);

    let successCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < customers.length; i++) {
        // Cancelamento imediato
        if (cancelledRef.current) {
          console.log('🛑 Envio cancelado pelo usuário');
          break;
        }
        // Pausa: aguardar enquanto pausedRef estiver true
        while (pausedRef.current && !cancelledRef.current) {
          await new Promise(r => setTimeout(r, 500));
        }
        if (cancelledRef.current) break;

        const customer = customers[i];
        setSendProgress({ current: i + 1, total: customers.length });

        // Atualizar status para "enviando"
        setSendStatuses(prev => ({
          ...prev,
          [customer.customer_phone]: { phone: customer.customer_phone, status: 'sending' }
        }));

        // Personalizar mensagem com nome, produtos, total, pedido
        let personalizedMessage = renderTemplate(messageTemplate, customer);

        // 🛡️ Anti-bloqueio: aplicar variação sutil (emoji swap + zero-width space)
        // para evitar que o WhatsApp filtre mensagens idênticas em massa
        const variedMessage = addMessageVariation(personalizedMessage);

        // Normalizar telefone para envio
        const phoneToSend = normalizeForSending(customer.customer_phone);
        console.log(`📱 Enviando para ${phoneToSend} (${i + 1}/${customers.length})`);

        // Resolver botão (CTA) com variáveis também
        const resolvedButtonLabel = buttonEnabled
          ? renderTemplate(buttonLabel, customer).slice(0, 20)
          : '';
        const resolvedButtonUrl = buttonEnabled
          ? renderTemplate(buttonUrl, customer).trim()
          : '';
        const hasValidButton =
          buttonEnabled &&
          resolvedButtonLabel.length > 0 &&
          /^https?:\/\/.+/i.test(resolvedButtonUrl);

        // Enviar mensagem via Z-API
        // Regras: imagem+botão → envia imagem primeiro, depois mensagem com botão
        try {
          // 1) imagem (sempre primeiro se houver)
          if (imageDataUrl) {
            await supabaseTenant.raw.functions.invoke('zapi-proxy', {
              body: {
                action: 'send-image',
                tenant_id: tenant.id,
                phone: phoneToSend,
                mediaUrl: imageDataUrl,
                caption: hasValidButton ? '' : variedMessage,
              },
            });
            // pequena pausa antes do botão
            if (hasValidButton) await new Promise(r => setTimeout(r, 600));
          }

          // 2) mensagem principal — com botão ou texto
          const invokeBody: any = hasValidButton
            ? {
                action: 'send-button-actions',
                tenant_id: tenant.id,
                phone: phoneToSend,
                message: imageDataUrl ? variedMessage : variedMessage,
                buttonActions: [
                  { id: '1', type: 'URL', url: resolvedButtonUrl, label: resolvedButtonLabel },
                ],
              }
            : imageDataUrl
            ? null // já enviado acima como send-image com caption
            : {
                action: 'send-text',
                tenant_id: tenant.id,
                phone: phoneToSend,
                message: variedMessage,
              };

          const { data, error } = invokeBody
            ? await supabaseTenant.raw.functions.invoke('zapi-proxy', { body: invokeBody })
            : { data: { ok: true }, error: null };


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
        // Helper: dorme em fatias curtas para responder a cancelamento rapidamente
        const interruptibleSleep = async (ms: number) => {
          const step = 250;
          let waited = 0;
          while (waited < ms) {
            if (cancelledRef.current) return;
            await new Promise(r => setTimeout(r, Math.min(step, ms - waited)));
            waited += step;
          }
        };

        if (i < customers.length - 1) {
          const humanDelay = getHumanizedDelayMs(delayBetweenMessages);
          console.log(`⏱️ Aguardando ${(humanDelay / 1000).toFixed(1)}s (humanizado)`);
          await interruptibleSleep(humanDelay);

          if (cancelledRef.current) break;

          // Pausa maior a cada X mensagens
          if ((i + 1) % messagesBeforePause === 0) {
            const humanPause = getHumanizedDelayMs(pauseDuration);
            console.log(`⏸️ Pausa de ${(humanPause / 1000).toFixed(1)}s após ${i + 1} mensagens`);
            await interruptibleSleep(humanPause);
          }
        }
      }

      if (cancelledRef.current) {
        toast({
          title: 'Envio cancelado',
          description: `${successCount} enviada(s), ${errorCount} erro(s) antes do cancelamento`,
        });
      } else {
        toast({
          title: 'Envio concluído',
          description: `${successCount} enviada(s), ${errorCount} erro(s)${selectedTagId && selectedTagId !== 'none' ? '. Tags aplicadas!' : ''}`,
        });
      }

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
      pausedRef.current = false;
      cancelledRef.current = false;
      setIsPaused(false);
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
                placeholder={'Olá {{nome}}! 👋\n\nVocê tem um pedido pendente:\n{{produtos}}\n\nTotal: {{total}}'}
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                rows={9}
                className="resize-none rounded-xl bg-white border-[#e5e7eb]"
              />
              <div className="text-xs text-muted-foreground text-right">{messageTemplate.length} caracteres</div>

              {/* Variáveis disponíveis */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  { token: '{{nome}}', label: 'Nome' },
                  { token: '{{produtos}}', label: 'Lista de produtos' },
                  { token: '{{total}}', label: 'Total' },
                  { token: '{{pedido}}', label: 'Nº pedido' },
                ].map(v => (
                  <button
                    key={v.token}
                    type="button"
                    onClick={() => setMessageTemplate(prev => (prev || '') + (prev && !prev.endsWith('\n') ? ' ' : '') + v.token)}
                    className="text-[11px] px-2 py-1 rounded-full bg-[#eef2ff] border border-[#c7d2fe] text-[#4338ca] hover:bg-[#e0e7ff] transition-colors"
                    title={`Inserir ${v.token}`}
                  >
                    + {v.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMessageTemplate(prev => (prev || '') + '\n\nSeus itens:\n{{produtos}}\n\nTotal: {{total}}')}
                  className="text-[11px] px-2 py-1 rounded-full bg-[#ecfdf5] border border-[#a7f3d0] text-[#047857] hover:bg-[#d1fae5] transition-colors"
                >
                  + Inserir bloco de produtos
                </button>
              </div>
            </div>

            {/* Botão de ação (CTA) */}
            <div className="space-y-2 p-3 rounded-xl border border-[#e5e7eb] bg-[#f9fafb]">
              <div className="flex items-center justify-between">
                <Label htmlFor="buttonEnabled" className="font-medium text-sm">Botão clicável (opcional)</Label>
                <Switch id="buttonEnabled" checked={buttonEnabled} onCheckedChange={setButtonEnabled} />
              </div>
              {buttonEnabled && (
                <div className="space-y-2 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="buttonLabel" className="text-xs text-muted-foreground">Texto do botão (máx. 20 caracteres)</Label>
                    <Input
                      id="buttonLabel"
                      value={buttonLabel}
                      onChange={(e) => setButtonLabel(e.target.value.slice(0, 20))}
                      placeholder="Pagar agora"
                      maxLength={20}
                      className="h-10 rounded-lg bg-white border-[#e5e7eb]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="buttonUrl" className="text-xs text-muted-foreground">Link do botão (URL)</Label>
                    <Input
                      id="buttonUrl"
                      value={buttonUrl}
                      onChange={(e) => setButtonUrl(e.target.value)}
                      placeholder="https://..."
                      className="h-10 rounded-lg bg-white border-[#e5e7eb]"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Você pode usar variáveis aqui também: <code className="bg-white px-1 rounded">{'{{payment_link}}'}</code> para o link de pagamento do pedido de cada cliente.
                    </p>
                  </div>
                  {imageDataUrl && (
                    <p className="text-[11px] text-amber-600">
                      ⚠️ Com imagem + botão, a imagem é enviada primeiro e o botão vai numa mensagem separada (limitação da Z-API).
                    </p>
                  )}
                </div>
              )}
            </div>


            {/* Anexar imagem */}
            <div className="space-y-2">
              <Label className="text-sm">Imagem (opcional)</Label>
              {imageDataUrl ? (
                <div className="relative rounded-xl border border-[#e5e7eb] bg-white p-2">
                  <img src={imageDataUrl} alt="Pré-visualização" className="max-h-48 w-full object-contain rounded-lg" />
                  <div className="flex items-center justify-between mt-2 px-1">
                    <span className="text-xs text-muted-foreground truncate max-w-[70%]">{imageFileName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { setImageDataUrl(null); setImageFileName(null); }}
                      className="h-7 px-2 text-xs"
                    >
                      <XIcon className="w-3 h-3 mr-1" /> Remover
                    </Button>
                  </div>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-[#e5e7eb] bg-[#f9fafb] cursor-pointer hover:bg-[#f3f4f6] transition-colors">
                  <ImagePlus className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Clique para anexar uma imagem</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) {
                        toast({ title: 'Imagem muito grande', description: 'Tamanho máximo: 5MB', variant: 'destructive' });
                        e.target.value = '';
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setImageDataUrl(reader.result as string);
                        setImageFileName(file.name);
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
              {imageDataUrl && isScheduled && (
                <p className="text-xs text-amber-600">
                  ⚠️ Imagens não são suportadas em envios agendados — só serão enviadas no envio imediato.
                </p>
              )}
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

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl border-[#e5e7eb] font-medium"
                disabled={!sending}
                onClick={() => {
                  const next = !pausedRef.current;
                  pausedRef.current = next;
                  setIsPaused(next);
                  toast({
                    title: next ? 'Envio pausado' : 'Envio retomado',
                    description: next
                      ? 'Clique em Retomar para continuar.'
                      : 'O envio continuará de onde parou.',
                  });
                }}
              >
                {isPaused ? '▶ Retomar' : '⏸ Pausar'}
              </Button>

              <Button
                variant="outline"
                className="w-full h-11 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 font-medium"
                disabled={!sending}
                onClick={() => {
                  cancelledRef.current = true;
                  pausedRef.current = false;
                  setIsPaused(false);
                  toast({
                    title: 'Cancelando envio…',
                    description: 'O envio será interrompido após a mensagem atual.',
                  });
                }}
              >
                <XIcon className="w-4 h-4 mr-1" /> Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
