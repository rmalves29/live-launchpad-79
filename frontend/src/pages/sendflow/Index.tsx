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
      console.log('🔍 Buscando integração WhatsApp...');
      const { data: integration, error: integrationError } = await supabaseTenant
        .from('integration_whatsapp')
        .select('api_url')
        .eq('is_active', true)
        .maybeSingle();

      console.log('📡 Integração encontrada:', { integration, error: integrationError });

      if (integrationError) {
        throw new Error(`Erro ao buscar integração: ${integrationError.message}`);
      }

      if (!integration?.api_url) {
        throw new Error('Integração WhatsApp não configurada. Configure em Configurações > WhatsApp.');
      }
      
      console.log(`✅ API URL configurada: ${integration.api_url}`);

      // VALIDAR SE WHATSAPP ESTÁ CONECTADO ANTES DE INICIAR
      console.log('🔍 Validando conexão WhatsApp...');
      const statusUrl = `${integration.api_url}/status/${tenant?.id}`;
      console.log(`   Chamando: ${statusUrl}`);
      
      const statusResponse = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'x-tenant-id': tenant?.id || ''
        }
      });

      console.log(`   Status Response: ${statusResponse.status} ${statusResponse.statusText}`);

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text().catch(() => 'Sem detalhes');
        throw new Error(`Erro ao verificar status do WhatsApp (${statusResponse.status}): ${errorText}`);
      }

      const statusData = await statusResponse.json();
      console.log('   Status Data:', statusData);
      
      if (!statusData.success || statusData.status !== 'online') {
        const errorMsg = `Status atual: ${statusData.status || 'desconhecido'}. Conecte o WhatsApp antes de enviar.`;
        toast({
          title: 'WhatsApp não conectado',
          description: errorMsg,
          variant: 'destructive',
          duration: 8000
        });
        setSending(false);
        return;
      }

      console.log('✅ WhatsApp conectado, iniciando envio...');

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

        // Enviar para TODOS os grupos deste produto COM delay de 2s entre cada mensagem
        for (let j = 0; j < selectedGroupArray.length; j++) {
          const groupId = selectedGroupArray[j];
          const group = groups.find(g => g.id === groupId);
          setCurrentGroup(group?.name || groupId);

          // RETRY LOGIC: Tentar até 3 vezes com backoff exponencial
          let success = false;
          let lastError = '';
          
          console.log(`\n${'='.repeat(60)}`);
          console.log(`📤 INICIANDO ENVIO:`);
          console.log(`   Produto: ${product.code} - ${product.name}`);
          console.log(`   Grupo: ${group?.name}`);
          console.log(`   GroupID: ${groupId}`);
          console.log(`   Mensagem preview: ${personalizedMessage.substring(0, 50)}...`);
          console.log(`${'='.repeat(60)}\n`);
          
          for (let attempt = 1; attempt <= 3 && !success; attempt++) {
            try {
              console.log(`📤 Tentativa ${attempt}/3 - Enviando para ${group?.name}...`);
              
              const sendUrl = `${integration.api_url}/send-group`;
              const requestBody = {
                groupId: groupId,
                message: personalizedMessage
              };
              
              console.log(`   POST ${sendUrl}`);
              console.log(`   Headers:`, {
                'Content-Type': 'application/json',
                'x-tenant-id': tenant?.id || ''
              });
              console.log(`   Body:`, requestBody);
              
              // Enviar mensagem via API do servidor WhatsApp
              const response = await fetch(sendUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-tenant-id': tenant?.id || ''
                },
                body: JSON.stringify(requestBody)
              });

              console.log(`📨 Response Status: ${response.status} ${response.statusText}`);

              if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                lastError = errorData?.error || response.statusText;
                
                console.error(`\n${'!'.repeat(60)}`);
                console.error(`❌ ERRO NO ENVIO:`);
                console.error(`   Status: ${response.status}`);
                console.error(`   Erro: ${lastError}`);
                console.error(`   Error Data:`, errorData);
                console.error(`${'!'.repeat(60)}\n`);
                
                // Se for erro 503 (WhatsApp desconectado), não tentar novamente
                if (response.status === 503) {
                  const errorDetails = errorData?.details || lastError;
                  console.error(`\n${'🚨'.repeat(30)}`);
                  console.error(`🚨 WHATSAPP DESCONECTADO!`);
                  console.error(`   Erro: ${errorDetails}`);
                  console.error(`${'🚨'.repeat(30)}\n`);
                  
                  toast({
                    title: '🚨 WhatsApp Desconectado',
                    description: 'Vá até a página "Conexão WhatsApp" e escaneie o QR Code novamente.',
                    variant: 'destructive',
                    duration: 10000
                  });
                  setSending(false);
                  throw new Error('WhatsApp desconectado - abortando envio');
                }
                
                // Se não for a última tentativa, aguardar antes de tentar novamente
                if (attempt < 3) {
                  const backoffTime = attempt * 1000; // 1s, 2s
                  console.log(`⏳ Aguardando ${backoffTime}ms antes de tentar novamente...`);
                  await new Promise(resolve => setTimeout(resolve, backoffTime));
                  continue;
                }
              } else {
                const responseData = await response.json();
                success = true;
                console.log(`\n${'✅'.repeat(30)}`);
                console.log(`✅ SUCESSO! Mensagem enviada para ${group?.name}`);
                console.log(`   Response:`, responseData);
                console.log(`${'✅'.repeat(30)}\n`);
              }

            } catch (error: any) {
              lastError = error.message;
              console.error(`\n${'!'.repeat(60)}`);
              console.error(`❌ EXCEÇÃO AO ENVIAR:`);
              console.error(`   Grupo: ${group?.name}`);
              console.error(`   Erro: ${error.message}`);
              console.error(`   Stack:`, error.stack);
              console.error(`${'!'.repeat(60)}\n`);
              
              // Se for erro de conexão perdida, abortar tudo
              if (lastError.includes('desconectado') || lastError.includes('abortando')) {
                throw error;
              }
              
              // Se não for a última tentativa, aguardar antes de tentar novamente
              if (attempt < 3) {
                const backoffTime = attempt * 1000;
                await new Promise(resolve => setTimeout(resolve, backoffTime));
                continue;
              }
            }
          }

          // Se após 3 tentativas não conseguiu enviar, registrar erro
          if (!success) {
            console.error(`\n${'❌'.repeat(30)}`);
            console.error(`❌ FALHA DEFINITIVA após 3 tentativas`);
            console.error(`   Grupo: ${group?.name}`);
            console.error(`   Último erro: ${lastError}`);
            console.error(`${'❌'.repeat(30)}\n`);
            
            toast({
              title: `❌ Erro: ${group?.name}`,
              description: `${lastError.substring(0, 100)}`,
              variant: 'destructive',
              duration: 5000
            });
          } else {
            toast({
              title: `✅ Enviado: ${group?.name}`,
              description: `${product.name} enviado com sucesso`,
              duration: 2000
            });
          }

          // Registrar no banco (mesmo se falhou, para ter histórico)
          await supabaseTenant.from('whatsapp_messages').insert({
            phone: groupId,
            message: personalizedMessage,
            type: 'sendflow',
            whatsapp_group_name: group?.name,
            sent_at: success ? new Date().toISOString() : null,
            processed: success
          });

          messageCount++;
          setSendProgress({ current: messageCount, total: totalMessages });

          // Delay de 2 segundos entre cada mensagem (exceto a última de todas)
          const isLastMessage = (i === selectedProductArray.length - 1) && (j === selectedGroupArray.length - 1);
          if (!isLastMessage) {
            console.log('⏳ Aguardando 2 segundos...');
            await new Promise(resolve => setTimeout(resolve, 2000));
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
      console.error('❌ ERRO CRÍTICO NO SENDFLOW:', error);
      
      // Extrair mensagem de erro mais descritiva
      let errorMessage = 'Erro ao enviar mensagens';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        console.error('   Error message:', error.message);
        console.error('   Error stack:', error.stack);
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      toast({
        title: '❌ Erro no SendFlow',
        description: errorMessage,
        variant: 'destructive',
        duration: 8000
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

    // Total de mensagens
    const totalMessages = numProducts * numGroups;
    
    // Delays de 2s entre mensagens (exceto a última)
    const messageDelays = Math.max(0, totalMessages - 1) * 2;
    
    // Pausas entre produtos = número de produtos - 1
    const numPauses = Math.max(0, numProducts - 1);
    const productPauses = numPauses * intervalSeconds;
    
    // Tempo total = delays entre mensagens + pausas entre produtos
    const totalSeconds = messageDelays + productPauses;
    
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
