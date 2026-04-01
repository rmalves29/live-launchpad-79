import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExternalLink, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTenantContext } from '@/contexts/TenantContext';


interface TokenStatus {
  valid: boolean;
  error?: string;
  needs_oauth?: boolean;
  oauth_url?: string;
  user_info?: {
    name: string;
    email: string;
    company: string;
  };
  integration_info?: {
    sandbox: boolean;
    from_cep: string;
  };
}


export const MelhorEnvioStatus = () => {
  const { toast } = useToast();
  const { tenantId } = useTenantContext();
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const loadEnabledServices = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('shipping_integrations')
      .select('enabled_services')
      .eq('tenant_id', tenantId)
      .eq('provider', 'melhor_envio')
      .maybeSingle();
    if (data?.enabled_services) {
      try {
        const parsed = typeof data.enabled_services === 'string' 
          ? JSON.parse(data.enabled_services) 
          : data.enabled_services;
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          setEnabledServices(parsed);
        }
      } catch {}
    }
  };

  const saveEnabledServices = async () => {
    if (!tenantId) return;
    setSavingServices(true);
    try {
      const { error } = await supabase
        .from('shipping_integrations')
        .update({ enabled_services: JSON.stringify(enabledServices) })
        .eq('tenant_id', tenantId)
        .eq('provider', 'melhor_envio');
      if (error) throw error;
      toast({ title: 'Salvo', description: 'Serviços atualizados com sucesso.' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingServices(false);
    }
  };

  const checkToken = async () => {
    if (!tenantId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('melhor-envio-test-token', {
        body: { tenant_id: tenantId }
      });

      if (error) {
        throw error;
      }

      setStatus(data);
    } catch (error: any) {
      console.error('Erro ao verificar token:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Erro ao verificar status do Melhor Envio',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkToken();
    loadEnabledServices();
  }, [tenantId]);

  const handleOAuthRedirect = () => {
    if (status?.oauth_url) {
      window.open(status.oauth_url, '_blank');
    }
  };

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Status do Melhor Envio
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={checkToken}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-4">
            {loading ? 'Verificando...' : 'Carregando status...'}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Status do Melhor Envio
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={checkToken}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.valid ? (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-medium text-green-600">
                  Integração funcionando corretamente
                </div>
                {status.user_info && (
                  <div className="text-sm space-y-1">
                    <div><strong>Usuário:</strong> {status.user_info.name}</div>
                    <div><strong>Email:</strong> {status.user_info.email}</div>
                    <div><strong>Empresa:</strong> {status.user_info.company}</div>
                  </div>
                )}
                {status.integration_info && (
                  <div className="flex gap-2 mt-2">
                    <Badge variant={status.integration_info.sandbox ? 'secondary' : 'default'}>
                      {status.integration_info.sandbox ? 'Sandbox' : 'Produção'}
                    </Badge>
                    <Badge variant="outline">
                      CEP: {status.integration_info.from_cep}
                    </Badge>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-3">
                <div className="font-medium">
                  Problema na integração: {status.error}
                </div>
                {status.needs_oauth && status.oauth_url && (
                  <div className="space-y-2">
                    <div className="text-sm">
                      É necessário reautorizar o acesso ao Melhor Envio.
                    </div>
                    <Button 
                      onClick={handleOAuthRedirect}
                      className="flex items-center gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Reconfigurar Melhor Envio
                    </Button>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>

    {status?.valid && (
      <div className="mt-4 space-y-3">
        <ShippingServiceSelector
          services={MELHOR_ENVIO_SERVICES}
          enabledServices={enabledServices}
          onToggle={(key, enabled) => {
            setEnabledServices(prev => ({ ...prev, [key]: enabled }));
          }}
        />
        <Button onClick={saveEnabledServices} disabled={savingServices} className="w-full">
          {savingServices ? 'Salvando...' : 'Salvar Serviços'}
        </Button>
      </div>
    )}
    </>
  );
};