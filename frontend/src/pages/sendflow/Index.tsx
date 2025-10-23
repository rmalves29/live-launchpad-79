import { useState, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Send, Save, Users, Package, Clock, Play, Pause, RefreshCw } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

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

export default function SendFlow() {
  const { toast } = useToast();
  const { tenant } = useTenant();

  // Estados principais
  const [products, setProducts] = useState<Product[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [messageTemplate, setMessageTemplate] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  
  // Estados de controle
  const [loading, setLoading] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [currentProduct, setCurrentProduct] = useState('');
  const [currentGroup, setCurrentGroup] = useState('');
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [isPausing, setIsPausing] = useState(false);
  const [pauseCountdown, setPauseCountdown] = useState(0);

  // Carregar dados iniciais
  useEffect(() => {
    if (tenant?.id) {
      loadProducts();
      loadTemplate();
      loadGroups();
    }
  }, [tenant?.id]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabaseTenant
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
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
        // Template padrão
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
      // Buscar integração WhatsApp
      const { data: integration, error: integrationError } = await supabaseTenant
        .from('integration_whatsapp')
        .select('api_url')
        .eq('is_active', true)
        .maybeSingle();

      if (integrationError) throw integrationError;

      if (!integration?.api_url) {
        toast({
          title: 'Aviso',
          description: 'Configure a integração WhatsApp nas configurações',
          variant: 'destructive'
        });
        return;
      }

      // Buscar grupos via API do servidor WhatsApp
      const response = await fetch(`${integration.api_url}/list-all-groups`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenant.id
        }
      });

      if (!response.ok) {
        throw new Error('Erro ao buscar grupos do WhatsApp');
      }

      const data = await response.json();

      if (data.success && data.groups && Array.isArray(data.groups)) {
        const maxGroups = tenant.max_whatsapp_groups;
        const limitedGroups = maxGroups && maxGroups > 0 
          ? data.groups.slice(0, maxGroups) 
          : data.groups;
        
        setGroups(limitedGroups);
        toast({
          title: 'Grupos carregados',
          description: `${limitedGroups.length} grupo(s) encontrado(s)`,
        });
      } else {
        setGroups([]);
        toast({
          title: 'Aviso',
          description: 'Nenhum grupo encontrado',
        });
      }
    } catch (error) {
      console.error('Erro ao carregar grupos:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar grupos do WhatsApp',
        variant: 'destructive'
      });
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
    } else {
      newSelection.add(productId);
    }
    setSelectedProducts(newSelection);
  };

  const toggleAllProducts = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map(p => p.id)));
    }
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
    return messageTemplate
      .replace(/\{\{codigo\}\}/g, product.code)
      .replace(/\{\{nome\}\}/g, product.name)
      .replace(/\{\{cor\}\}/g, product.color || 'N/A')
      .replace(/\{\{tamanho\}\}/g, product.size || 'N/A')
      .replace(/\{\{valor\}\}/g, formatPrice(product.price));
  };

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
      // Buscar integração WhatsApp
      const { data: integration } = await supabaseTenant
        .from('integration_whatsapp')
        .select('api_url')
        .eq('is_active', true)
        .maybeSingle();

      if (!integration?.api_url) {
        throw new Error('Integração WhatsApp não configurada');
      }

      const selectedProductArray = products.filter(p => selectedProducts.has(p.id));
      const selectedGroupArray = Array.from(selectedGroups);
      const totalMessages = selectedProductArray.length * selectedGroupArray.length;

      setSendProgress({ current: 0, total: totalMessages });

      let messageCount = 0;

      // LÓGICA CORRIGIDA: Envia TODOS os grupos de um produto, depois pausa
      for (let i = 0; i < selectedProductArray.length; i++) {
        const product = selectedProductArray[i];
        setCurrentProduct(product.name);
        const personalizedMessage = personalizeMessage(product);

        // Enviar para TODOS os grupos deste produto SEM pausar
        for (let j = 0; j < selectedGroupArray.length; j++) {
          const groupId = selectedGroupArray[j];
          const group = groups.find(g => g.id === groupId);
          setCurrentGroup(group?.name || groupId);

          try {
            console.log(`📤 Enviando ${product.code} para grupo ${group?.name}`);
            
            // Enviar mensagem via API do servidor WhatsApp
            const response = await fetch(`${integration.api_url}/send-group`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-tenant-id': tenant?.id || ''
              },
              body: JSON.stringify({
                groupId: groupId,
                message: personalizedMessage
              })
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`❌ Erro ao enviar para grupo ${group?.name}:`, errorText);
              toast({
                title: 'Erro no envio',
                description: `Falha ao enviar para ${group?.name}`,
                variant: 'destructive'
              });
            } else {
              console.log(`✅ Enviado com sucesso para ${group?.name}`);
            }

            // Registrar no banco
            await supabaseTenant.from('whatsapp_messages').insert({
              phone: groupId,
              message: personalizedMessage,
              type: 'sendflow',
              whatsapp_group_name: group?.name,
              sent_at: new Date().toISOString(),
              processed: true
            });

            messageCount++;
            setSendProgress({ current: messageCount, total: totalMessages });

          } catch (error) {
            console.error(`❌ Erro ao enviar mensagem para grupo ${group?.name}:`, error);
            toast({
              title: 'Erro',
              description: `Falha ao enviar para ${group?.name}`,
              variant: 'destructive'
            });
          }
        }

        // PAUSA APENAS APÓS ENVIAR PARA TODOS OS GRUPOS (exceto no último produto)
        if (i < selectedProductArray.length - 1) {
          setIsPausing(true);
          console.log(`⏸️ Pausando ${intervalSeconds} segundos antes do próximo produto...`);
          
          // Countdown visual da pausa
          for (let countdown = intervalSeconds; countdown > 0; countdown--) {
            setPauseCountdown(countdown);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          setIsPausing(false);
          setPauseCountdown(0);
        }
      }

      toast({
        title: 'Envio concluído',
        description: `${messageCount} mensagem(ns) enviada(s) com sucesso`,
      });

      // Limpar seleções
      setSelectedProducts(new Set());
      setSelectedGroups(new Set());
      setCurrentProduct('');
      setCurrentGroup('');
      setIsPausing(false);
      setPauseCountdown(0);

    } catch (error) {
      console.error('Erro ao enviar mensagens:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao enviar mensagens',
        variant: 'destructive'
      });
    } finally {
      setSending(false);
      setSendProgress({ current: 0, total: 0 });
      setIsPausing(false);
      setPauseCountdown(0);
    }
  };

  // Calcular tempo estimado de envio
  const calculateEstimatedTime = () => {
    const numProducts = selectedProducts.size;
    const numGroups = selectedGroups.size;
    
    if (numProducts === 0 || numGroups === 0) {
      return 0;
    }

    // Pausas = número de produtos - 1 (não pausa após o último)
    const numPauses = Math.max(0, numProducts - 1);
    const totalSeconds = numPauses * intervalSeconds;
    
    return totalSeconds;
  };

  // Formatar tempo em minutos e segundos
  const formatTime = (seconds: number) => {
    if (seconds === 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return secs > 0 ? `${mins}min ${secs}s` : `${mins}min`;
    }
    return `${secs}s`;
  };

  // Atualizar tempo estimado quando seleções mudarem
  useEffect(() => {
    setEstimatedTime(calculateEstimatedTime());
  }, [selectedProducts.size, selectedGroups.size, intervalSeconds]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">SendFlow</h1>
          <p className="text-muted-foreground">Envie produtos para grupos do WhatsApp</p>
        </div>
        <Button onClick={loadGroups} disabled={loadingGroups} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${loadingGroups ? 'animate-spin' : ''}`} />
          Atualizar Grupos
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card de Grupos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Grupos WhatsApp
              </span>
              <Badge variant="secondary">
                {selectedGroups.size} selecionado(s)
              </Badge>
            </CardTitle>
            <CardDescription>
              Selecione os grupos que receberão as mensagens
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingGroups ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : groups.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-2 pb-2 border-b">
                  <Checkbox
                    id="select-all-groups"
                    checked={selectedGroups.size === groups.length}
                    onCheckedChange={toggleAllGroups}
                  />
                  <label
                    htmlFor="select-all-groups"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Selecionar todos ({groups.length})
                  </label>
                </div>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {groups.map((group) => (
                    <div
                      key={group.id}
                      className="flex items-center space-x-2 p-2 hover:bg-accent rounded-md"
                    >
                      <Checkbox
                        id={`group-${group.id}`}
                        checked={selectedGroups.has(group.id)}
                        onCheckedChange={() => toggleGroup(group.id)}
                      />
                      <label
                        htmlFor={`group-${group.id}`}
                        className="text-sm flex-1 cursor-pointer"
                      >
                        {group.name}
                        {group.participantCount && (
                          <span className="text-muted-foreground ml-2">
                            ({group.participantCount} participantes)
                          </span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum grupo encontrado</p>
                <p className="text-sm">Certifique-se que o WhatsApp está conectado</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card de Produtos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Produtos
              </span>
              <Badge variant="secondary">
                {selectedProducts.size} selecionado(s)
              </Badge>
            </CardTitle>
            <CardDescription>
              Selecione os produtos que serão enviados
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : products.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-2 pb-2 border-b">
                  <Checkbox
                    id="select-all-products"
                    checked={selectedProducts.size === products.length}
                    onCheckedChange={toggleAllProducts}
                  />
                  <label
                    htmlFor="select-all-products"
                    className="text-sm font-medium cursor-pointer"
                  >
                    Selecionar todos ({products.length})
                  </label>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Preço</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedProducts.has(product.id)}
                              onCheckedChange={() => toggleProduct(product.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{product.code}</TableCell>
                          <TableCell>{product.name}</TableCell>
                          <TableCell>{formatPrice(product.price)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum produto cadastrado</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Card de Template e Configurações */}
      <Card>
        <CardHeader>
          <CardTitle>Template de Mensagem</CardTitle>
          <CardDescription>
            Personalize a mensagem. Use: {'{{codigo}}'}, {'{{nome}}'}, {'{{cor}}'}, {'{{tamanho}}'}, {'{{valor}}'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Digite o template da mensagem..."
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            rows={10}
            className="resize-none font-mono text-sm"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="interval">
                <Clock className="w-4 h-4 inline mr-2" />
                Intervalo entre mensagens (segundos)
              </Label>
              <Input
                id="interval"
                type="number"
                min="1"
                max="300"
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(parseInt(e.target.value) || 30)}
              />
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={saveTemplate} variant="outline" className="flex-1">
                <Save className="w-4 h-4 mr-2" />
                Salvar Template
              </Button>
            </div>
          </div>

          <Separator />

          {/* Progress e Botão de Envio */}
          <div className="space-y-4">
            {sending && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Produto: <strong>{currentProduct}</strong>
                  </span>
                  <span className="font-medium">
                    {sendProgress.current} / {sendProgress.total}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Grupo: <strong>{currentGroup}</strong>
                  </span>
                </div>
                
                {isPausing && (
                  <div className="flex items-center justify-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                    <Pause className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium text-yellow-500">
                      Pausando... {pauseCountdown}s
                    </span>
                  </div>
                )}
                
                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-300"
                    style={{
                      width: `${(sendProgress.current / sendProgress.total) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex flex-col gap-2 p-4 bg-accent/50 rounded-lg border border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    📦 {selectedProducts.size} produto(s) × 👥 {selectedGroups.size} grupo(s)
                  </span>
                  <span className="font-medium">
                    = <strong>{selectedProducts.size * selectedGroups.size} mensagens</strong>
                  </span>
                </div>
                
                {estimatedTime > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Tempo estimado:
                    </span>
                    <span className="font-medium text-primary">
                      {formatTime(estimatedTime)}
                    </span>
                  </div>
                )}
                
                <div className="text-xs text-muted-foreground mt-2 p-2 bg-background/50 rounded border border-border/50">
                  💡 <strong>Como funciona:</strong> O sistema envia cada produto para TODOS os grupos selecionados, 
                  aguarda {intervalSeconds}s, e então envia o próximo produto.
                </div>
              </div>

              <Button
                onClick={handleSendMessages}
                disabled={sending || selectedProducts.size === 0 || selectedGroups.size === 0}
                size="lg"
                className="w-full gap-2"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Enviar Mensagens
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
