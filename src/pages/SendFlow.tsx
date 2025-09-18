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
  const [timerMinutes, setTimerMinutes] = useState(1);
  const [targetPhone, setTargetPhone] = useState('');
  const [whatsappGroups, setWhatsappGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    loadProducts();
    loadTemplate();
  }, [tenant?.id]);

  useEffect(() => {
    if (targetPhone) {
      identifyWhatsAppGroups();
    }
  }, [targetPhone]);

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
        .eq('type', 'sendflow')
        .single();

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

  const identifyWhatsAppGroups = async () => {
    if (!targetPhone || !tenant?.id) return;
    
    try {
      // Fazer chamada para o servidor Node.js para identificar grupos
      const response = await fetch(`http://localhost:3333/identify-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: targetPhone })
      });

      if (!response.ok) throw new Error('Erro ao identificar grupos');
      
      const data = await response.json();
      setWhatsappGroups(data.groups || []);
    } catch (error) {
      console.error('Erro ao identificar grupos WhatsApp:', error);
      toast.error('Erro ao identificar grupos WhatsApp');
      setWhatsappGroups([]);
    }
  };

  const saveTemplate = async () => {
    if (!tenant?.id || !messageTemplate) return;
    
    try {
      const { error } = await supabase
        .from('whatsapp_templates')
        .upsert({
          tenant_id: tenant.id,
          type: 'sendflow',
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

    await saveTemplate();
    setIsRunning(true);
    setCurrentIndex(0);
    processSendFlow();
  };

  const processSendFlow = async () => {
    const selectedProductArray = products.filter(p => selectedProducts.has(p.id));
    
    for (let i = currentIndex; i < selectedProductArray.length && isRunning; i++) {
      setCurrentIndex(i);
      const product = selectedProductArray[i];
      const personalizedMessage = personalizeMessage(product);

      try {
        // Enviar para cada grupo selecionado
        for (const groupId of selectedGroups) {
          await fetch(`http://localhost:3333/send-to-group`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              groupId,
              message: personalizedMessage,
              imageUrl: product.image_url
            })
          });
        }

        toast.success(`Produto ${product.code} enviado com sucesso`);
        
        // Aguardar o tempo configurado antes do próximo envio
        if (i < selectedProductArray.length - 1) {
          await new Promise(resolve => setTimeout(resolve, timerMinutes * 60 * 1000));
        }
      } catch (error) {
        console.error('Erro no envio:', error);
        toast.error(`Erro ao enviar produto ${product.code}`);
      }
    }

    setIsRunning(false);
    setCurrentIndex(0);
    toast.success('SendFlow finalizado!');
  };

  const stopSendFlow = () => {
    setIsRunning(false);
    toast.info('SendFlow pausado');
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
              <div>
                <label className="text-sm font-medium">Número para identificar grupos:</label>
                <Input
                  placeholder="5511999999999"
                  value={targetPhone}
                  onChange={(e) => setTargetPhone(e.target.value)}
                />
              </div>
              
              {whatsappGroups.length > 0 && (
                <div>
                  <label className="text-sm font-medium">Grupos encontrados:</label>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {whatsappGroups.map((group) => (
                      <div key={group.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={group.id}
                          checked={selectedGroups.has(group.id)}
                          onCheckedChange={() => toggleGroup(group.id)}
                        />
                        <label htmlFor={group.id} className="text-sm">
                          {group.name} {group.participantCount && `(${group.participantCount} membros)`}
                        </label>
                      </div>
                    ))}
                  </div>
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
                <label className="text-sm font-medium">Intervalo entre mensagens (minutos):</label>
                <Input
                  type="number"
                  min="1"
                  value={timerMinutes}
                  onChange={(e) => setTimerMinutes(Number(e.target.value))}
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
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Progresso:</span>
                <span>{currentIndex + 1} de {selectedProducts.size}</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / selectedProducts.size) * 100}%` }}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                Enviando para {selectedGroups.size} grupo(s) selecionado(s)
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}