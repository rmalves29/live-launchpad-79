import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabaseTenant } from "@/lib/supabase-tenant";
import { useTenantContext } from "@/contexts/TenantContext";
import { 
  Smartphone, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  QrCode as QrCodeIcon
} from "lucide-react";

interface WhatsAppStatus {
  connected: boolean;
  status: string;
  qrCode?: string;
  message?: string;
  error?: string;
}

export default function ConexaoWhatsApp() {
  const { tenant } = useTenantContext();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    loadWhatsAppIntegration();
  }, [tenant?.id]);

  useEffect(() => {
    if (serverUrl && tenant?.id) {
      startPolling();
      return () => {
        setPolling(false);
      };
    }
  }, [serverUrl, tenant?.id]);

  const loadWhatsAppIntegration = async () => {
    if (!tenant?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabaseTenant
        .from('integration_whatsapp')
        .select('api_url, is_active')
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      // Se não existe integração, criar uma automaticamente
      if (!data) {
        console.log('Criando integração WhatsApp automaticamente...');
        const { data: newIntegration, error: insertError } = await supabaseTenant
          .from('integration_whatsapp')
          .insert({
            tenant_id: tenant.id,
            instance_name: `whatsapp_${tenant.slug}`,
            webhook_secret: crypto.randomUUID(),
            api_url: '',
            is_active: true
          })
          .select('api_url, is_active')
          .single();

        if (insertError) {
          console.error('Erro ao criar integração:', insertError);
          toast({
            title: "Erro ao criar integração",
            description: "Por favor, entre em contato com o suporte.",
            variant: "destructive"
          });
          return;
        }

        toast({
          title: "Integração criada",
          description: "Configure a URL do servidor WhatsApp nas configurações.",
        });
        
        // Não define serverUrl ainda pois está vazio
        return;
      }

      if (!data?.api_url) {
        toast({
          title: "URL não configurada",
          description: "Configure a URL do servidor WhatsApp nas configurações para conectar.",
        });
        return;
      }

      setServerUrl(data.api_url);
    } catch (error: any) {
      console.error('Erro ao carregar integração:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao carregar configuração do WhatsApp",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const startPolling = async () => {
    setPolling(true);
    await checkStatus();

    const interval = setInterval(async () => {
      if (!polling) {
        clearInterval(interval);
        return;
      }
      await checkStatus();
    }, 5000); // Verificar a cada 5 segundos

    return () => clearInterval(interval);
  };

  const checkStatus = async () => {
    if (!serverUrl || !tenant?.id) return;

    try {
      console.log('🔍 Verificando status WhatsApp:', serverUrl, tenant.id);
      
      // Primeiro tentar pegar o QR code diretamente
      try {
        const qrResponse = await fetch(`${serverUrl}/qr/${tenant.id}`);
        console.log('📱 QR Response status:', qrResponse.status);
        
        if (qrResponse.ok) {
          const qrContentType = qrResponse.headers.get("content-type");
          console.log('📱 QR Content-Type:', qrContentType);
          
          if (qrContentType?.includes("text/html")) {
            const html = await qrResponse.text();
            console.log('📱 HTML recebido (primeiros 500 chars):', html.substring(0, 500));
            
            // Tentar extrair o QR code
            const imgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]*>/);
            const statusMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
            
            if (imgMatch && imgMatch[1]) {
              console.log('✅ QR Code encontrado!');
              setWhatsappStatus({
                connected: false,
                status: 'qr_code',
                qrCode: imgMatch[1],
                message: statusMatch ? statusMatch[1] : 'Escaneie o QR Code'
              });
              return;
            } else {
              console.log('⚠️ QR Code não encontrado no HTML');
            }
          } else if (qrContentType?.includes("application/json")) {
            const qrData = await qrResponse.json();
            console.log('📱 QR JSON:', qrData);
            
            if (qrData.qr || qrData.qrCode) {
              setWhatsappStatus({
                connected: false,
                status: 'qr_code',
                qrCode: qrData.qr || qrData.qrCode,
                message: 'Escaneie o QR Code'
              });
              return;
            }
          }
        }
      } catch (qrError) {
        console.log('⚠️ Erro ao buscar QR diretamente:', qrError);
      }
      
      // Se não conseguiu o QR, verificar status
      const statusResponse = await fetch(`${serverUrl}/status/${tenant.id}`);
      console.log('📊 Status Response:', statusResponse.status);
      
      if (!statusResponse.ok) {
        throw new Error(`Servidor respondeu com status ${statusResponse.status}. Verifique se o servidor está rodando no Railway.`);
      }

      const contentType = statusResponse.headers.get("content-type");
      console.log('📊 Content-Type:', contentType);
      
      if (contentType?.includes("application/json")) {
        const data = await statusResponse.json();
        console.log('📊 Status JSON:', data);
        
        setWhatsappStatus({
          connected: data.connected || data.status === 'online',
          status: data.status || 'disconnected',
          message: data.message,
          error: data.error
        });
      } else {
        const text = await statusResponse.text();
        console.log('📊 Status text (primeiros 200 chars):', text.substring(0, 200));
        
        setWhatsappStatus({
          connected: false,
          status: 'disconnected',
          message: 'WhatsApp desconectado. Clique em Reconectar para gerar QR Code.'
        });
      }
    } catch (error: any) {
      console.error('❌ Erro ao verificar status:', error);
      setWhatsappStatus({
        connected: false,
        status: 'error',
        error: error.message || 'Erro ao conectar com servidor WhatsApp. Verifique se o servidor está rodando no Railway.'
      });
    }
  };

  const handleReconnect = async () => {
    if (!serverUrl || !tenant?.id) return;

    try {
      setLoading(true);
      
      toast({
        title: "Reconectando",
        description: "Gerando novo QR Code...",
      });

      // Limpar o status atual para forçar nova verificação
      setWhatsappStatus(null);

      // Aguardar um pouco antes de verificar o status novamente
      setTimeout(() => {
        checkStatus();
        setLoading(false);
      }, 2000);

    } catch (error: any) {
      console.error('Erro ao reconectar:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao tentar reconectar",
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  if (loading && !serverUrl) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!serverUrl) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Smartphone className="h-8 w-8" />
            Conexão WhatsApp
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <AlertCircle className="h-5 w-5" />
              Configuração Necessária
            </CardTitle>
            <CardDescription>
              A URL do servidor WhatsApp precisa ser configurada
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Para conectar o WhatsApp, você precisa:
              </AlertDescription>
            </Alert>

            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                  1
                </span>
                <span>
                  <strong>Fazer deploy do servidor WhatsApp no Railway</strong>
                  <br />
                  <span className="text-muted-foreground">
                    Use os arquivos do diretório <code className="text-xs bg-muted px-1 py-0.5 rounded">backend/</code> para fazer o deploy
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                  2
                </span>
                <span>
                  <strong>Obter a URL pública do Railway</strong>
                  <br />
                  <span className="text-muted-foreground">
                    Exemplo: <code className="text-xs bg-muted px-1 py-0.5 rounded">https://seu-app.railway.app</code>
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                  3
                </span>
                <span>
                  <strong>Configurar a URL no banco de dados</strong>
                  <br />
                  <span className="text-muted-foreground">
                    Execute no Supabase SQL Editor:
                  </span>
                  <pre className="mt-2 p-3 bg-muted rounded-md text-xs overflow-x-auto">
{`UPDATE integration_whatsapp 
SET api_url = 'https://seu-app.railway.app'
WHERE tenant_id = '${tenant?.id}';`}
                  </pre>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                  4
                </span>
                <span>
                  <strong>Recarregue esta página</strong>
                  <br />
                  <span className="text-muted-foreground">
                    Após configurar a URL, recarregue a página para conectar o WhatsApp
                  </span>
                </span>
              </li>
            </ol>

            <div className="pt-4">
              <Button onClick={loadWhatsAppIntegration} variant="outline" className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Verificar Configuração
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Smartphone className="h-8 w-8" />
          Conexão WhatsApp
        </h1>
        <p className="text-muted-foreground mt-2">
          Conecte seu WhatsApp para enviar mensagens automáticas
        </p>
      </div>

      {/* Status da Conexão */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Status da Conexão</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleReconnect}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Reconectar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {whatsappStatus?.connected ? (
            <div className="flex items-center gap-3 text-green-600">
              <CheckCircle2 className="h-6 w-6" />
              <div>
                <p className="font-semibold">WhatsApp Conectado</p>
                <p className="text-sm text-muted-foreground">
                  Seu WhatsApp está conectado e pronto para enviar mensagens
                </p>
              </div>
            </div>
          ) : whatsappStatus?.status === 'error' ? (
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle className="h-6 w-6" />
              <div>
                <p className="font-semibold">Erro de Conexão</p>
                <p className="text-sm text-muted-foreground">
                  {whatsappStatus.error || 'Erro ao conectar com servidor'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-orange-600">
              <AlertCircle className="h-6 w-6" />
              <div>
                <p className="font-semibold">WhatsApp Desconectado</p>
                <p className="text-sm text-muted-foreground">
                  Escaneie o QR Code abaixo para conectar
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* QR Code */}
      {whatsappStatus?.qrCode && !whatsappStatus.connected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCodeIcon className="h-5 w-5" />
              Escaneie o QR Code
            </CardTitle>
            <CardDescription>
              Use o WhatsApp no seu celular para escanear este código
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-6">
              {/* QR Code Image */}
              <div className="bg-white p-4 rounded-lg shadow-lg">
                <img 
                  src={whatsappStatus.qrCode} 
                  alt="QR Code WhatsApp" 
                  className="w-64 h-64"
                />
              </div>

              {/* Instruções */}
              <div className="w-full max-w-md">
                <h3 className="font-semibold mb-3">Como conectar:</h3>
                <ol className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                      1
                    </span>
                    <span>Abra o WhatsApp no seu celular</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                      2
                    </span>
                    <span>Toque em <strong>Mais opções</strong> ou <strong>Configurações</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                      3
                    </span>
                    <span>Selecione <strong>Aparelhos conectados</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                      4
                    </span>
                    <span>Toque em <strong>Conectar um aparelho</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                      5
                    </span>
                    <span>Aponte a câmera para este QR Code</span>
                  </li>
                </ol>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Importante:</strong> Este QR Code é exclusivo para sua empresa ({tenant?.name}). 
                  Não compartilhe com outras pessoas.
                </AlertDescription>
              </Alert>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aguardando QR Code */}
      {!whatsappStatus?.qrCode && !whatsappStatus?.connected && whatsappStatus?.status !== 'error' && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-lg font-semibold">Aguardando QR Code...</p>
              <p className="text-sm text-muted-foreground mt-2">
                O servidor está gerando seu QR Code exclusivo
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Informações Adicionais */}
      {whatsappStatus?.connected && (
        <Alert className="mt-6">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Seu WhatsApp está conectado com sucesso! Agora você pode enviar mensagens automáticas 
            de confirmação de pedidos e outras notificações para seus clientes.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
