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
import { Loader2, Send, Users, Calendar, Filter, Tag, RefreshCw } from 'lucide-react';
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
    orderDate: ''
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
  const [delayBetweenMessages, setDelayBetweenMessages] = useState(3); // segundos entre cada mensagem
  const [messagesBeforePause, setMessagesBeforePause] = useState(10); // qtd de mensagens antes da pausa
  const [pauseDuration, setPauseDuration] = useState(30); // segundos de pausa a cada X mensagens

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
      console.error('❌ Erro ao carregar tags:', error);
      toast({
        title: 'Aviso',
        description: error?.message || 'Não foi possível carregar as tags do WhatsApp',
        variant: 'destructive'
      });
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

        // Personalizar mensagem com nome do cliente se disponível
        let personalizedMessage = messageTemplate;
        if (customer.customer_name) {
          personalizedMessage = personalizedMessage.replace(/\{\{nome\}\}/g, customer.customer_name);
        }

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
              message: personalizedMessage
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
            message: personalizedMessage,
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

        // Sistema de delay customizado
        if (i < customers.length - 1) {
          // Delay entre cada mensagem
          await new Promise(resolve => setTimeout(resolve, delayBetweenMessages * 1000));
          
          // Pausa maior a cada X mensagens
          if ((i + 1) % messagesBeforePause === 0) {
            console.log(`⏸️ Pausa de ${pauseDuration}s após ${i + 1} mensagens`);
            await new Promise(resolve => setTimeout(resolve, pauseDuration * 1000));
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

      {/* Card de Tags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5" />
            Tag do WhatsApp
          </CardTitle>
          <CardDescription>
            Selecione uma tag para aplicar a todos os contatos que receberão a mensagem
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="tag">Tag (opcional)</Label>
              <Select
                value={selectedTagId}
                onValueChange={setSelectedTagId}
              >
                <SelectTrigger id="tag" className="w-full">
                  <SelectValue placeholder="Selecione uma tag..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma tag</SelectItem>
                  {tags.filter(tag => tag.id && tag.id !== '').map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: getTagColor(tag.color) }}
                        />
                        {tag.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-6">
              <Button
                variant="outline"
                size="icon"
                onClick={loadTags}
                disabled={loadingTags}
                title="Recarregar tags"
              >
                <RefreshCw className={`w-4 h-4 ${loadingTags ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          {tags.length === 0 && !loadingTags && (
            <p className="text-sm text-muted-foreground mt-2">
              Nenhuma tag encontrada. Crie tags no WhatsApp Business para utilizá-las aqui.
            </p>
          )}
          {selectedTagId && selectedTagId !== 'none' && (
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="secondary">
                <Tag className="w-3 h-3 mr-1" />
                Tag selecionada: {tags.find(t => t.id === selectedTagId)?.name}
              </Badge>
            </div>
          )}
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

      {/* Card de Configurações de Envio */}
      <Card>
        <CardHeader>
          <CardTitle>⏱️ Configurações de Timer (Anti-Bloqueio)</CardTitle>
          <CardDescription>
            Configure os intervalos de envio para evitar bloqueio do chip
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="delayBetweenMessages">
                Delay entre mensagens (segundos)
              </Label>
              <Input
                id="delayBetweenMessages"
                type="number"
                min="1"
                max="60"
                value={delayBetweenMessages}
                onChange={(e) => setDelayBetweenMessages(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Pausa após cada mensagem enviada
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="messagesBeforePause">
                Mensagens antes da pausa maior
              </Label>
              <Input
                id="messagesBeforePause"
                type="number"
                min="1"
                max="100"
                value={messagesBeforePause}
                onChange={(e) => setMessagesBeforePause(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Quantidade de mensagens em lote
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pauseDuration">
                Duração da pausa maior (segundos)
              </Label>
              <Input
                id="pauseDuration"
                type="number"
                min="5"
                max="300"
                value={pauseDuration}
                onChange={(e) => setPauseDuration(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Pausa a cada lote de mensagens
              </p>
            </div>
          </div>
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
