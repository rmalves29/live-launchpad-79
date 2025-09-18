import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Play, Pause, Save, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTenant } from '@/hooks/useTenant';

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
  const { tenant } = useTenant();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [messageTemplate, setMessageTemplate] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(30);
  const [targetPhone, setTargetPhone] = useState('');
  const [whatsappGroups, setWhatsappGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<string>('');
  const [currentGroup, setCurrentGroup] = useState<string>('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  useEffect(() => {
    loadProducts();
    loadTemplate();
  }, [tenant?.id]);

  useEffect(() => {
    loadProducts();
    loadTemplate();
    loadAllWhatsAppGroups();
  }, [tenant?.id]);

  const loadProducts = async () => {
    if (!tenant?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
      toast.error('Erro ao carregar produtos');
    }
  };

  const loadTemplate = async () => {
    if (!tenant?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('type', 'BROADCAST')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setMessageTemplate(data.content);
      } else {
        // Template padrão
        setMessageTemplate(
          '🛍️ *{{nome}}* ({{codigo}})\n\n' +
          '🎨 Cor: {{cor}}\n' +
          '📏 Tamanho: {{tamanho}}\n' +
          '💰 Valor: {{valor}}\n\n' +
          '📱 Para comprar, digite apenas o código: *{{codigo}}*'
        );
      }
    } catch (error) {
      console.error('Erro ao carregar template:', error);
    }
  };

  const loadAllWhatsAppGroups = async () => {
    if (!tenant?.id) return;
    
    setIsLoadingGroups(true);
    try {
      console.log('🔍 Carregando todos os grupos do WhatsApp...');
      
      // Verificar se o servidor está online primeiro
      const statusResponse = await fetch(`http://localhost:3333/status`);
      if (!statusResponse.ok) {
        throw new Error('Servidor WhatsApp não está rodando na porta 3333');
      }
      
      const statusData = await statusResponse.json();
      console.log('📊 Status do servidor:', statusData);
      
      if (!statusData.whatsapp?.ready) {
        throw new Error('WhatsApp não está conectado no servidor');
      }

      // Fazer chamada para o servidor Node.js para listar todos os grupos
      const response = await fetch(`http://localhost:3333/list-all-groups`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('📋 Grupos encontrados:', data);
      
      if (data.success && data.groups) {
        setWhatsappGroups(data.groups);
        toast.success(`${data.groups.length} grupos encontrados`);
      } else {
        setWhatsappGroups([]);
        toast.info('Nenhum grupo encontrado');
      }
    } catch (error) {
      console.error('❌ Erro ao carregar grupos WhatsApp:', error);
      toast.error(`Erro: ${error.message}`);
      setWhatsappGroups([]);
    } finally {
      setIsLoadingGroups(false);
    }
  };

  const saveTemplate = async () => {
    if (!tenant?.id || !messageTemplate) return;
    
    try {
      const { error } = await supabase
        .from('whatsapp_templates')
        .upsert({
          tenant_id: tenant.id,
          type: 'BROADCAST',
          title: 'SendFlow Template',
          content: messageTemplate
        });

      if (error) throw error;
      toast.success('Template salvo com sucesso');
    } catch (error) {
      console.error('Erro ao salvar template:', error);
      toast.error('Erro ao salvar template');
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

  const startSendFlow = async () => {
    if (selectedProducts.size === 0) {
      toast.error('Selecione pelo menos um produto');
      return;
    }

    if (selectedGroups.size === 0) {
      toast.error('Selecione pelo menos um grupo WhatsApp');
      return;
    }

    if (!messageTemplate) {
      toast.error('Defina um template de mensagem');
      return;
    }

    // Verificar se servidor está online
    try {
      const statusResponse = await fetch(`http://localhost:3333/status`);
      if (!statusResponse.ok) {
        throw new Error('Servidor WhatsApp offline');
      }
      const statusData = await statusResponse.json();
      if (!statusData.whatsapp?.ready) {
        throw new Error('WhatsApp não conectado');
      }
    } catch (error) {
      toast.error(`❌ ${error.message}. Verifique se o servidor está rodando.`);
      return;
    }

    await saveTemplate();
    
    // Criar novo controller para cancelar operações
    const controller = new AbortController();
    setAbortController(controller);
    
    setIsRunning(true);
    setCurrentIndex(0);
    setCurrentProduct('');
    setCurrentGroup('');
    
    toast.success('🚀 Iniciando SendFlow...');
    
    processSendFlow(controller);
  };

  // Função para criar delay cancelável
  const cancelableDelay = (ms: number, controller: AbortController): Promise<void> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      controller.signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Operação cancelada'));
      });
    });
  };

  const processSendFlow = async (controller: AbortController) => {
    try {
      const selectedProductArray = products.filter(p => selectedProducts.has(p.id));
      const selectedGroupArray = Array.from(selectedGroups);
      
      console.log(`🎯 Iniciando envio para ${selectedProductArray.length} produtos em ${selectedGroupArray.length} grupos`);
      
      for (let i = currentIndex; i < selectedProductArray.length; i++) {
        // Verificar se foi cancelado
        if (controller.signal.aborted) {
          console.log('❌ SendFlow cancelado pelo usuário');
          break;
        }
        
        setCurrentIndex(i);
        const product = selectedProductArray[i];
        setCurrentProduct(product.name);
        
        const personalizedMessage = personalizeMessage(product);
        console.log(`📦 Processando produto ${i + 1}/${selectedProductArray.length}: ${product.code} - ${product.name}`);

        let successCount = 0;
        let errorCount = 0;
        
        // Enviar para cada grupo selecionado com delay entre grupos
        for (let groupIndex = 0; groupIndex < selectedGroupArray.length; groupIndex++) {
          // Verificar se foi cancelado
          if (controller.signal.aborted) {
            console.log('❌ SendFlow cancelado durante envio aos grupos');
            return;
          }
          
          const groupId = selectedGroupArray[groupIndex];
          const groupName = whatsappGroups.find(g => g.id === groupId)?.name || groupId;
          setCurrentGroup(groupName);
          
          try {
            console.log(`🚀 Enviando produto ${product.code} para grupo ${groupIndex + 1}/${selectedGroupArray.length}: ${groupName}`);
            
            const response = await fetch(`http://localhost:3333/send-to-group`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                groupId,
                message: personalizedMessage,
                imageUrl: product.image_url
              }),
              signal: controller.signal // Adicionar abort signal na requisição
            });
            
            if (controller.signal.aborted) return;
            
            const result = await response.json();
            
            if (!response.ok) {
              throw new Error(`Erro ${response.status}: ${result.message || result.error || 'Erro desconhecido'}`);
            }
            
            successCount++;
            console.log(`✅ Sucesso no grupo ${groupName}:`, result);
            toast.success(`✅ ${product.code} → ${groupName.substring(0, 30)}...`);
            
          } catch (groupError) {
            if (controller.signal.aborted) return;
            
            errorCount++;
            const errorMsg = groupError.message || 'Erro desconhecido';
            console.error(`❌ Erro ao enviar para grupo ${groupName}:`, groupError);
            toast.error(`❌ ${groupName.substring(0, 20)}: ${errorMsg}`);
          }
          
          // Aplicar delay entre grupos (exceto no último grupo)
          if (groupIndex < selectedGroupArray.length - 1) {
            try {
              console.log(`⏳ Aguardando ${timerSeconds}s antes do próximo grupo...`);
              toast.info(`⏳ Aguardando ${timerSeconds}s para próximo grupo... (${groupIndex + 2}/${selectedGroupArray.length})`);
              await cancelableDelay(timerSeconds * 1000, controller);
            } catch (error) {
              if (controller.signal.aborted) return;
              console.log('❌ Delay cancelado');
            }
          }
        }

        // Resumo do produto
        const totalGroups = selectedGroupArray.length;
        console.log(`📊 Produto ${product.code} finalizado: ${successCount} sucessos, ${errorCount} erros de ${totalGroups} grupos`);
        toast.success(`📊 ${product.code}: ${successCount}/${totalGroups} grupos ✅ ${errorCount > 0 ? `(${errorCount} erros)` : ''}`);
        
        // Aguardar antes do próximo produto (apenas se houver próximo produto)
        if (i < selectedProductArray.length - 1) {
          try {
            console.log(`⏳ Aguardando ${timerSeconds}s antes do próximo produto...`);
            toast.info(`⏳ Aguardando ${timerSeconds}s para próximo produto... (${i + 2}/${selectedProductArray.length})`);
            await cancelableDelay(timerSeconds * 1000, controller);
          } catch (error) {
            if (controller.signal.aborted) return;
            console.log('❌ Delay entre produtos cancelado');
          }
        }
      }

      if (!controller.signal.aborted) {
        console.log('🎉 SendFlow finalizado com sucesso!');
        toast.success('🎉 SendFlow finalizado com sucesso!');
      }
      
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('❌ Erro crítico no SendFlow:', error);
        toast.error(`❌ Erro crítico: ${error.message}`);
      }
    } finally {
      setIsRunning(false);
      setCurrentIndex(0);
      setCurrentProduct('');
      setCurrentGroup('');
      setAbortController(null);
    }
  };

  const stopSendFlow = () => {
    if (abortController) {
      abortController.abort();
      console.log('🛑 Cancelando SendFlow...');
      toast.info('🛑 Pausando SendFlow...');
    }
    setIsRunning(false);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">SendFlow</h1>
        <div className="flex gap-2">
          <Button onClick={saveTemplate} variant="outline">
            <Save className="w-4 h-4 mr-2" />
            Salvar Template
          </Button>
          {!isRunning ? (
            <Button onClick={startSendFlow} className="bg-green-600 hover:bg-green-700">
              <Play className="w-4 h-4 mr-2" />
              Iniciar SendFlow
            </Button>
          ) : (
            <Button onClick={stopSendFlow} variant="destructive">
              <Pause className="w-4 h-4 mr-2" />
              Pausar SendFlow
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configurações */}
        <div className="space-y-6">
          {/* Número de Destino e Grupos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Destino e Grupos WhatsApp
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Grupos WhatsApp</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadAllWhatsAppGroups}
                  disabled={isLoadingGroups}
                >
                  {isLoadingGroups ? "Carregando..." : "Atualizar Grupos"}
                </Button>
              </div>

              {isLoadingGroups && (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <span className="text-sm">Carregando grupos...</span>
                </div>
              )}

              {whatsappGroups.length > 0 && (
                <div>
                  <label className="text-sm font-medium">Grupos WhatsApp Disponíveis ({whatsappGroups.length})</label>
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                    {whatsappGroups.map((group) => (
                      <div key={group.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`group-${group.id}`}
                          checked={selectedGroups.has(group.id)}
                          onCheckedChange={() => toggleGroup(group.id)}
                        />
                        <label 
                          htmlFor={`group-${group.id}`}
                          className="text-sm cursor-pointer flex-1"
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
              )}

              {whatsappGroups.length === 0 && !isLoadingGroups && (
                <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                  <p className="font-medium">Nenhum grupo encontrado</p>
                  <p>Certifique-se de que:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>O servidor Node.js está rodando na porta 3333</li>
                    <li>O WhatsApp Web está conectado</li>
                    <li>Existem grupos no WhatsApp conectado</li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Template de Mensagem */}
          <Card>
            <CardHeader>
              <CardTitle>Template de Mensagem</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Digite seu template de mensagem..."
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                rows={8}
              />
              <div className="mt-2 text-xs text-muted-foreground">
                Variáveis disponíveis: {'{{codigo}}'}, {'{{nome}}'}, {'{{cor}}'}, {'{{tamanho}}'}, {'{{valor}}'}
              </div>
            </CardContent>
          </Card>

          {/* Configurações de Tempo */}
          <Card>
            <CardHeader>
              <CardTitle>Configurações de Envio</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <label className="text-sm font-medium">Intervalo entre mensagens (segundos):</label>
                <Input
                  type="number"
                  min="1"
                  value={timerSeconds}
                  onChange={(e) => setTimerSeconds(Number(e.target.value))}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Produtos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              Produtos Ativos
              <Button variant="outline" size="sm" onClick={toggleAllProducts}>
                {selectedProducts.size === products.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Cód.</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cor</TableHead>
                    <TableHead>Tamanho</TableHead>
                    <TableHead>Valor</TableHead>
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
                      <TableCell className="font-mono">{product.code}</TableCell>
                      <TableCell>{product.name}</TableCell>
                      <TableCell>
                        {product.color && <Badge variant="outline">{product.color}</Badge>}
                      </TableCell>
                      <TableCell>
                        {product.size && <Badge variant="outline">{product.size}</Badge>}
                      </TableCell>
                      <TableCell className="font-medium">{formatPrice(product.price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status do SendFlow */}
      {isRunning && (
        <Card>
          <CardHeader>
            <CardTitle>Status do SendFlow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span>Progresso dos Produtos:</span>
                <span>{currentIndex + 1} de {selectedProducts.size}</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / selectedProducts.size) * 100}%` }}
                />
              </div>
              {currentProduct && (
                <div className="text-sm">
                  <span className="font-medium">Produto atual:</span>
                  <span className="ml-2 text-muted-foreground">{currentProduct}</span>
                </div>
              )}
              {currentGroup && (
                <div className="text-sm">
                  <span className="font-medium">Grupo atual:</span>
                  <span className="ml-2 text-muted-foreground">{currentGroup}</span>
                </div>
              )}
              <div className="text-sm">
                <span className="font-medium">Grupos selecionados:</span>
                <span className="ml-2 text-muted-foreground">{selectedGroups.size} grupo(s)</span>
              </div>
              <div className="text-sm">
                <span className="font-medium">Delay configurado:</span>
                <span className="ml-2 text-muted-foreground">{timerSeconds}s entre envios</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}