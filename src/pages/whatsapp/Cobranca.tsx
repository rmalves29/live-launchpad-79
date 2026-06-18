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
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import BulkSendHistory from '@/components/whatsapp/BulkSendHistory';
import ZapiDisconnectedModal from '@/components/whatsapp/ZapiDisconnectedModal';

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
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [disconnectedModal, setDisconnectedModal] = useState<{ open: boolean; reason?: string; context?: 'precheck' | 'mid-send' }>({ open: false });
  
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

    // 🛡️ Pré-check: WhatsApp precisa estar conectado antes do disparo
    try {
      const { data: statusData, error: statusErr } = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
        body: { action: 'status', tenant_id: tenant.id }
      });
      if (statusErr) throw statusErr;
      if (!statusData?.connected) {
        setDisconnectedModal({
          open: true,
          reason: statusData?.message || 'A instância Z-API retornou status desconectado.',
          context: 'precheck',
        });
        return;
      }
    } catch (e: any) {
      setDisconnectedModal({
        open: true,
        reason: e?.message || 'Não foi possível verificar o status da Z-API.',
        context: 'precheck',
      });
      return;
    }

    // ============================================================
    // ENVIO SERVER-SIDE — o navegador apenas cria o job e dispara
    // a edge function. O loop completo roda no servidor, mesmo se
    // o usuário fechar a aba.
    // ============================================================
    const batchId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

    setSending(true);
    setSendProgress({ current: 0, total: customers.length });
    pausedRef.current = false;
    cancelledRef.current = false;
    setIsPaused(false);
    jobIdRef.current = null;

    // 1) Upload da imagem (se houver) → obtém URL pública
    let publicImageUrl: string | null = null;
    if (imageDataUrl) {
      try {
        const blobRes = await fetch(imageDataUrl);
        const blob = await blobRes.blob();
        const extMatch = (imageFileName || '').match(/\.([a-z0-9]+)$/i);
        const ext = (extMatch?.[1] || (blob.type.split('/')[1] || 'png')).toLowerCase();
        const path = `cobranca/${tenant.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabaseTenant.raw.storage
          .from('product-images')
          .upload(path, blob, { contentType: blob.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabaseTenant.raw.storage.from('product-images').getPublicUrl(path);
        publicImageUrl = pub.publicUrl;
      } catch (e: any) {
        toast({ title: 'Erro ao enviar imagem', description: e?.message || 'Falha no upload', variant: 'destructive' });
        setSending(false);
        return;
      }
    }

    // 2) Criar o job em sending_jobs com toda a configuração
    let jobId: string | null = null;
    try {
      const { data: jobRow, error: jobErr } = await supabaseTenant
        .from('sending_jobs')
        .insert({
          tenant_id: tenant.id,
          job_type: 'cobranca',
          status: 'running',
          total_items: customers.length,
          processed_items: 0,
          current_index: 0,
          started_at: new Date().toISOString(),
          job_data: {
            batchId,
            messageTemplate,
            imageUrl: publicImageUrl,
            buttonEnabled,
            buttonLabel,
            buttonUrl,
            tagId: selectedTagId && selectedTagId !== 'none' ? selectedTagId : null,
            delayBetweenMessages,
            messagesBeforePause,
            pauseDuration,
            sentCount: 0,
            errorCount: 0,
            customers: customers.map((c) => ({
              phone: c.customer_phone,
              name: c.customer_name || '',
              order_id: c.order_id || null,
              total_amount: c.total_amount || 0,
              payment_link: c.payment_link || '',
              items: (c.items || []).map((it) => ({
                product_name: it.product_name,
                product_code: it.product_code,
                qty: it.qty,
                unit_price: it.unit_price,
              })),
            })),
          },
        })
        .select('id')
        .single();
      if (jobErr) throw jobErr;
      jobId = (jobRow as any).id;
      jobIdRef.current = jobId;
    } catch (e: any) {
      toast({ title: 'Erro ao registrar envio', description: e?.message || 'Falha ao criar job', variant: 'destructive' });
      setSending(false);
      return;
    }

    // 3) Disparar a edge function (fire-and-forget — roda em background no servidor)
    supabaseTenant.raw.functions
      .invoke('cobranca-process', { body: { job_id: jobId, tenant_id: tenant.id } })
      .catch((e) => console.warn('Falha ao invocar cobranca-process:', e));

    toast({
      title: 'Envio iniciado no servidor',
      description: `Os ${customers.length} envios continuarão mesmo se você fechar a aba.`,
    });

    // 4) Polling de progresso (2s) — lê processed_items + status do job
    const pollIntervalId = window.setInterval(async () => {
      if (!jobIdRef.current) return;
      try {
        const { data } = await supabaseTenant
          .from('sending_jobs')
          .select('status, processed_items, total_items, job_data, error_message')
          .eq('id', jobIdRef.current)
          .maybeSingle();
        if (!data) return;
        const d: any = data;
        setSendProgress({
          current: d.processed_items || 0,
          total: d.total_items || customers.length,
        });

        if (d.status === 'paused') {
          if (!pausedRef.current) {
            pausedRef.current = true;
            setIsPaused(true);
          }
          if (typeof d.error_message === 'string' && /desconect|qrcode|qr.code|session|sessão/i.test(d.error_message)) {
            setDisconnectedModal((cur) =>
              cur.open ? cur : { open: true, reason: d.error_message, context: 'mid-send' },
            );
          }
        } else if (d.status === 'running' && pausedRef.current) {
          pausedRef.current = false;
          setIsPaused(false);
        }

        if (d.status === 'completed' || d.status === 'cancelled' || d.status === 'error') {
          const sent = d.job_data?.sentCount ?? 0;
          const errs = d.job_data?.errorCount ?? 0;
          window.clearInterval(pollIntervalId);
          jobIdRef.current = null;
          setSending(false);
          setSendProgress({ current: 0, total: 0 });
          pausedRef.current = false;
          cancelledRef.current = false;
          setIsPaused(false);
          setHistoryRefreshKey((k) => k + 1);

          toast({
            title:
              d.status === 'cancelled'
                ? 'Envio cancelado'
                : d.status === 'error'
                ? 'Envio com erro'
                : 'Envio concluído',
            description: `${sent} enviada(s), ${errs} erro(s)`,
            variant: d.status === 'error' ? 'destructive' : undefined,
          });
        }
      } catch (e) {
        console.warn('Erro no polling de progresso:', e);
      }
    }, 2000);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          WhatsApp <span className="text-muted-foreground font-semibold">— Cobrança Automática</span>
        </h1>
        <p className="text-muted-foreground mt-1">Configure o envio automático de cobranças para clientes pendentes</p>
      </div>

      {orphanJob && (
        <div className="rounded-xl border border-yellow-400/60 bg-yellow-50 dark:bg-yellow-950/20 p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <div className="font-semibold text-yellow-900 dark:text-yellow-200">
                Envio anterior detectado ({orphanJob.status})
              </div>
              <div className="text-sm text-yellow-800 dark:text-yellow-300">
                Progresso: {orphanJob.processed} de {orphanJob.total} processados. Esse envio ficou em aberto após recarregar a página.
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => window.open('/whatsapp/envios-ativos', '_blank')}>
              Ver no painel
            </Button>
            <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={cancelOrphanJob}>
              Cancelar envio antigo
            </Button>
          </div>
        </div>
      )}

      

      <ZapiDisconnectedModal
        open={disconnectedModal.open}
        onClose={() => setDisconnectedModal({ open: false })}
        reason={disconnectedModal.reason}
        context={disconnectedModal.context}
      />


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
              {(() => {
                const remaining = sending
                  ? Math.max((sendProgress.total || customers.length) - sendProgress.current, 0)
                  : customers.length;
                if (remaining <= 0) return null;
                const pauses = messagesBeforePause > 0 ? Math.floor(remaining / messagesBeforePause) : 0;
                const totalSec = remaining * delayBetweenMessages + pauses * pauseDuration;
                const h = Math.floor(totalSec / 3600);
                const m = Math.floor((totalSec % 3600) / 60);
                const s = totalSec % 60;
                const formatted = h > 0 ? `${h}h ${m}min` : m > 0 ? `${m}min ${s}s` : `${s}s`;
                return (
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {sending ? 'Tempo restante estimado' : 'Tempo estimado total'}
                    </span>
                    <span className="font-medium text-foreground">{formatted}</span>
                  </div>
                );
              })()}
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
                onClick={async () => {
                  const next = !pausedRef.current;
                  pausedRef.current = next;
                  setIsPaused(next);
                  if (jobIdRef.current) {
                    const patch: any = { status: next ? 'paused' : 'running' };
                    if (next) patch.paused_at = new Date().toISOString();
                    try {
                      await supabaseTenant.from('sending_jobs').update(patch).eq('id', jobIdRef.current);
                    } catch {}
                    // Ao retomar, reinvoca a edge function para continuar do índice atual
                    if (!next && tenant?.id) {
                      supabaseTenant.raw.functions
                        .invoke('cobranca-process', { body: { job_id: jobIdRef.current, tenant_id: tenant.id } })
                        .catch((e) => console.warn('Falha ao retomar cobranca-process:', e));
                    }
                  }
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
                  if (jobIdRef.current) {
                    supabaseTenant
                      .from('sending_jobs')
                      .update({ status: 'cancelled', completed_at: new Date().toISOString(), error_message: 'Cancelado pelo usuário' })
                      .eq('id', jobIdRef.current)
                      .then(() => {}, () => {});
                  }
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

      <BulkSendHistory refreshKey={historyRefreshKey} />
    </div>
  );
}
