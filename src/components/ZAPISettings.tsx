import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MessageSquare, Save, CheckCircle2, AlertCircle, ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

interface ZAPIIntegration {
  id: string;
  zapi_instance_id: string | null;
  zapi_token: string | null;
  provider: string;
  is_active: boolean;
  connected_phone: string | null;
}

export function ZAPISettings() {
  const { toast } = useToast();
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [integration, setIntegration] = useState<ZAPIIntegration | null>(null);
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    loadIntegration();
  }, [tenant?.id]);

  const loadIntegration = async () => {
    if (!tenant?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integration_whatsapp')
        .select('id, zapi_instance_id, zapi_token, provider, is_active, connected_phone')
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setIntegration(data);
        setInstanceId(data.zapi_instance_id || '');
        setToken(data.zapi_token || '');
      }
    } catch (error: any) {
      console.error('Error loading Z-API integration:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar integração Z-API',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tenant?.id) return;

    if (!instanceId.trim() || !token.trim()) {
      toast({
        title: 'Erro',
        description: 'Instance ID e Token são obrigatórios',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      if (integration?.id) {
        const { error } = await supabase
          .from('integration_whatsapp')
          .update({
            zapi_instance_id: instanceId,
            zapi_token: token,
            provider: 'zapi',
            updated_at: new Date().toISOString()
          })
          .eq('id', integration.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_whatsapp')
          .insert({
            tenant_id: tenant.id,
            zapi_instance_id: instanceId,
            zapi_token: token,
            provider: 'zapi',
            instance_name: tenant.name || 'default',
            webhook_secret: crypto.randomUUID(),
            is_active: true
          });

        if (error) throw error;
      }

      toast({
        title: 'Sucesso',
        description: 'Configuração Z-API salva com sucesso',
      });

      loadIntegration();
    } catch (error: any) {
      console.error('Error saving Z-API integration:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar configuração',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Z-API
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Z-API WhatsApp
        </CardTitle>
        <CardDescription>
          Configure sua instância Z-API para integração WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-blue-500/30 bg-blue-500/5">
          <AlertCircle className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-sm">
            <strong>Como obter as credenciais:</strong>
            <ol className="list-decimal ml-4 mt-2 space-y-1">
              <li>Acesse <a href="https://z-api.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">z-api.io</a></li>
              <li>Crie uma conta ou faça login</li>
              <li>Crie uma nova instância</li>
              <li>Copie o <strong>Instance ID</strong> e <strong>Token</strong></li>
            </ol>
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="instance-id">Instance ID</Label>
          <Input
            id="instance-id"
            placeholder="Ex: 3CCA7BAXXXXXXXXXXXX"
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="token">Token</Label>
          <div className="relative">
            <Input
              id="token"
              type={showToken ? 'text' : 'password'}
              placeholder="Seu token Z-API"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {integration?.provider === 'zapi' && (
          <div className="pt-4 border-t space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Badge variant={integration.is_active ? 'default' : 'secondary'}>
                {integration.is_active ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Configurado
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Inativo
                  </>
                )}
              </Badge>
            </div>
            
            {integration.connected_phone && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Número Conectado</span>
                <span className="text-sm text-muted-foreground">{integration.connected_phone}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-4">
          <a 
            href="https://developer.z-api.io/docs" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            Documentação Z-API
          </a>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
