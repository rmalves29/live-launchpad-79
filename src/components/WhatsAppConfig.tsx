import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Save, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';

export function WhatsAppConfig() {
  const { toast } = useToast();
  const { tenant } = useTenant();
  const [apiUrl, setApiUrl] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'checking'>('checking');

  useEffect(() => {
    loadIntegration();
  }, [tenant?.id]);

  const loadIntegration = async () => {
    if (!tenant?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('integration_whatsapp')
        .select('*')
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setIntegrationId(data.id);
        setApiUrl(data.api_url || '');
        setInstanceName(data.instance_name || '');
        setIsActive(data.is_active || false);
        
        // Check server status if URL is configured
        if (data.api_url) {
          checkServerStatus(data.api_url);
        }
      }
    } catch (error) {
      console.error('Error loading WhatsApp integration:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar configuração do WhatsApp',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const checkServerStatus = async (url: string) => {
    setServerStatus('checking');
    try {
      const response = await fetch(`${url}/status`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000) 
      });
      
      if (response.ok) {
        setServerStatus('online');
        toast({
          title: '✅ Servidor Online',
          description: 'Conexão estabelecida com sucesso!',
        });
      } else {
        setServerStatus('offline');
        toast({
          title: '❌ Servidor respondeu com erro',
          description: `Status: ${response.status}`,
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      setServerStatus('offline');
      const errorMsg = error.message || 'Não foi possível conectar';
      toast({
        title: '❌ Servidor Offline',
        description: `${errorMsg}. Verifique se o servidor está rodando e a URL está correta.`,
        variant: 'destructive'
      });
    }
  };

  const handleSave = async () => {
    if (!tenant?.id) {
      toast({
        title: 'Erro',
        description: 'Tenant não identificado',
        variant: 'destructive'
      });
      return;
    }

    if (!apiUrl) {
      toast({
        title: 'Erro',
        description: 'Por favor, informe a URL do servidor',
        variant: 'destructive'
      });
      return;
    }

    if (!instanceName) {
      toast({
        title: 'Erro',
        description: 'Por favor, informe o nome da instância',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);

      const integrationData = {
        tenant_id: tenant.id,
        api_url: apiUrl.trim(),
        instance_name: instanceName.trim(),
        is_active: isActive,
        webhook_secret: integrationId ? undefined : 'default-secret-' + Date.now()
      };

      let result;
      if (integrationId) {
        // Update existing
        result = await supabase
          .from('integration_whatsapp')
          .update(integrationData)
          .eq('id', integrationId)
          .select()
          .single();
      } else {
        // Create new
        result = await supabase
          .from('integration_whatsapp')
          .insert(integrationData)
          .select()
          .single();
      }

      if (result.error) throw result.error;

      setIntegrationId(result.data.id);

      toast({
        title: 'Sucesso',
        description: 'Configuração do WhatsApp salva com sucesso!',
      });

      // Check server status after saving
      if (apiUrl) {
        checkServerStatus(apiUrl);
      }
    } catch (error: any) {
      console.error('Error saving WhatsApp integration:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar configuração',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = () => {
    if (apiUrl) {
      checkServerStatus(apiUrl);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Configuração WhatsApp</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Configuração WhatsApp (Node.js)</span>
          {serverStatus === 'online' && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Wifi className="h-3 w-3 mr-1" />
              Servidor Online
            </Badge>
          )}
          {serverStatus === 'offline' && (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              <WifiOff className="h-3 w-3 mr-1" />
              Servidor Offline
            </Badge>
          )}
          {serverStatus === 'checking' && (
            <Badge variant="outline">
              Verificando...
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Configure a URL do servidor Node.js que mantém a conexão com o WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Server URL */}
        <div className="space-y-2">
          <Label htmlFor="api_url">URL do Servidor Node.js *</Label>
          <Input
            id="api_url"
            placeholder="http://192.168.0.100:3333"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Exemplo: <code className="bg-muted px-1 rounded">http://192.168.0.100:3333</code> ou <code className="bg-muted px-1 rounded">http://seu-dominio.com:3333</code>
          </p>
        </div>

        {/* Instance Name */}
        <div className="space-y-2">
          <Label htmlFor="instance_name">Nome da Instância *</Label>
          <Input
            id="instance_name"
            placeholder="empresa-principal"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Identificador único desta instância do WhatsApp
          </p>
        </div>

        {/* Active Status */}
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="is_active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-gray-300"
          />
          <Label htmlFor="is_active" className="cursor-pointer">
            Integração ativa
          </Label>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
          
          {apiUrl && (
            <Button 
              onClick={handleTestConnection} 
              variant="outline"
              disabled={serverStatus === 'checking'}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Testar Conexão
            </Button>
          )}
        </div>

        {/* Help Section */}
        <div className="mt-6 p-4 bg-muted rounded-lg space-y-3">
          <h4 className="font-medium text-sm">📌 Como configurar:</h4>
          <ul className="text-xs text-muted-foreground space-y-2 list-disc list-inside">
            <li>
              <strong>Mesma rede:</strong> Use o IP local do computador com Node.js (ex: <code>http://192.168.0.100:3333</code>)
            </li>
            <li>
              <strong>Acesso externo:</strong> Use IP público ou domínio (ex: <code>http://seu-ip-publico:3333</code>)
            </li>
            <li>
              <strong>IMPORTANTE:</strong> O servidor deve escutar em <code>0.0.0.0</code> (todas interfaces), não apenas <code>localhost</code>
            </li>
            <li>
              <strong>Porta:</strong> A porta padrão é <code>3333</code>, mas pode ser alterada no servidor
            </li>
          </ul>
          
          {serverStatus === 'offline' && apiUrl && (
            <div className="mt-3 p-3 bg-destructive/10 rounded border border-destructive/20">
              <p className="text-xs font-medium text-destructive mb-2">🔧 Problemas de Conexão?</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Verifique se o servidor Node.js está rodando</li>
                <li>Confirme que o servidor escuta em <code>0.0.0.0</code>, não <code>localhost</code></li>
                <li>Teste se firewall/antivírus não está bloqueando a porta</li>
                <li>Certifique-se que o IP está correto (use <code>ipconfig</code> no Windows ou <code>ifconfig</code> no Linux)</li>
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
