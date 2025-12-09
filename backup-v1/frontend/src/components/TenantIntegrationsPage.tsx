/**
 * Página de Integrações por Tenant
 * Permite configurar Mercado Pago e Melhor Envio
 * Usa automaticamente o tenant do usuário logado
 */

import { useState, useEffect } from 'react';
import { 
  TenantPaymentIntegration, 
  TenantShippingIntegration,
  SavePaymentIntegrationRequest,
  SaveShippingIntegrationRequest
} from '@/types/integrations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useTenantContext } from '@/contexts/TenantContext';
import { Navigate } from 'react-router-dom';

export default function TenantIntegrationsPage() {
  const { tenant, loading: tenantLoading } = useTenantContext();
  const tenantId = tenant?.id || '';
  // Estado para Mercado Pago
  const [paymentIntegration, setPaymentIntegration] = useState<TenantPaymentIntegration | null>(null);
  const [mpAccessToken, setMpAccessToken] = useState('');
  const [mpPublicKey, setMpPublicKey] = useState('');
  const [mpIsSandbox, setMpIsSandbox] = useState(true);
  const [mpLoading, setMpLoading] = useState(false);
  const [mpVerifying, setMpVerifying] = useState(false);
  
  // Estado para Melhor Envio
  const [shippingIntegration, setShippingIntegration] = useState<TenantShippingIntegration | null>(null);
  const [meApiToken, setMeApiToken] = useState('');
  const [meIsSandbox, setMeIsSandbox] = useState(true);
  const [meSenderName, setMeSenderName] = useState('');
  const [meSenderPhone, setMeSenderPhone] = useState('');
  const [meSenderEmail, setMeSenderEmail] = useState('');
  const [meLoading, setMeLoading] = useState(false);
  const [meVerifying, setMeVerifying] = useState(false);
  
  // Estados gerais
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Carregar integrações existentes
  useEffect(() => {
    loadIntegrations();
  }, [tenantId]);

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Buscar integração de pagamento
      const paymentRes = await fetch(`/api/integrations/payment/${tenantId}`);
      if (paymentRes.ok) {
        const data = await paymentRes.json();
        setPaymentIntegration(data);
        if (data.access_token) setMpAccessToken('••••••••');
        if (data.public_key) setMpPublicKey('••••••••');
        setMpIsSandbox(data.is_sandbox);
      }
      
      // Buscar integração de envio
      const shippingRes = await fetch(`/api/integrations/shipping/${tenantId}`);
      if (shippingRes.ok) {
        const data = await shippingRes.json();
        setShippingIntegration(data);
        if (data.api_token) setMeApiToken('••••••••');
        setMeIsSandbox(data.is_sandbox);
        if (data.sender_config?.name) setMeSenderName(data.sender_config.name);
        if (data.sender_config?.phone) setMeSenderPhone(data.sender_config.phone);
        if (data.sender_config?.email) setMeSenderEmail(data.sender_config.email);
      }
      
    } catch (err) {
      console.error('Erro ao carregar integrações:', err);
      setError('Erro ao carregar integrações');
    } finally {
      setLoading(false);
    }
  };

  // Salvar Mercado Pago
  const handleSaveMercadoPago = async () => {
    try {
      setMpLoading(true);
      setError(null);
      setSuccess(null);
      
      const payload: SavePaymentIntegrationRequest = {
        provider: 'mercado_pago',
        is_sandbox: mpIsSandbox,
      };
      
      // Só enviar credenciais se não forem o placeholder
      if (mpAccessToken && mpAccessToken !== '••••••••') {
        payload.access_token = mpAccessToken;
      }
      if (mpPublicKey && mpPublicKey !== '••••••••') {
        payload.public_key = mpPublicKey;
      }
      
      const res = await fetch(`/api/integrations/payment/${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) throw new Error('Erro ao salvar integração');
      
      const data = await res.json();
      setPaymentIntegration(data);
      setSuccess('Integração Mercado Pago salva com sucesso!');
      
    } catch (err) {
      console.error('Erro ao salvar Mercado Pago:', err);
      setError('Erro ao salvar integração do Mercado Pago');
    } finally {
      setMpLoading(false);
    }
  };

  // Verificar Mercado Pago
  const handleVerifyMercadoPago = async () => {
    try {
      setMpVerifying(true);
      setError(null);
      setSuccess(null);
      
      const res = await fetch(`/api/integrations/payment/${tenantId}/verify`, {
        method: 'POST',
      });
      
      if (!res.ok) throw new Error('Erro ao verificar integração');
      
      const data = await res.json();
      if (data.success) {
        setSuccess(`Integração verificada! ${data.message}`);
        await loadIntegrations();
      } else {
        setError(`Erro na verificação: ${data.message}`);
      }
      
    } catch (err) {
      console.error('Erro ao verificar Mercado Pago:', err);
      setError('Erro ao verificar integração do Mercado Pago');
    } finally {
      setMpVerifying(false);
    }
  };

  // Salvar Melhor Envio
  const handleSaveMelhorEnvio = async () => {
    try {
      setMeLoading(true);
      setError(null);
      setSuccess(null);
      
      const payload: SaveShippingIntegrationRequest = {
        provider: 'melhor_envio',
        is_sandbox: meIsSandbox,
        sender_config: {
          name: meSenderName,
          phone: meSenderPhone,
          email: meSenderEmail,
        },
      };
      
      // Só enviar token se não for o placeholder
      if (meApiToken && meApiToken !== '••••••••') {
        payload.api_token = meApiToken;
      }
      
      const res = await fetch(`/api/integrations/shipping/${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) throw new Error('Erro ao salvar integração');
      
      const data = await res.json();
      setShippingIntegration(data);
      setSuccess('Integração Melhor Envio salva com sucesso!');
      
    } catch (err) {
      console.error('Erro ao salvar Melhor Envio:', err);
      setError('Erro ao salvar integração do Melhor Envio');
    } finally {
      setMeLoading(false);
    }
  };

  // Verificar Melhor Envio
  const handleVerifyMelhorEnvio = async () => {
    try {
      setMeVerifying(true);
      setError(null);
      setSuccess(null);
      
      const res = await fetch(`/api/integrations/shipping/${tenantId}/verify`, {
        method: 'POST',
      });
      
      if (!res.ok) throw new Error('Erro ao verificar integração');
      
      const data = await res.json();
      if (data.success) {
        setSuccess(`Integração verificada! ${data.message}`);
        await loadIntegrations();
      } else {
        setError(`Erro na verificação: ${data.message}`);
      }
      
    } catch (err) {
      console.error('Erro ao verificar Melhor Envio:', err);
      setError('Erro ao verificar integração do Melhor Envio');
    } finally {
      setMeVerifying(false);
    }
  };

  // Verificar se tenant está carregando
  if (tenantLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Redirecionar se não tiver tenant
  if (!tenant || !tenantId) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Erro:</strong> Você precisa estar logado em uma empresa para acessar as integrações.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <h1 className="text-3xl font-bold mb-2">Integrações</h1>
      <p className="text-muted-foreground mb-6">
        Configure suas integrações de pagamento e envio
      </p>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-4 border-green-500 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="mercadopago" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="mercadopago">
            Mercado Pago
            {paymentIntegration?.is_active && (
              <CheckCircle2 className="ml-2 h-4 w-4 text-green-600" />
            )}
          </TabsTrigger>
          <TabsTrigger value="melhorenvio">
            Melhor Envio
            {shippingIntegration?.is_active && (
              <CheckCircle2 className="ml-2 h-4 w-4 text-green-600" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* Mercado Pago Tab */}
        <TabsContent value="mercadopago">
          <Card>
            <CardHeader>
              <CardTitle>Mercado Pago</CardTitle>
              <CardDescription>
                Configure suas credenciais do Mercado Pago para processar pagamentos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {paymentIntegration?.last_verified_at && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Última verificação: {new Date(paymentIntegration.last_verified_at).toLocaleString('pt-BR')}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="mp-access-token">Access Token *</Label>
                <Input
                  id="mp-access-token"
                  type="password"
                  placeholder="APP_USR-..."
                  value={mpAccessToken}
                  onChange={(e) => setMpAccessToken(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Obtenha em: <a href="https://www.mercadopago.com.br/developers/panel" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Painel de Desenvolvedores</a>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mp-public-key">Public Key</Label>
                <Input
                  id="mp-public-key"
                  type="text"
                  placeholder="APP_USR-..."
                  value={mpPublicKey}
                  onChange={(e) => setMpPublicKey(e.target.value)}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="mp-sandbox"
                  checked={mpIsSandbox}
                  onCheckedChange={setMpIsSandbox}
                />
                <Label htmlFor="mp-sandbox">Modo Sandbox (Teste)</Label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleSaveMercadoPago} 
                  disabled={mpLoading || !mpAccessToken}
                >
                  {mpLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Integração
                </Button>
                
                {paymentIntegration && (
                  <Button 
                    variant="outline" 
                    onClick={handleVerifyMercadoPago}
                    disabled={mpVerifying}
                  >
                    {mpVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verificar Conexão
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Melhor Envio Tab */}
        <TabsContent value="melhorenvio">
          <Card>
            <CardHeader>
              <CardTitle>Melhor Envio</CardTitle>
              <CardDescription>
                Configure suas credenciais do Melhor Envio para calcular fretes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {shippingIntegration?.last_verified_at && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Última verificação: {new Date(shippingIntegration.last_verified_at).toLocaleString('pt-BR')}
                    {shippingIntegration.balance_cents > 0 && (
                      <span className="ml-2">
                        | Saldo: R$ {(shippingIntegration.balance_cents / 100).toFixed(2)}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="me-api-token">API Token *</Label>
                <Input
                  id="me-api-token"
                  type="password"
                  placeholder="eyJ0eXAiOiJKV1QiLCJhbGc..."
                  value={meApiToken}
                  onChange={(e) => setMeApiToken(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Obtenha em: <a href="https://melhorenvio.com.br/painel/gerenciar/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Painel Melhor Envio</a>
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="me-sandbox"
                  checked={meIsSandbox}
                  onCheckedChange={setMeIsSandbox}
                />
                <Label htmlFor="me-sandbox">Modo Sandbox (Teste)</Label>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold mb-3">Dados do Remetente</h3>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="me-sender-name">Nome da Empresa</Label>
                    <Input
                      id="me-sender-name"
                      placeholder="Minha Loja"
                      value={meSenderName}
                      onChange={(e) => setMeSenderName(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="me-sender-phone">Telefone</Label>
                      <Input
                        id="me-sender-phone"
                        placeholder="(11) 99999-9999"
                        value={meSenderPhone}
                        onChange={(e) => setMeSenderPhone(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="me-sender-email">E-mail</Label>
                      <Input
                        id="me-sender-email"
                        type="email"
                        placeholder="contato@minhaloja.com"
                        value={meSenderEmail}
                        onChange={(e) => setMeSenderEmail(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={handleSaveMelhorEnvio} 
                  disabled={meLoading || !meApiToken}
                >
                  {meLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Integração
                </Button>
                
                {shippingIntegration && (
                  <Button 
                    variant="outline" 
                    onClick={handleVerifyMelhorEnvio}
                    disabled={meVerifying}
                  >
                    {meVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verificar Conexão
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
