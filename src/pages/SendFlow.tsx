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
import { Play, Pause, Save, Phone, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTenant } from '@/hooks/useTenant';
import SendingControl from '@/components/SendingControl';

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
  const [sentCount, setSentCount] = useState(0);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

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
      console.log('📋 Carregando template SENDFLOW para tenant:', tenant.id);
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('type', 'SENDFLOW')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        console.log('✅ Template carregado do banco:', data.content);
        setMessageTemplate(data.content);
      } else {
        // Template padrão
        const defaultTemplate = 
          '🛍️ *{{nome}}* ({{codigo}})\n\n' +
          '🎨 Cor: {{cor}}\n' +
          '📏 Tamanho: {{tamanho}}\n' +
          '💰 Valor: {{valor}}\n\n' +
          '📱 Para comprar, digite apenas o código: *{{codigo}}*';
        console.log('⚠️ Nenhum template encontrado, usando template padrão');
        setMessageTemplate(defaultTemplate);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar template:', error);
      toast.error('Erro ao carregar template de mensagem');
    }
  };

  const loadAllWhatsAppGroups = async () => {
    if (!tenant?.id) return;
    
    setIsLoadingGroups(true);
    try {
      console.log('🔍 Carregando todos os grupos do WhatsApp...');
      console.log('🌐 Tentando conectar com servidor na porta 3333...');
      
      // Verificar limite de grupos configurado para o tenant
      const maxGroups = tenant?.max_whatsapp_groups;
      console.log(`📊 Limite de grupos configurado: ${maxGroups || 'sem limite'}`);
      
      // Criar AbortController para timeout
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), 5000); // 5 segundos
      
      // Verificar se o servidor está online primeiro
      let statusResponse;
      try {
        statusResponse = await fetch(`http://localhost:3333/status`, {
          signal: timeoutController.signal
        });
        clearTimeout(timeoutId);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        console.error('❌ Erro de conexão com servidor:', fetchError);
        if (fetchError.name === 'AbortError') {
          throw new Error('Timeout na conexão com servidor WhatsApp na porta 3333');
        }
        throw new Error('Não foi possível conectar ao servidor WhatsApp na porta 3333. Verifique se o servidor está rodando.');
      }

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error('❌ Status response não OK:', statusResponse.status, errorText);
        throw new Error(`Servidor WhatsApp retornou erro ${statusResponse.status}: ${errorText}`);
      }
      
      let statusData;
      try {
        statusData = await statusResponse.json();
        console.log('📊 Status do servidor:', statusData);
      } catch (parseError) {
        console.error('❌ Erro ao fazer parse do status:', parseError);
        throw new Error('Resposta inválida do servidor WhatsApp');
      }
      
      if (!statusData.whatsapp?.ready) {
        console.error('❌ WhatsApp não conectado:', statusData.whatsapp);
        throw new Error('WhatsApp não está conectado no servidor. Escaneie o QR Code primeiro.');
      }

      console.log('✅ Servidor conectado, listando grupos...');

      // Criar novo AbortController para a requisição de grupos
      const groupsController = new AbortController();
      const groupsTimeoutId = setTimeout(() => groupsController.abort(), 10000); // 10 segundos
      
      // Fazer chamada para o servidor Node.js para listar todos os grupos
      let response;
      try {
        response = await fetch(`http://localhost:3333/list-all-groups`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: groupsController.signal
        });
        clearTimeout(groupsTimeoutId);
      } catch (fetchError) {
        clearTimeout(groupsTimeoutId);
        console.error('❌ Erro ao buscar grupos:', fetchError);
        if (fetchError.name === 'AbortError') {
          throw new Error('Timeout ao listar grupos do WhatsApp');
        }
        throw new Error('Falha na comunicação com servidor para listar grupos');
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erro na resposta de grupos:', response.status, errorText);
        throw new Error(`Erro ${response.status} ao listar grupos: ${errorText}`);
      }
      
      let data;
      try {
        data = await response.json();
        console.log('📋 Resposta completa dos grupos:', data);
      } catch (parseError) {
        console.error('❌ Erro ao fazer parse da resposta de grupos:', parseError);
        throw new Error('Resposta inválida ao listar grupos');
      }
      
      if (data.success && data.groups && Array.isArray(data.groups)) {
        console.log(`✅ ${data.groups.length} grupos carregados com sucesso`);
        
        // Aplicar limite de grupos se configurado
        let limitedGroups = data.groups;
        if (maxGroups && maxGroups > 0) {
          limitedGroups = data.groups.slice(0, maxGroups);
          console.log(`⚡ Aplicando limite: mostrando ${limitedGroups.length} de ${data.groups.length} grupos`);
          toast.success(`✅ ${limitedGroups.length} grupos WhatsApp carregados (limite: ${maxGroups})`);
        } else {
          toast.success(`✅ ${data.groups.length} grupos WhatsApp encontrados`);
        }
        
        setWhatsappGroups(limitedGroups);
      } else if (data.success && (!data.groups || data.groups.length === 0)) {
        console.log('ℹ️ Nenhum grupo encontrado (array vazio ou null)');
        setWhatsappGroups([]);
        toast.info('Nenhum grupo WhatsApp encontrado');
      } else {
        console.error('❌ Resposta inesperada:', data);
        setWhatsappGroups([]);
        toast.error('Resposta inesperada do servidor');
      }
    } catch (error) {
      console.error('❌ ERRO COMPLETO ao carregar grupos WhatsApp:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // Mensagem mais específica baseada no tipo de erro
      let userMessage = error.message;
      if (error.message.includes('conectar')) {
        userMessage = '🔌 Servidor WhatsApp offline. Inicie o servidor na porta 3333.';
      } else if (error.message.includes('QR Code')) {
        userMessage = '📱 Conecte o WhatsApp escaneando o QR Code no servidor.';
      } else if (error.message.includes('Timeout')) {
        userMessage = '⏱️ Timeout na conexão. Verifique se o servidor está respondendo.';
      }
      
      toast.error(userMessage);
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
          type: 'SENDFLOW',
          title: 'SendFlow - Divulgação em Grupos',
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
    console.log('📝 Template original:', messageTemplate);
    const personalizedMsg = messageTemplate
      .replace(/\{\{codigo\}\}/g, product.code)
      .replace(/\{\{nome\}\}/g, product.name)
      .replace(/\{\{cor\}\}/g, product.color || 'N/A')
      .replace(/\{\{tamanho\}\}/g, product.size || 'N/A')
      .replace(/\{\{valor\}\}/g, formatPrice(product.price));
    console.log('✅ Mensagem personalizada:', personalizedMsg);
    console.log('📦 Produto:', { code: product.code, name: product.name, color: product.color, size: product.size, price: product.price });
    return personalizedMsg;
  };

  const startSendFlow = async (resumeJob = null) => {
    console.log('🚀 INICIANDO SENDFLOW');
    console.log('📦 Produtos selecionados:', selectedProducts.size);
    console.log('👥 Grupos selecionados:', selectedGroups.size);
    console.log('📝 Template definido:', !!messageTemplate);
    
    if (!resumeJob && selectedProducts.size === 0) {
      console.error('❌ Nenhum produto selecionado');
      toast.error('Selecione pelo menos um produto');
      return;
    }

    if (!resumeJob && selectedGroups.size === 0) {
      console.error('❌ Nenhum grupo selecionado');
      toast.error('Selecione pelo menos um grupo WhatsApp');
      return;
    }

    if (!resumeJob && !messageTemplate) {
      console.error('❌ Template não definido');
      toast.error('Defina um template de mensagem');
      return;
    }

    console.log('✅ Validações passaram, verificando servidor WhatsApp...');

    // Verificar se servidor está online
    try {
      console.log('🔍 Conectando com http://localhost:3333/status');
      const statusResponse = await fetch(`http://localhost:3333/status`);
      console.log('📡 Status response:', statusResponse.status, statusResponse.ok);
      
      if (!statusResponse.ok) {
        throw new Error('Servidor WhatsApp offline');
      }
      const statusData = await statusResponse.json();
      console.log('📊 Status data:', statusData);
      
      if (!statusData.whatsapp?.ready) {
        throw new Error('WhatsApp não conectado');
      }
      console.log('✅ Servidor WhatsApp conectado e pronto!');
    } catch (error) {
      console.error('❌ Erro ao verificar servidor:', error);
      toast.error(`❌ ${error.message}. Verifique se o servidor está rodando.`);
      return;
    }

    if (!resumeJob) {
      console.log('💾 Salvando template antes de iniciar...');
      await saveTemplate();
    }
    
    console.log('🎮 Criando controller e iniciando processo...');
    
    // Criar novo controller para cancelar operações
    const controller = new AbortController();
    setAbortController(controller);
    
    setIsRunning(true);
    console.log('▶️ SendFlow INICIADO - isRunning: true');
    
    if (resumeJob) {
      // Retomar de onde parou
      console.log('🔄 Retomando job:', resumeJob);
      setCurrentIndex(resumeJob.current_index || 0);
      setCurrentJobId(resumeJob.id);
      
      const jobData = resumeJob.job_data || {};
      console.log('📋 Job data:', jobData);
      
      if (jobData.selectedProducts && Array.isArray(jobData.selectedProducts)) {
        console.log('✅ Restaurando produtos selecionados:', jobData.selectedProducts);
        setSelectedProducts(new Set(jobData.selectedProducts));
      }
      if (jobData.selectedGroups && Array.isArray(jobData.selectedGroups)) {
        console.log('✅ Restaurando grupos selecionados:', jobData.selectedGroups);
        setSelectedGroups(new Set(jobData.selectedGroups));
      }
      if (jobData.messageTemplate) {
        console.log('✅ Restaurando template');
        setMessageTemplate(jobData.messageTemplate);
      }
      toast.success('🚀 Retomando SendFlow...');
    } else {
      // Criar novo job
      try {
        const selectedProductArray = products.filter(p => selectedProducts.has(p.id));
        const selectedGroupArray = Array.from(selectedGroups);
        const totalItems = selectedProductArray.length * selectedGroupArray.length;
        
        const response = await fetch('http://localhost:3333/sending-job/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobType: 'sendflow',
            totalItems,
            jobData: {
              selectedProducts: Array.from(selectedProducts),
              selectedGroups: Array.from(selectedGroups),
              messageTemplate,
              timerSeconds
            }
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          setCurrentJobId(result.job?.id);
        }
      } catch (error) {
        console.error('Erro ao criar job:', error);
      }
      
      setCurrentIndex(0);
      setCurrentProduct('');
      setCurrentGroup('');
      setSentCount(0);
      toast.success('🚀 Iniciando SendFlow...');
    }
    
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
    console.log('🔄 ===== INICIANDO processSendFlow =====');
    try {
      const selectedProductArray = products.filter(p => selectedProducts.has(p.id));
      const selectedGroupArray = Array.from(selectedGroups);
      
      console.log(`🎯 Iniciando envio para ${selectedProductArray.length} produtos em ${selectedGroupArray.length} grupos`);
      console.log(`⏱️ Delay configurado: ${timerSeconds} segundos (${timerSeconds * 1000}ms)`);
      console.log('📦 Produtos:', selectedProductArray.map(p => p.code).join(', '));
      console.log('👥 Grupos:', selectedGroupArray.map(gId => whatsappGroups.find(g => g.id === gId)?.name || gId).join(', '));
      
      if (selectedProductArray.length === 0) {
        console.error('❌ Array de produtos vazio!');
        toast.error('Nenhum produto para enviar');
        return;
      }
      
      if (selectedGroupArray.length === 0) {
        console.error('❌ Array de grupos vazio!');
        toast.error('Nenhum grupo para enviar');
        return;
      }
      
      for (let i = currentIndex; i < selectedProductArray.length; i++) {
        // Verificar se foi cancelado
        if (controller.signal.aborted) {
          console.log('❌ SendFlow cancelado pelo usuário');
          // Salvar progresso ao pausar
          if (currentJobId) {
            await fetch('http://localhost:3333/sending-job/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobId: currentJobId,
                currentIndex: i,
                processedItems: sentCount,
                status: 'paused'
              })
            });
          }
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
            const startTime = Date.now();
            console.log(`🚀 [${new Date().toLocaleTimeString()}] Enviando produto ${product.code} para grupo ${groupIndex + 1}/${selectedGroupArray.length}: ${groupName}`);
            console.log('📤 Payload do envio:', {
              groupId,
              message: personalizedMessage.substring(0, 100) + '...',
              imageUrl: product.image_url || 'sem imagem',
              messageLength: personalizedMessage.length
            });
            
            const response = await fetch(`http://localhost:3333/send-to-group`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                groupId,
                message: personalizedMessage,
                imageUrl: product.image_url
              }),
              signal: controller.signal
            });
            
            if (controller.signal.aborted) return;
            
            const result = await response.json();
            const sendDuration = Date.now() - startTime;
            
            if (!response.ok) {
              throw new Error(`Erro ${response.status}: ${result.message || result.error || 'Erro desconhecido'}`);
            }
            
            successCount++;
            setSentCount(prev => {
              const newCount = prev + 1;
              // Atualizar progresso no banco a cada 5 mensagens
              if (currentJobId && newCount % 5 === 0) {
                fetch('http://localhost:3333/sending-job/update', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    jobId: currentJobId,
                    currentIndex: i,
                    processedItems: newCount
                  })
                }).catch(console.error);
              }
              return newCount;
            });
            console.log(`✅ [${new Date().toLocaleTimeString()}] Sucesso no grupo ${groupName} (levou ${sendDuration}ms)`);
            toast.success(`✅ ${product.code} → ${groupName.substring(0, 30)}...`);
            
          } catch (groupError) {
            if (controller.signal.aborted) return;
            
            errorCount++;
            const errorMsg = groupError.message || 'Erro desconhecido';
            console.error(`❌ Erro ao enviar para grupo ${groupName}:`, groupError);
            toast.error(`❌ ${groupName.substring(0, 20)}: ${errorMsg}`);
          }
          
          // Aplicar delay entre TODOS os envios (incluindo entre grupos do mesmo produto)
          if (groupIndex < selectedGroupArray.length - 1) {
            const delayMs = timerSeconds * 1000;
            console.log(`⏳ [${new Date().toLocaleTimeString()}] DELAY CONFIGURADO: ${timerSeconds} segundos = ${delayMs} milissegundos`);
            console.log(`⏳ [${new Date().toLocaleTimeString()}] Iniciando delay de ${timerSeconds}s (${delayMs}ms) antes do próximo grupo...`);
            const delayStart = Date.now();
            
            try {
              toast.info(`⏳ Aguardando ${timerSeconds}s para próximo grupo... (${groupIndex + 2}/${selectedGroupArray.length})`);
              await cancelableDelay(delayMs, controller);
              const actualDelay = Date.now() - delayStart;
              console.log(`✅ [${new Date().toLocaleTimeString()}] Delay completado - Tempo real: ${actualDelay}ms (esperado: ${delayMs}ms)`);
            } catch (error) {
              if (controller.signal.aborted) {
                console.log('❌ Delay cancelado pelo usuário');
                return;
              }
              console.log('❌ Erro durante delay:', error);
            }
          }
        }

        // Resumo do produto
        const totalGroups = selectedGroupArray.length;
        console.log(`📊 Produto ${product.code} finalizado: ${successCount} sucessos, ${errorCount} erros de ${totalGroups} grupos`);
        toast.success(`📊 ${product.code}: ${successCount}/${totalGroups} grupos ✅ ${errorCount > 0 ? `(${errorCount} erros)` : ''}`);
        
        // Aguardar antes do próximo produto (apenas se houver próximo produto)
        if (i < selectedProductArray.length - 1) {
          const delayMs = timerSeconds * 1000;
          console.log(`⏳ [${new Date().toLocaleTimeString()}] DELAY ENTRE PRODUTOS: ${timerSeconds} segundos = ${delayMs} milissegundos`);
          console.log(`⏳ [${new Date().toLocaleTimeString()}] Iniciando delay de ${timerSeconds}s (${delayMs}ms) antes do próximo produto...`);
          const delayStart = Date.now();
          
          try {
            toast.info(`⏳ Aguardando ${timerSeconds}s para próximo produto... (${i + 2}/${selectedProductArray.length})`);
            await cancelableDelay(delayMs, controller);
            const actualDelay = Date.now() - delayStart;
            console.log(`✅ [${new Date().toLocaleTimeString()}] Delay completado - Tempo real: ${actualDelay}ms (esperado: ${delayMs}ms)`);
          } catch (error) {
            if (controller.signal.aborted) {
              console.log('❌ Delay entre produtos cancelado pelo usuário');
              return;
            }
            console.log('❌ Erro durante delay entre produtos:', error);
          }
        }
      }

      if (!controller.signal.aborted) {
        console.log('🎉 SendFlow finalizado com sucesso!');
        toast.success('🎉 SendFlow finalizado com sucesso!');
        // Marcar job como completo
        if (currentJobId) {
          await fetch('http://localhost:3333/sending-job/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId: currentJobId,
              processedItems: sentCount,
              status: 'completed'
            })
          });
        }
      }
      
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('❌ Erro crítico no SendFlow:', error);
        toast.error(`❌ Erro crítico: ${error.message}`);
        // Marcar job como erro
        if (currentJobId) {
          await fetch('http://localhost:3333/sending-job/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId: currentJobId,
              status: 'error'
            })
          });
        }
      }
    } finally {
      setIsRunning(false);
      setCurrentIndex(0);
      setCurrentProduct('');
      setCurrentGroup('');
      setAbortController(null);
      setSentCount(0);
      setCurrentJobId(null);
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
    <>
      <SendingControl jobType="sendflow" onResume={(job) => startSendFlow(job)} />
      
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">SendFlow</h1>
        
        {/* Contadores de Status */}
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
            <span className="font-medium">Selecionados:</span>
            <span className="text-blue-700 font-bold">{selectedProducts.size}</span>
          </div>
          {isRunning && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="font-medium">Enviados:</span>
                <span className="text-green-700 font-bold">{sentCount}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-lg">
                <Clock className="w-4 h-4 text-orange-600" />
                <span className="font-medium">Tempo estimado:</span>
                <span className="text-orange-700 font-bold">
                  {(() => {
                    const totalSeconds = selectedProducts.size * selectedGroups.size * timerSeconds;
                    if (totalSeconds < 60) {
                      return `${totalSeconds}s`;
                    } else {
                      const minutes = Math.floor(totalSeconds / 60);
                      const seconds = totalSeconds % 60;
                      return seconds > 0 ? `${minutes}min ${seconds}s` : `${minutes}min`;
                    }
                  })()}
                </span>
              </div>
            </>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button onClick={saveTemplate} variant="outline">
            <Save className="w-4 h-4 mr-2" />
            Salvar Template
          </Button>
          {!isRunning ? (
            <Button 
              onClick={() => {
                console.log('🖱️ Botão "Iniciar SendFlow" clicado!');
                startSendFlow();
              }} 
              className="bg-green-600 hover:bg-green-700"
            >
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
    </>
  );
}