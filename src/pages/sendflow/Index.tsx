import { useState, useEffect, useRef, useCallback } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';
import { useDebounce } from '@/hooks/useDebounce';
import { useSendingActivity } from '@/hooks/useSendingActivity';
import { useSendingJob, SendingJob, SendingJobData } from '@/hooks/useSendingJob';
import SendingControl from '@/components/SendingControl';
import SendingProgressLive from '@/components/SendingProgressLive';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Send, Save, Users, Package, Clock, RefreshCw, CheckCircle2, XCircle, Search, Pause, Play, Square, GripVertical } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ZoomableImage } from '@/components/ui/zoomable-image';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Product {
  id: number;
  code: string;
  name: string;
  color?: string;
  size?: string;
  price: number;
  image_url?: string;
}

interface WhatsAppGroup {
  id: string;
  name: string;
  participantCount?: number;
}

// Componente Sortable para cada produto na lista de priorização
function SortableProductItem({ 
  product, 
  index, 
  totalItems,
  onPositionChange 
}: { 
  product: Product; 
  index: number;
  totalItems: number;
  onPositionChange: (productId: number, newPosition: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(index + 1));
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const handlePositionSubmit = () => {
    const newPos = parseInt(editValue, 10);
    if (!isNaN(newPos) && newPos >= 1 && newPos <= totalItems && newPos !== index + 1) {
      onPositionChange(product.id, newPos);
    }
    setIsEditing(false);
    setEditValue(String(index + 1));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handlePositionSubmit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(String(index + 1));
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 rounded-lg border bg-card ${
        isDragging ? 'shadow-lg opacity-90 bg-accent' : 'hover:bg-accent/50'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
          title="Arraste para reordenar"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        {isEditing ? (
          <Input
            type="number"
            min={1}
            max={totalItems}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handlePositionSubmit}
            onKeyDown={handleKeyDown}
            className="w-14 h-7 text-center font-mono text-sm"
            autoFocus
          />
        ) : (
          <Badge 
            variant="secondary" 
            className="font-mono w-10 justify-center cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={() => {
              setEditValue(String(index + 1));
              setIsEditing(true);
            }}
            title="Clique para editar a posição"
          >
            {index + 1}º
          </Badge>
        )}
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-8 h-8 object-cover rounded"
          />
        ) : (
          <div className="w-8 h-8 bg-muted rounded flex items-center justify-center">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <span className="font-mono text-sm text-muted-foreground">{product.code}</span>
        <span className="font-medium">{product.name}</span>
      </div>
    </div>
  );
}

