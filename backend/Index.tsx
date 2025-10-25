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
import { Loader2, Send, Save, Users, Package, Clock, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
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
  const [sendingStatus, setSendingStatus] = useState<'idle' | 'validating' | 'sending' | 'completed'>('idle');
  const [totalMessages, setTotalMessages] = useState(0);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);

  // Carregar dados iniciais
  useEffect(() => {
    if (tenant?.id) {
      loadProducts();
      loadTemplate();
      loadGroups();
      checkWhatsAppConnection();
    }
  }, [tenant?.id]);

  const checkWhatsAppConnection = async () => {
    if (!tenant?.id) return;

    setCheckingConnection(true);
    try {
      const { data: integration, error } = await supabaseTenant
        .from('integration_whatsapp')
        .select('api_url')
        .eq('is_active', true)
        .maybeSingle();

      if (error || !integration?.api_url) {
        setWhatsappConnected(false);
        return;
      }

      const statusResponse = await fetch(`${integration.api_url}/status/${tenant.id}`, {
        method: 'GET',
        headers: { 'x-tenant-id': tenant.id }
      });

      if (!statusResponse.ok) {
        setWhatsappConnected(false);
        return;
      }

      const statusData = await statusResponse.json();
      setWhatsappConnected(statusData.success && statusData.status === 'online');
    } catch (error) {
      console.error('Erro ao verificar conexão WhatsApp:', error);
      setWhatsappConnected(false);
    } finally {
      setCheckingConnection(false);
    }
  };

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
    setSendingStatus('validating');

    try {
      // 1. Buscar integração
      const { data: integration, error: integrationError } = await supabaseTenant
        .from('integration_whatsapp')
        .select('api_url')
        .eq('is_active', true)
        .maybeSingle();

      if (integrationError || !integration?.api_url) {
        throw new Error('Integração WhatsApp não configurada');
      }

      // 2. Validar conexão WhatsApp
      const statusResponse = await fetch(`${integration.api_url}/status/${tenant?.id}`, {
        method: 'GET',
        headers: { 'x-tenant-id': tenant?.id || '' }
      });

      if (!statusResponse.ok) {
        throw new Error('Erro ao verificar status do WhatsApp');
      }

      const statusData = await statusResponse.json();
      
      if (!statusData.success || statusData.status !== 'online') {
        toast({
          title: 'WhatsApp não conectado',
          description: 'Conecte o WhatsApp antes de enviar mensagens',
          variant: 'destructive',
          duration: 8000
        });
        setSending(false);
        setSendingStatus('idle');
        return;
      }

      // 3. Preparar mensagens
      setSendingStatus('sending');
      const selectedProductArray = products.filter(p => selectedProducts.has(p.id));
      const selectedGroupArray = Array.from(selectedGroups);
      
      const messages: Array<{ groupId: string; message: string; productName: string }> = [];
      
      selectedProductArray.forEach(product => {
        const personalizedMessage = personalizeMessage(product);
        selectedGroupArray.forEach(groupId => {
          messages.push({
            groupId,
            message: personalizedMessage,
            productName: product.name
          });
        });
      });

      setTotalMessages(messages.length);

      console.log(`📦 Enviando ${messages.length} mensagens para o backend...`);

      // 4. Enviar todas as mensagens de uma vez para o backend (fila)
      const sendResponse = await fetch(`${integration.api_url}/sendflow-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenant?.id || ''
        },
        body: JSON.stringify({ messages })
      });

      if (!sendResponse.ok) {
        const errorData = await sendResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao enviar mensagens');
      }

      const responseData = await sendResponse.json();

      toast({
        title: '✅ Envio iniciado!',
        description: `${messages.length} mensagens adicionadas à fila. O envio está acontecendo no background.`,
        duration: 10000
      });

      setSendingStatus('completed');
      
      // Resetar após 3 segundos
      setTimeout(() => {
        setSendingStatus('idle');
        setSelectedProducts(new Set());
        setSelectedGroups(new Set());
      }, 3000);

    } catch (error: any) {
      console.error('Erro ao enviar mensagens:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao enviar mensagens',
        variant: 'destructive',
        duration: 8000
      });
      setSendingStatus('idle');
    } finally {
      setSending(false);
    }
  };

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

      {/* Grupos do WhatsApp */}
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
          {loadingGroups ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum grupo encontrado</p>
              <p className="text-sm">Certifique-se de que o WhatsApp está conectado</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {groups.map((group) => (
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
                    {group.participantCount && (
                      <p className="text-sm text-muted-foreground">
                        {group.participantCount} participantes
                      </p>
                    )}
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
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAllProducts}
              disabled={products.length === 0}
            >
              {selectedProducts.size === products.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </Button>
          </div>
          <CardDescription>
            Selecione os produtos que serão enviados ({selectedProducts.size} selecionado(s))
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum produto cadastrado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cor</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Preço</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
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
                    <TableCell className="font-mono">{product.code}</TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.color || '-'}</TableCell>
                    <TableCell>{product.size || '-'}</TableCell>
                    <TableCell>{formatPrice(product.price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
          <div>
            <Label>Intervalo entre produtos (segundos)</Label>
            <Input
              type="number"
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(Number(e.target.value))}
              min="5"
              max="300"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Tempo de espera após enviar todos os grupos de um produto
            </p>
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
                  Enviando mensagens...
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
              {sendingStatus === 'sending' && `Adicionando ${totalMessages} mensagens à fila...`}
              {sendingStatus === 'completed' && 'Todas as mensagens foram adicionadas à fila e estão sendo enviadas no background'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Botão de Envio */}
      <div className="flex justify-center">
        <Button
          onClick={handleSendMessages}
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
                ? `(${selectedProducts.size} × ${selectedGroups.size} = ${selectedProducts.size * selectedGroups.size} mensagens)`
                : 'Mensagens'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
