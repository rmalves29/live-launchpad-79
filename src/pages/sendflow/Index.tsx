import { useState, useEffect, useCallback } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';
import { useDebounce } from '@/hooks/useDebounce';
import { useBackendSendFlow } from '@/hooks/useBackendSendFlow';
import { SendingJob } from '@/hooks/useSendingJob';
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
  const backendSendFlow = useBackendSendFlow();

  // Estados principais
  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [prioritizedProductIds, setPrioritizedProductIds] = useState<number[]>([]); // Ordem de prioridade dos produtos
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [messageTemplate, setMessageTemplate] = useState('');
  const [perGroupDelaySeconds, setPerGroupDelaySeconds] = useState(10);
  const [perProductDelayMinutes, setPerProductDelayMinutes] = useState(3);
  
  // Estados para delays randomizados (anti-bloqueio)
  const [useRandomDelay, setUseRandomDelay] = useState(true); // Ativado por padrão
  const [minGroupDelaySeconds, setMinGroupDelaySeconds] = useState(3);
  const [maxGroupDelaySeconds, setMaxGroupDelaySeconds] = useState(15);
  
  // Estados de controle
  const [loading, setLoading] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [sending, setSending] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [showResumeControl, setShowResumeControl] = useState(true);
  
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
        .select('*', { count: 'exact' })
        .eq('is_active', true);

      // Aplicar filtro de tipo de venda
      if (saleTypeFilter === 'BAZAR') {
        query = query.in('sale_type', ['BAZAR', 'AMBOS']);
      } else if (saleTypeFilter === 'LIVE') {
        query = query.in('sale_type', ['LIVE', 'AMBOS']);
      }

      // Mesma regra do /produtos: PostgREST pode impor max-rows (1000).
      // Pagina em lotes e concatena até 9999.
      const pageSize = 1000;
      const maxTotal = 9999;

      let all: Product[] = [];
      let from = 0;
      let totalCount: number | null = null;

      while (all.length < maxTotal) {
        const to = Math.min(from + pageSize - 1, maxTotal - 1);
        const { data, error, count } = await query.order('code').range(from, to);
        if (error) throw error;
        if (from === 0) totalCount = count ?? null;

        const chunk = (data ?? []) as Product[];
        all = all.concat(chunk);
        if (chunk.length < pageSize) break;
        from += pageSize;
      }

      console.log('📦 [SendFlow] Produtos carregados:', all.length, '| count(exact):', totalCount, '| pagesize:', pageSize);

      setProducts(all);
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

  // Handler principal para iniciar envio (processado no backend)
  const handleSendMessages = async () => {
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

    setSending(true);

    try {
      // Preparar dados do job mantendo a ordem priorizada
      const orderedProductIds = prioritizedProductIds.filter(id => selectedProducts.has(id));
      const selectedGroupArray = [...new Set(Array.from(selectedGroups))];
      
      console.log('📋 Ordem de envio determinada:', orderedProductIds);

      // Prepare product/group info for task generation
      const selectedProductList = orderedProductIds
        .map(id => products.find(p => p.id === id))
        .filter((p): p is Product => p !== undefined)
        .map(p => ({ id: p.id, code: p.code }));

      const selectedGroupList = selectedGroupArray.map(gid => {
        const group = groups.find(g => g.id === gid);
        return { id: gid, name: group?.name || gid };
      });

      // Iniciar job no backend com task queue
      const jobId = await backendSendFlow.startSendFlowJob(
        {
          productIds: orderedProductIds,
          groupIds: selectedGroupArray,
          messageTemplate,
          perGroupDelaySeconds,
          perProductDelayMinutes: perProductDelayMinutes || 3, // Padrão 3 minutos
          useRandomDelay,
          minGroupDelaySeconds,
          maxGroupDelaySeconds
        },
        selectedProductList,
        selectedGroupList
      );

      if (jobId) {
        // Limpar seleções após iniciar
        setSelectedProducts(new Set());
        setSelectedGroups(new Set());
        setPrioritizedProductIds([]);
      }
    } catch (error: any) {
      console.error('Erro ao iniciar envio:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao iniciar envio',
        variant: 'destructive'
      });
    } finally {
      setSending(false);
    }
  };

  // Handler para retomar job pausado/interrompido
  const handleResumeJob = useCallback(async (job: SendingJob) => {
    await backendSendFlow.resumeSendFlowJob(job.id);
  }, [backendSendFlow]);

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

      {/* Progresso em tempo real de envio em outro dispositivo (com opção de retomar se travado) */}
      {!sending && (
        <SendingProgressLive jobType="sendflow" onResumeJob={handleResumeJob} />
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
          <CardDescription>
            Configure os intervalos entre mensagens para evitar bloqueios do WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Modo Anti-Bloqueio */}
          <div className="p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10">
                  <RefreshCw className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <Label className="text-base font-semibold">Modo Anti-Bloqueio</Label>
                  <p className="text-sm text-muted-foreground">
                    Usa intervalos aleatórios para simular comportamento humano
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${useRandomDelay ? 'text-primary' : 'text-muted-foreground'}`}>
                  {useRandomDelay ? 'Ativado' : 'Desativado'}
                </span>
                <Checkbox
                  checked={useRandomDelay}
                  onCheckedChange={(checked) => setUseRandomDelay(checked === true)}
                  className="h-5 w-5"
                />
              </div>
            </div>

            {useRandomDelay && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-3 bg-background rounded-lg">
                <div>
                  <Label className="text-sm">Intervalo mínimo (segundos)</Label>
                  <Input
                    type="number"
                    value={minGroupDelaySeconds}
                    onChange={(e) => setMinGroupDelaySeconds(Math.max(1, Number(e.target.value)))}
                    min={1}
                    max={maxGroupDelaySeconds}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm">Intervalo máximo (segundos)</Label>
                  <Input
                    type="number"
                    value={maxGroupDelaySeconds}
                    onChange={(e) => setMaxGroupDelaySeconds(Math.max(minGroupDelaySeconds, Number(e.target.value)))}
                    min={minGroupDelaySeconds}
                    max={120}
                    className="mt-1"
                  />
                </div>
                <p className="col-span-full text-xs text-muted-foreground">
                  ⚡ Cada mensagem terá um delay aleatório entre {minGroupDelaySeconds}s e {maxGroupDelaySeconds}s
                </p>
              </div>
            )}
          </div>

          {/* Configuração de delay fixo (quando randomização está desativada) */}
          {!useRandomDelay && (
            <div>
              <Label>Delay entre grupos (segundos)</Label>
              <Input
                type="number"
                value={perGroupDelaySeconds}
                onChange={(e) => setPerGroupDelaySeconds(Number(e.target.value))}
                min={1}
                max={3600}
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Tempo fixo de espera entre envios para grupos consecutivos
              </p>
            </div>
          )}

          <Separator />

          <div>
            <Label>Delay entre produtos (minutos)</Label>
            <Input
              type="number"
              value={perProductDelayMinutes}
              onChange={(e) => setPerProductDelayMinutes(Number(e.target.value))}
              min={0}
              max={1440}
              className="mt-1"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Após enviar um produto para todos os grupos, aguardar X minutos antes do próximo produto
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Status do Envio - Gerenciado pelo SendingProgressLive acima */}

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