export default function SendFlow() {
  const { toast } = useToast();
  const { tenant } = useTenant();
  const sendingActivity = useSendingActivity();
  const sendingJob = useSendingJob();

  // Estados principais
  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [prioritizedProductIds, setPrioritizedProductIds] = useState<number[]>([]); // Ordem de prioridade dos produtos
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [messageTemplate, setMessageTemplate] = useState('');
  const [perGroupDelaySeconds, setPerGroupDelaySeconds] = useState(10);
  const [perProductDelayMinutes, setPerProductDelayMinutes] = useState(1);
  
  // Estados de controle
  const [loading, setLoading] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingStatus, setSendingStatus] = useState<'idle' | 'validating' | 'sending' | 'paused' | 'completed'>('idle');
  const [totalMessages, setTotalMessages] = useState(0);
  const [sentMessages, setSentMessages] = useState(0);
  const [errorMessages, setErrorMessages] = useState(0);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [showResumeControl, setShowResumeControl] = useState(true);
  
  // Estados para countdown visual
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [currentProductIndex, setCurrentProductIndex] = useState(0);
  const [totalProductsToSend, setTotalProductsToSend] = useState(0);
  const [isWaitingForNextProduct, setIsWaitingForNextProduct] = useState(false);
  
  // Refs para controle de pausa/cancelamento
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const currentJobIdRef = useRef<string | null>(null);
  
  // Estados de busca
  const [groupSearch, setGroupSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [saleTypeFilter, setSaleTypeFilter] = useState<'ALL' | 'BAZAR' | 'LIVE'>('ALL');
  
  // Debounce para buscas
  const debouncedGroupSearch = useDebounce(groupSearch, 300);
  const debouncedProductSearch = useDebounce(productSearch, 300);
  
  // Helper para extrair número do código (C001 -> 1, C100 -> 100)
  const extractCodeNumber = (code: string): number => {
    const match = code.match(/[Cc]?(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };
  
  // Filtros
  const filteredGroups = groups.filter(group => 
    group.name.toLowerCase().includes(debouncedGroupSearch.toLowerCase())
  );
  
  const filteredProducts = products
    .filter(product => 
      product.name.toLowerCase().includes(debouncedProductSearch.toLowerCase()) ||
      product.code.toLowerCase().includes(debouncedProductSearch.toLowerCase())
    )
    .sort((a, b) => extractCodeNumber(a.code) - extractCodeNumber(b.code));
  
  // Lista de produtos priorizados para exibição (garantir sem duplicatas)
  const prioritizedProducts = [...new Set(prioritizedProductIds)]
    .map(id => products.find(p => p.id === id))
    .filter((p): p is Product => p !== undefined);

  // Carregar dados iniciais
  useEffect(() => {
    if (tenant?.id) {
      loadProducts();
      loadTemplate();
      loadGroups();
      checkWhatsAppConnection();
    }
  }, [tenant?.id, saleTypeFilter]);

  const checkWhatsAppConnection = async () => {
    if (!tenant?.id) return;

    setCheckingConnection(true);
    try {
      const { data, error } = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
        body: { action: 'status', tenant_id: tenant.id }
      });

      // Silenciar erros - apenas definir como desconectado
      if (error) {
        console.log('WhatsApp não configurado ou erro de conexão:', error.message);
        setWhatsappConnected(false);
        return;
      }

      setWhatsappConnected(data?.connected === true);
    } catch (error) {
      // Silenciar erros - não exibir toast
      console.log('WhatsApp não conectado');
      setWhatsappConnected(false);
    } finally {
      setCheckingConnection(false);
    }
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      let query = supabaseTenant
        .from('products')
        .select('*')
        .eq('is_active', true);

      // Aplicar filtro de tipo de venda
      if (saleTypeFilter === 'BAZAR') {
        query = query.in('sale_type', ['BAZAR', 'AMBOS']);
      } else if (saleTypeFilter === 'LIVE') {
        query = query.in('sale_type', ['LIVE', 'AMBOS']);
      }

      const { data, error } = await query.order('code');

      if (error) throw error;
      setProducts(data || []);
      setSelectedProducts(new Set()); // Limpar seleção ao mudar filtro
      setPrioritizedProductIds([]); // Limpar priorização ao mudar filtro
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar produtos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadTemplate = async () => {
    try {
      const { data, error } = await supabaseTenant
        .from('whatsapp_templates')
        .select('content')
        .eq('type', 'SENDFLOW')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setMessageTemplate(data.content);
      } else {
        const defaultTemplate = 
          '🛍️ *{{nome}}* ({{codigo}})\n\n' +
          '🎨 Cor: {{cor}}\n' +
          '📏 Tamanho: {{tamanho}}\n' +
          '💰 Valor: {{valor}}\n\n' +
          '📱 Para comprar, digite apenas o código: *{{codigo}}*';
        setMessageTemplate(defaultTemplate);
      }
    } catch (error) {
      console.error('Erro ao carregar template:', error);
    }
  };

  const loadGroups = async () => {
    if (!tenant?.id) return;

    setLoadingGroups(true);
    try {
      const { data, error } = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
        body: { action: 'list-groups', tenant_id: tenant.id }
      });

      if (error) throw error;

      // Z-API returns array of chats, filter only groups (isGroup: true)
      let groupsList: WhatsAppGroup[] = [];
      
      if (Array.isArray(data)) {
        const groupsFromApi = data.filter((chat: any) => chat.isGroup === true);
        
        // Usa os dados disponíveis diretamente, sem chamadas extras de group-metadata
        groupsList = groupsFromApi.map((chat: any) => ({
          id: chat.phone || chat.id,
          name: chat.name || chat.phone || 'Grupo sem nome',
          // Z-API /chats pode incluir participantCount em alguns casos
          participantCount: chat.participantCount || chat.participants?.length || undefined
        }));
      } else if (data?.groups && Array.isArray(data.groups)) {
        groupsList = data.groups.map((g: any) => ({
          id: g.id || g.phone,
          name: g.name || 'Grupo sem nome',
          participantCount: g.participantCount || g.participants?.length || undefined
        }));
      }
      
      setGroups(groupsList);
      
      if (groupsList.length > 0) {
        toast({
          title: 'Grupos carregados',
          description: `${groupsList.length} grupo(s) encontrado(s)`,
        });
      } else {
        toast({
          title: 'Aviso',
          description: 'Nenhum grupo encontrado. Verifique se o WhatsApp está conectado.',
        });
      }
    } catch (error: any) {
      // Silenciar erros de grupos quando WhatsApp não configurado
      console.log('Erro ao carregar grupos (WhatsApp pode não estar conectado):', error?.message);
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  const saveTemplate = async () => {
    if (!messageTemplate.trim()) {
      toast({
        title: 'Erro',
        description: 'Digite um template de mensagem',
        variant: 'destructive'
      });
      return;
    }

    try {
      const { error } = await supabaseTenant
        .from('whatsapp_templates')
        .upsert({
          type: 'SENDFLOW',
          title: 'SendFlow - Divulgação em Grupos',
          content: messageTemplate
        }, {
          onConflict: 'tenant_id,type'
        });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Template salvo com sucesso',
      });
    } catch (error) {
      console.error('Erro ao salvar template:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao salvar template',
        variant: 'destructive'
      });
    }
  };

  const toggleProduct = (productId: number) => {
    const newSelection = new Set(selectedProducts);
    if (newSelection.has(productId)) {
      newSelection.delete(productId);
      // Remover da lista de priorização
      setPrioritizedProductIds(prev => prev.filter(id => id !== productId));
    } else {
      newSelection.add(productId);
      // Adicionar ao final da lista de priorização apenas se não existir (usar Set para garantir)
      setPrioritizedProductIds(prev => {
        const uniqueIds = new Set(prev);
        if (uniqueIds.has(productId)) return prev;
        return [...prev, productId];
      });
    }
    setSelectedProducts(newSelection);
  };

  const toggleAllProducts = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
      setPrioritizedProductIds([]);
    } else {
      const allIds = filteredProducts.map(p => p.id);
      setSelectedProducts(new Set(allIds));
      // Garantir IDs únicos na ordem atual (código)
      setPrioritizedProductIds([...new Set(allIds)]);
    }
  };
  
  // Drag & Drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Handler para drag & drop
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPrioritizedProductIds((items) => {
        const oldIndex = items.indexOf(active.id as number);
        const newIndex = items.indexOf(over.id as number);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Função para mudar a posição de um produto diretamente pelo número
  const handlePositionChange = (productId: number, newPosition: number) => {
    setPrioritizedProductIds((items) => {
      const currentIndex = items.indexOf(productId);
      if (currentIndex === -1) return items;
      
      // newPosition é 1-indexed, precisamos converter para 0-indexed
      const targetIndex = Math.max(0, Math.min(newPosition - 1, items.length - 1));
      
      if (currentIndex === targetIndex) return items;
      
      return arrayMove(items, currentIndex, targetIndex);
    });
  };

  const toggleGroup = (groupId: string) => {
    const newSelection = new Set(selectedGroups);
    if (newSelection.has(groupId)) {
      newSelection.delete(groupId);
    } else {
      newSelection.add(groupId);
    }
    setSelectedGroups(newSelection);
  };

  const toggleAllGroups = () => {
    if (selectedGroups.size === groups.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(groups.map(g => g.id)));
    }
  };

  const formatPrice = (price: number) => {
    return `R$ ${price.toFixed(2).replace('.', ',')}`;
  };

  const personalizeMessage = (product: Product) => {
    let message = messageTemplate;
    
    // Replace basic variables - trim para evitar espaços que quebram formatação do WhatsApp
    // O WhatsApp exige que asteriscos de negrito estejam colados ao texto (*texto* funciona, * texto * não funciona)
    message = message
      .replace(/\{\{?codigo\}?\}/gi, product.code.trim())
      .replace(/\{\{?nome\}?\}/gi, product.name.trim())
      .replace(/\{\{?valor\}?\}/gi, formatPrice(product.price));
    
    // Handle color - remove entire line if empty, trim para evitar quebra de formatação
    if (product.color && product.color.trim()) {
      message = message.replace(/\{\{?cor\}?\}/gi, product.color.trim());
    } else {
      // Remove lines containing color placeholder
      message = message.replace(/.*\{\{?cor\}?\}.*\n?/gi, '');
    }
    
    // Handle size - remove entire line if empty, trim para evitar quebra de formatação
    if (product.size && product.size.trim()) {
      message = message.replace(/\{\{?tamanho\}?\}/gi, product.size.trim());
    } else {
      // Remove lines containing size placeholder
      message = message.replace(/.*\{\{?tamanho\}?\}.*\n?/gi, '');
    }
    
    // Clean up multiple consecutive line breaks
    message = message.replace(/\n{3,}/g, '\n\n');
    
    return message.trim();
  };

  const handleSendMessages = async (resumeData?: SendingJobData, resumeJobId?: string) => {
    // Se não for retomando, validar seleções
    if (!resumeData) {
      if (selectedProducts.size === 0) {
        toast({
          title: 'Erro',
          description: 'Selecione pelo menos um produto',
          variant: 'destructive'
        });
        return;
      }

      if (selectedGroups.size === 0) {
        toast({
          title: 'Erro',
          description: 'Selecione pelo menos um grupo',
          variant: 'destructive'
        });
        return;
      }

      if (!messageTemplate.trim()) {
        toast({
          title: 'Erro',
          description: 'Digite um template de mensagem',
          variant: 'destructive'
        });
        return;
      }
    }

    setSending(true);
    setSendingStatus('validating');
    setShowResumeControl(false);

    try {
      // 1. Verificar conexão WhatsApp via Z-API
      const { data: statusData, error: statusError } = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
        body: { action: 'status', tenant_id: tenant?.id }
      });

      if (statusError || !statusData?.connected) {
        toast({
          title: 'WhatsApp não conectado',
          description: 'Conecte o WhatsApp antes de enviar mensagens',
          variant: 'destructive',
          duration: 8000
        });
        setSending(false);
        setSendingStatus('idle');
        setShowResumeControl(true);
        return;
      }

      // 2. Preparar mensagens - usar ordem priorizada (garantir IDs únicos)
      setSendingStatus('sending');
      
      // Se estiver retomando, usar dados do job, senão usar seleção atual
      let selectedProductArray: Product[];
      let selectedGroupArray: string[];
      let startProductIndex = 0;
      let startGroupIndex = 0;
      let initialSentCount = 0;
      let initialErrorCount = 0;

      if (resumeData) {
        // Retomando job pausado - validar dados antes de usar
        const productIds = Array.isArray(resumeData.productIds) ? resumeData.productIds : [];
        const groupIds = Array.isArray(resumeData.groupIds) ? resumeData.groupIds : [];
        
        if (productIds.length === 0 || groupIds.length === 0) {
          toast({
            title: 'Erro ao retomar',
            description: 'Os dados do envio pausado estão incompletos. Inicie um novo envio.',
            variant: 'destructive'
          });
          setSending(false);
          setSendingStatus('idle');
          setShowResumeControl(true);
          // Cancelar job corrompido
          if (resumeJobId) {
            await sendingJob.cancelJob(resumeJobId);
          }
          return;
        }
        
        selectedProductArray = productIds
          .map(id => products.find(p => p.id === id))
          .filter((p): p is Product => p !== undefined);
        selectedGroupArray = groupIds;
        startProductIndex = resumeData.currentProductIndex || 0;
        startGroupIndex = resumeData.currentGroupIndex || 0;
        initialSentCount = resumeData.sentMessages || 0;
        initialErrorCount = resumeData.errorMessages || 0;
        setPerGroupDelaySeconds(resumeData.perGroupDelaySeconds || 5);
        setPerProductDelayMinutes(resumeData.perProductDelayMinutes || 1);
        if (resumeData.messageTemplate) {
          setMessageTemplate(resumeData.messageTemplate);
        }
        
        if (resumeJobId) {
          currentJobIdRef.current = resumeJobId;
          await sendingJob.resumeJob(resumeJobId);
        }
      } else {
        const uniqueProductIds = [...new Set(prioritizedProductIds)];
        selectedProductArray = uniqueProductIds
          .map(id => products.find(p => p.id === id))
          .filter((p): p is Product => p !== undefined && selectedProducts.has(p.id));
        selectedGroupArray = [...new Set(Array.from(selectedGroups))];
      }

      const total = selectedProductArray.length * selectedGroupArray.length;
      setTotalMessages(total);

      console.log(`📦 Enviando ${total} mensagens via Z-API...`);

      // Reset counters and pause state
      setSentMessages(initialSentCount);
      setErrorMessages(initialErrorCount);
      setCurrentProductIndex(startProductIndex);
      setTotalProductsToSend(selectedProductArray.length);
      setIsWaitingForNextProduct(false);
      setCountdownSeconds(0);
      isPausedRef.current = false;
      isCancelledRef.current = false;

      // Marcar envio como ativo (impede logout por timeout)
      sendingActivity.setActive();

      // Criar job no banco se não estiver retomando
      if (!resumeData) {
        const jobData: SendingJobData = {
          productIds: selectedProductArray.map(p => p.id),
          groupIds: selectedGroupArray,
          messageTemplate,
          perGroupDelaySeconds,
          perProductDelayMinutes,
          currentProductIndex: 0,
          currentGroupIndex: 0,
          sentMessages: 0,
          errorMessages: 0
        };
        const jobId = await sendingJob.createJob('sendflow', jobData, total);
        if (jobId) {
          currentJobIdRef.current = jobId;
        }
      }

      let sentCount = initialSentCount;
      let errorCount = initialErrorCount;

      // Helper function to wait while paused
      const waitWhilePaused = async () => {
        while (isPausedRef.current && !isCancelledRef.current) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      };

      // Helper para verificar se o job foi pausado/cancelado remotamente
      const checkJobStatusRemotely = async (): Promise<boolean> => {
        if (!currentJobIdRef.current) return true; // continua se não há job
        try {
          const { data } = await supabase
            .from('sending_jobs')
            .select('status')
            .eq('id', currentJobIdRef.current)
            .single();
          
          if (data?.status === 'paused') {
            isPausedRef.current = true;
            setSendingStatus('paused');
            toast({
              title: 'Envio pausado remotamente',
              description: 'O envio foi pausado de outro dispositivo.',
            });
            return false;
          }
          
          if (data?.status === 'cancelled') {
            isCancelledRef.current = true;
            setSendingStatus('cancelled');
            toast({
              title: 'Envio cancelado remotamente',
              description: 'O envio foi cancelado de outro dispositivo.',
            });
            return false;
          }
          
          return true; // continua normalmente
        } catch (error) {
          console.error('Erro ao verificar status do job:', error);
          return true; // em caso de erro, continua
        }
      };

      // Helper para atualizar progresso no banco
      const updateJobProgress = async (productIdx: number, groupIdx: number) => {
        if (currentJobIdRef.current) {
          sendingActivity.updateActivity(); // Mantém sessão viva
          await sendingJob.updateProgress(currentJobIdRef.current, sentCount + errorCount, productIdx, {
            currentProductIndex: productIdx,
            currentGroupIndex: groupIdx,
            sentMessages: sentCount,
            errorMessages: errorCount
          });
        }
      };

      // 3. Enviar mensagens com delays
      for (let productIdx = startProductIndex; productIdx < selectedProductArray.length; productIdx++) {
        if (isCancelledRef.current) break;
        
        const product = selectedProductArray[productIdx];
        const message = personalizeMessage(product);

        // Determinar índice inicial do grupo (se estiver retomando no meio de um produto)
        const groupStartIdx = (productIdx === startProductIndex) ? startGroupIndex : 0;

        // Enviar para todos os grupos
        for (let groupIndex = groupStartIdx; groupIndex < selectedGroupArray.length; groupIndex++) {
          if (isCancelledRef.current) break;
          
          const groupId = selectedGroupArray[groupIndex];
          const isLastGroup = groupIndex === selectedGroupArray.length - 1;

          // Wait if paused
          await waitWhilePaused();
          if (isCancelledRef.current) break;

          try {
            // Se o produto tem imagem, envia a imagem com o texto como legenda
            if (product.image_url) {
              const { error } = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
                body: {
                  action: 'send-group-image',
                  tenant_id: tenant?.id,
                  phone: groupId,
                  mediaUrl: product.image_url,
                  caption: message
                }
              });

              if (error) {
                console.error(`Erro ao enviar imagem para grupo ${groupId}:`, error);
                errorCount++;
                setErrorMessages(errorCount);
              } else {
                sentCount++;
                setSentMessages(sentCount);
              }
            } else {
              // Sem imagem, envia apenas texto
              const { error } = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
                body: {
                  action: 'send-group',
                  tenant_id: tenant?.id,
                  phone: groupId,
                  message: message
                }
              });

              if (error) {
                console.error(`Erro ao enviar para grupo ${groupId}:`, error);
                errorCount++;
                setErrorMessages(errorCount);
              } else {
                sentCount++;
                setSentMessages(sentCount);
              }
            }

            // Atualizar progresso no banco a cada mensagem enviada
            await updateJobProgress(productIdx, groupIndex + 1);

            // Delay entre grupos - NÃO espera após o último grupo (zera o delay)
            if (perGroupDelaySeconds > 0 && !isLastGroup && !isCancelledRef.current) {
              const delayMs = perGroupDelaySeconds * 1000;
              const delayStep = 500;
              let elapsed = 0;
              while (elapsed < delayMs && !isCancelledRef.current) {
            await waitWhilePaused();
            if (isCancelledRef.current) break;
            await new Promise(resolve => setTimeout(resolve, Math.min(delayStep, delayMs - elapsed)));
            elapsed += delayStep;
          }
        }
      } catch (err) {
        console.error(`Erro ao enviar para grupo ${groupId}:`, err);
        errorCount++;
        setErrorMessages(errorCount);
      }
    }

    // Delay entre produtos - começa a contar APÓS terminar de enviar para todos os grupos
    // NÃO espera após o último produto
    const isLastProduct = productIdx === selectedProductArray.length - 1;
    
    // Atualiza o índice do produto atual
    setCurrentProductIndex(productIdx + 1);
    
    if (perProductDelayMinutes > 0 && !isLastProduct && !isCancelledRef.current) {
      const delayMs = perProductDelayMinutes * 60 * 1000;
      const delayStep = 1000; // 1 segundo para atualizar o countdown
      let elapsed = 0;
      let checkCounter = 0;
      
      // Inicia o countdown visual
      setIsWaitingForNextProduct(true);
      setCountdownSeconds(Math.ceil(delayMs / 1000));
      
      while (elapsed < delayMs && !isCancelledRef.current) {
        await waitWhilePaused();
        if (isCancelledRef.current) break;
        
        // Verificar status remoto a cada 5 segundos durante o delay
        checkCounter++;
        if (checkCounter >= 5) {
          const shouldContinue = await checkJobStatusRemotely();
          if (!shouldContinue) break;
          checkCounter = 0;
        }
        
        await new Promise(resolve => setTimeout(resolve, Math.min(delayStep, delayMs - elapsed)));
        elapsed += delayStep;
        
        // Atualiza countdown (apenas se não estiver pausado)
        if (!isPausedRef.current) {
          const remainingSeconds = Math.ceil((delayMs - elapsed) / 1000);
          setCountdownSeconds(Math.max(0, remainingSeconds));
          
          // Atualizar countdown no banco a cada 5 segundos para sincronização em tempo real
          if (checkCounter === 0 && currentJobIdRef.current) {
            await sendingJob.updateProgress(currentJobIdRef.current, sentCount + errorCount, productIdx, {
              currentProductIndex: productIdx,
              currentGroupIndex: selectedGroupArray.length,
              sentMessages: sentCount,
              errorMessages: errorCount,
              countdownSeconds: remainingSeconds,
              isWaitingForNextProduct: true
            });
          }
        }
      }
      
      // Limpa o countdown
      setIsWaitingForNextProduct(false);
      setCountdownSeconds(0);
      
      // Limpar countdown no banco
      if (currentJobIdRef.current) {
        await sendingJob.updateProgress(currentJobIdRef.current, sentCount + errorCount, productIdx, {
          currentProductIndex: productIdx,
          currentGroupIndex: 0,
          sentMessages: sentCount,
          errorMessages: errorCount,
          countdownSeconds: 0,
          isWaitingForNextProduct: false
        });
      }
    }
  }

  // Marcar job como completo
  if (currentJobIdRef.current && !isCancelledRef.current) {
    await sendingJob.completeJob(currentJobIdRef.current);
  }

  // Desativar flag de envio
  sendingActivity.setInactive();
  currentJobIdRef.current = null;

  toast({
    title: '✅ Envio concluído!',
    description: `${sentCount} mensagens enviadas${errorCount > 0 ? `, ${errorCount} erros` : ''}.`,
    duration: 10000
  });

      setSendingStatus('completed');
      
      // Resetar após 3 segundos
      setTimeout(() => {
        setSendingStatus('idle');
        setSelectedProducts(new Set());
        setSelectedGroups(new Set());
        setShowResumeControl(true);
      }, 3000);

    } catch (error: any) {
      console.error('Erro ao enviar mensagens:', error);
      
      // Pausar job em caso de erro para poder retomar
      if (currentJobIdRef.current) {
        await sendingJob.pauseJob(currentJobIdRef.current);
      }
      sendingActivity.setInactive();
      
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao enviar mensagens',
        variant: 'destructive',
        duration: 8000
      });
      setSendingStatus('idle');
      setShowResumeControl(true);
    } finally {
      setSending(false);
    }
  };

  // Handler para retomar job pausado
  const handleResumeJob = useCallback(async (job: SendingJob) => {
    const jobData = job.job_data as SendingJobData;
    await handleSendMessages(jobData, job.id);
  }, [products, tenant?.id]);

  // Handler para cancelar envio atual
  const handleCancelSending = useCallback(async () => {
    isCancelledRef.current = true;
    if (currentJobIdRef.current) {
      await sendingJob.cancelJob(currentJobIdRef.current);
      currentJobIdRef.current = null;
    }
    sendingActivity.setInactive();
    setSendingStatus('idle');
    setSending(false);
    setShowResumeControl(true);
    toast({
      title: 'Envio cancelado',
      description: 'O envio foi interrompido.',
    });
  }, [sendingJob, sendingActivity, toast]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">SendFlow</h1>
          <p className="text-muted-foreground">Envio automatizado de produtos para grupos do WhatsApp</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={checkWhatsAppConnection}
            disabled={checkingConnection}
          >
            {checkingConnection ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Verificar Conexão</span>
          </Button>
          <Badge variant={whatsappConnected ? 'default' : 'destructive'}>
            {whatsappConnected ? (
              <>
                <CheckCircle2 className="h-3 w-3 mr-1" />
                WhatsApp Conectado
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 mr-1" />
                WhatsApp Desconectado
              </>
            )}
          </Badge>
        </div>
      </div>

      {/* Progresso em tempo real de envio em outro dispositivo */}
      {!sending && (
        <SendingProgressLive jobType="sendflow" />
      )}

      {/* Card para retomar envio pausado */}
      {showResumeControl && !sending && (
        <SendingControl 
          jobType="sendflow" 
          onResume={handleResumeJob}
        />
      )}

      {!whatsappConnected && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">⚠️ WhatsApp Desconectado</CardTitle>
            <CardDescription>
              Conecte o WhatsApp na página "Conexão WhatsApp" antes de enviar mensagens
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <CardTitle>Grupos do WhatsApp</CardTitle>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadGroups}
                disabled={loadingGroups}
              >
                {loadingGroups ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-2">Atualizar</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAllGroups}
                disabled={groups.length === 0}
              >
                {selectedGroups.size === groups.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
              </Button>
            </div>
          </div>
          <CardDescription>
            Selecione os grupos que receberão as mensagens ({selectedGroups.size} selecionado(s))
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Campo de busca de grupos */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar grupos..."
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {loadingGroups ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{groups.length === 0 ? 'Nenhum grupo encontrado' : 'Nenhum grupo corresponde à busca'}</p>
              {groups.length === 0 && <p className="text-sm">Certifique-se de que o WhatsApp está conectado</p>}
            </div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {filteredGroups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent cursor-pointer"
                  onClick={() => toggleGroup(group.id)}
                >
                  <Checkbox
                    checked={selectedGroups.has(group.id)}
                    onCheckedChange={() => toggleGroup(group.id)}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{group.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {group.participantCount !== undefined && group.participantCount > 0 
                        ? `${group.participantCount} participantes` 
                        : 'Grupo do WhatsApp'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        </Card>

        {/* Produtos */}
        <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              <CardTitle>Produtos</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Select value={saleTypeFilter} onValueChange={(value: 'ALL' | 'BAZAR' | 'LIVE') => setSaleTypeFilter(value)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Tipo de Evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="BAZAR">Bazar</SelectItem>
                  <SelectItem value="LIVE">Live</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAllProducts}
                disabled={products.length === 0}
              >
                {selectedProducts.size === products.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
              </Button>
            </div>
          </div>
          <CardDescription>
            Selecione os produtos que serão enviados ({selectedProducts.size} selecionado(s))
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Campo de busca de produtos */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou código..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{products.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum produto corresponde à busca'}</p>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead className="w-16">Foto</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cor</TableHead>
                    <TableHead>Tamanho</TableHead>
                    <TableHead>Preço</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow
                      key={product.id}
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => toggleProduct(product.id)}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedProducts.has(product.id)}
                          onCheckedChange={() => toggleProduct(product.id)}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ZoomableImage
                          src={product.image_url || ''}
                          alt={product.name}
                          className="w-10 h-10"
                          containerClassName="w-10 h-10 rounded"
                          fallback={
                            <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                              <Package className="h-4 w-4 text-muted-foreground" />
                            </div>
                          }
                        />
                      </TableCell>
                      <TableCell className="font-mono">{product.code}</TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.color || '-'}</TableCell>
                      <TableCell>{product.size || '-'}</TableCell>
                      <TableCell>{formatPrice(product.price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        </Card>
      </div>

      {/* Ordem de Envio / Priorização com Drag & Drop */}
      {prioritizedProducts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <GripVertical className="h-5 w-5" />
                <CardTitle>Ordem de Envio</CardTitle>
              </div>
              <Badge variant="outline">
                {prioritizedProducts.length} produto(s) selecionado(s)
              </Badge>
            </div>
            <CardDescription>
              Arraste os produtos para reorganizar a ordem de envio. O primeiro da lista será enviado primeiro.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={prioritizedProductIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {prioritizedProducts.map((product, index) => (
                    <SortableProductItem
                      key={product.id}
                      product={product}
                      index={index}
                      totalItems={prioritizedProducts.length}
                      onPositionChange={handlePositionChange}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </CardContent>
        </Card>
      )}

      {/* Template de Mensagem */}
      <Card>
        <CardHeader>
          <CardTitle>Template de Mensagem</CardTitle>
          <CardDescription>
            Use as variáveis: {'{'}{'{'} codigo {'}'}{'}'}, {'{'}{'{'} nome {'}'}{'}'}, {'{'}{'{'} cor {'}'}{'}'}, {'{'}{'{'} tamanho {'}'}{'}'}, {'{'}{'{'} valor {'}'}{'}'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            rows={8}
            placeholder="Digite o template da mensagem..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={saveTemplate}>
              <Save className="h-4 w-4 mr-2" />
              Salvar Template
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Configurações de Envio */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações de Envio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Delay entre grupos (segundos)</Label>
              <Input
                type="number"
                value={perGroupDelaySeconds}
                onChange={(e) => setPerGroupDelaySeconds(Number(e.target.value))}
                min={1}
                max={3600}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Tempo de espera entre envios para grupos consecutivos (por produto)
              </p>
            </div>

            <div>
              <Label>Delay entre produtos (minutos)</Label>
              <Input
                type="number"
                value={perProductDelayMinutes}
                onChange={(e) => setPerProductDelayMinutes(Number(e.target.value))}
                min={0}
                max={1440}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Após finalizar o envio do produto A para todos os grupos, aguardar X minutos antes de enviar o próximo produto
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status do Envio */}
      {sendingStatus !== 'idle' && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {sendingStatus === 'validating' && (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Validando conexão...
                </>
              )}
              {sendingStatus === 'sending' && (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Enviando mensagens... {sentMessages}/{totalMessages}
                </>
              )}
              {sendingStatus === 'paused' && (
                <>
                  <Pause className="h-5 w-5 text-yellow-500" />
                  Envio pausado - {sentMessages}/{totalMessages}
                </>
              )}
              {sendingStatus === 'completed' && (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Envio concluído!
                </>
              )}
            </CardTitle>
            <CardDescription>
              {sendingStatus === 'validating' && 'Verificando se o WhatsApp está conectado...'}
              {(sendingStatus === 'sending' || sendingStatus === 'paused') && (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>{sentMessages} enviadas de {totalMessages}</span>
                    <span>{Math.round((sentMessages / totalMessages) * 100)}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full transition-all duration-300 ${sendingStatus === 'paused' ? 'bg-yellow-500' : 'bg-primary'}`}
                      style={{ width: `${(sentMessages / totalMessages) * 100}%` }}
                    />
                  </div>
                  
                  {/* Countdown para próximo produto */}
                  {isWaitingForNextProduct && countdownSeconds > 0 && (
                    <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-card to-muted/30 rounded-xl border-2 border-primary/30 shadow-lg">
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 border border-primary/20">
                        <Clock className="h-5 w-5 text-primary animate-pulse" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">
                          Aguardando próximo produto...
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Produto {currentProductIndex} de {totalProductsToSend}
                        </span>
                      </div>
                      <div className="ml-auto flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-lg border border-primary/20">
                        <span className="text-xs text-muted-foreground">Tempo restante:</span>
                        <span className="font-mono text-lg font-bold text-primary">
                          {Math.floor(countdownSeconds / 60)}:{String(countdownSeconds % 60).padStart(2, '0')}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {errorMessages > 0 && (
                    <p className="text-destructive text-xs">{errorMessages} erro(s) encontrado(s)</p>
                  )}
                  <div className="flex gap-2 pt-2">
                    {sendingStatus === 'sending' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          isPausedRef.current = true;
                          setSendingStatus('paused');
                        }}
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        Pausar
                      </Button>
                    )}
                    {sendingStatus === 'paused' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          isPausedRef.current = false;
                          setSendingStatus('sending');
                        }}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Retomar
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        isCancelledRef.current = true;
                        isPausedRef.current = false;
                        setSendingStatus('idle');
                        setSending(false);
                        toast({
                          title: 'Envio cancelado',
                          description: `${sentMessages} mensagens foram enviadas antes do cancelamento.`,
                        });
                      }}
                    >
                      <Square className="h-4 w-4 mr-1" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
              {sendingStatus === 'completed' && `${sentMessages} mensagens enviadas${errorMessages > 0 ? `, ${errorMessages} erro(s)` : ''}`}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Botão de Envio */}
      <div className="flex flex-col items-center gap-3">
        {selectedProducts.size > 0 && selectedGroups.size > 0 && (
          <div className="text-center text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-lg">
            <Clock className="inline h-4 w-4 mr-1" />
            <span>
              Tempo estimado: {(() => {
                const numProducts = selectedProducts.size;
                const numGroups = selectedGroups.size;
                // Tempo para enviar todos os grupos de um produto (em segundos)
                const timePerProduct = numGroups * perGroupDelaySeconds;
                // Tempo total: (tempo por produto * produtos) + delays entre produtos
                const totalSeconds = (timePerProduct * numProducts) + ((numProducts - 1) * perProductDelayMinutes * 60);
                
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const seconds = totalSeconds % 60;
                
                if (hours > 0) {
                  return `${hours}h ${minutes}min ${seconds}s`;
                } else if (minutes > 0) {
                  return `${minutes}min ${seconds}s`;
                } else {
                  return `${seconds}s`;
                }
              })()}
            </span>
            <span className="ml-2 text-xs opacity-70">
              ({selectedProducts.size} produtos × {selectedGroups.size} grupos)
            </span>
          </div>
        )}
        <Button
          onClick={() => handleSendMessages()}
          disabled={
            sending ||
            selectedProducts.size === 0 ||
            selectedGroups.size === 0 ||
            !messageTemplate.trim() ||
            !whatsappConnected
          }
          size="lg"
          className="w-full max-w-md"
        >
          {sending ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send className="mr-2 h-5 w-5" />
              Enviar {selectedProducts.size > 0 && selectedGroups.size > 0 
                ? `${selectedProducts.size * selectedGroups.size} mensagens`
                : 'Mensagens'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
