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
  QrCode as QrCodeIcon,
  LogOut
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
  const [waitingTime, setWaitingTime] = useState(0);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  useEffect(() => {
    loadWhatsAppIntegration();
  }, [tenant?.id]);

  useEffect(() => {
    if (serverUrl && tenant?.id) {
      setWaitingTime(0);
      setHasTimedOut(false);
      initializeConnection();
      startPolling();
      return () => {
        setPolling(false);
      };
    }
  }, [serverUrl, tenant?.id]);

  const initializeConnection = async () => {
    if (!tenant?.id) return;
    
    try {
      console.log('🔄 [INIT] Inicializando conexão WhatsApp...');
      
      const { data, error } = await supabaseTenant.functions.invoke(
        'whatsapp-proxy',
        {
          body: {
            action: 'connect',
            tenant_id: tenant.id
          }
        }
      );

      if (error) {
        console.error('❌ [INIT] Erro ao inicializar:', error);
      } else {
        console.log('✅ [INIT] Conexão inicializada:', data);
      }
    } catch (error: any) {
      console.error('❌ [INIT] Erro:', error);
    }
  };

  // Timer para contar tempo de espera e timeout
  useEffect(() => {
    if (!whatsappStatus?.connected && 
        !whatsappStatus?.qrCode && 
        whatsappStatus?.status !== 'error' && 
        serverUrl) {
      
      const timer = setInterval(() => {
        setWaitingTime(prev => {
          const newTime = prev + 1;
          
          // Timeout após 60 segundos
          if (newTime >= 60 && !hasTimedOut) {
            setHasTimedOut(true);
            setWhatsappStatus({
              connected: false,
              status: 'error',
              error: 'Timeout: O QR Code não foi gerado em 60 segundos. Clique em "Tentar Novamente" para reconectar.'
            });
            toast({
              title: "Timeout de Conexão",
              description: "O servidor demorou muito para responder. Tente reconectar.",
              variant: "destructive"
            });
          }
          
          return newTime;
        });
      }, 1000);

      return () => clearInterval(timer);
    } else {
      setWaitingTime(0);
    }
  }, [whatsappStatus, serverUrl, hasTimedOut]);

  const loadWhatsAppIntegration = async () => {
    if (!tenant?.id) {
      console.log('⚠️ [CONEXÃO] Tenant ID não disponível');
      return;
    }

    try {
      console.log('\n🔄 [CONEXÃO] Carregando integração WhatsApp...');
      console.log('📋 [CONEXÃO] Tenant ID:', tenant.id);
      console.log('📋 [CONEXÃO] Tenant Slug:', tenant.slug);
      
      setLoading(true);
      
      const { data, error } = await supabaseTenant
        .from('integration_whatsapp')
        .select('api_url, is_active')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('❌ [CONEXÃO] Erro ao buscar integração:', error);
        throw error;
      }

      console.log('📊 [CONEXÃO] Dados da integração:', data);

      // Se não existe integração, criar uma automaticamente
      if (!data) {
        console.log('⚠️ [CONEXÃO] Nenhuma integração encontrada');
        console.log('🔧 [CONEXÃO] Criando integração WhatsApp automaticamente...');
        
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
          console.error('❌ [CONEXÃO] Erro ao criar integração:', insertError);
          toast({
            title: "Erro ao criar integração",
            description: "Por favor, entre em contato com o suporte.",
            variant: "destructive"
          });
          return;
        }

        console.log('✅ [CONEXÃO] Integração criada com sucesso:', newIntegration);
        toast({
          title: "Integração criada",
          description: "Configure a URL do servidor WhatsApp nas configurações.",
        });
        
        // Não define serverUrl ainda pois está vazio
        return;
      }

      if (!data?.api_url) {
        console.log('⚠️ [CONEXÃO] URL do servidor não configurada');
        console.log('💡 [CONEXÃO] Execute o SQL no Supabase para configurar:');
        console.log(`UPDATE integration_whatsapp SET api_url = 'https://sua-url.railway.app' WHERE tenant_id = '${tenant.id}';`);
        
        toast({
          title: "URL não configurada",
          description: "Configure a URL do servidor WhatsApp nas configurações para conectar.",
        });
        return;
      }

      console.log('✅ [CONEXÃO] URL do servidor configurada:', data.api_url);
      setServerUrl(data.api_url);
    } catch (error: any) {
      console.error('❌ [CONEXÃO] Erro ao carregar integração:', error);
      console.error('📋 [CONEXÃO] Detalhes do erro:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      toast({
        title: "Erro",
        description: error.message || "Erro ao carregar configuração do WhatsApp",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      console.log('✅ [CONEXÃO] Carregamento finalizado\n');
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
    if (!serverUrl || !tenant?.id) {
      console.log('⚠️ [STATUS] Verificação ignorada - serverUrl ou tenant.id não disponível');
      return;
    }

    try {
      console.log('\n' + '='.repeat(70));
      console.log('🔍 [STATUS] VERIFICANDO STATUS DO WHATSAPP');
      console.log('='.repeat(70));
      console.log('📋 [STATUS] Servidor:', serverUrl);
      console.log('📋 [STATUS] Tenant ID:', tenant.id);
      console.log('📋 [STATUS] Tenant Name:', tenant.name);
      
      // Primeiro tentar obter QR Code
      console.log('\n📤 [STATUS] Chamando edge function: whatsapp-proxy (action: qr)');
      
      const { data: functionData, error: functionError } = await supabaseTenant.functions.invoke(
        'whatsapp-proxy',
        {
          body: {
            action: 'qr',
            tenant_id: tenant.id
          }
        }
      );

      if (functionError) {
        console.error('❌ [STATUS] Erro ao chamar proxy:', functionError);
        console.error('📋 [STATUS] Detalhes do erro:', {
          name: functionError.name,
          message: functionError.message
        });
        throw new Error(functionError.message);
      }

      console.log('📥 [STATUS] Resposta do proxy (QR):', JSON.stringify(functionData, null, 2));

      // Se teve erro, mostrar
      if (functionData?.error) {
        console.error('❌ [STATUS] Erro retornado pelo proxy:', functionData.error);
        if (functionData.htmlPreview) {
          console.log('📄 [STATUS] HTML Preview:', functionData.htmlPreview);
        }
        console.log('💡 [STATUS] Verifique se o servidor Node.js está rodando');
        console.log('💡 [STATUS] URL esperada:', `${serverUrl}/qr/${tenant.id}`);
        
        setWhatsappStatus({
          connected: false,
          status: 'error',
          error: `${functionData.error}. Por favor, verifique se o servidor está rodando corretamente.`
        });
        console.log('='.repeat(70) + '\n');
        return;
      }

      // Se já está conectado
      if (functionData?.connected === true || functionData?.status === 'connected') {
        console.log('✅ [STATUS] WhatsApp JÁ ESTÁ CONECTADO!');
        console.log('📊 [STATUS] Dados:', {
          connected: functionData.connected,
          status: functionData.status,
          message: functionData.message
        });
        
        setWhatsappStatus({
          connected: true,
          status: 'connected',
          message: functionData.message || 'WhatsApp está conectado'
        });
        console.log('='.repeat(70) + '\n');
        return;
      }

      // Se está inicializando (aguardando QR code ser gerado)
      if (functionData?.status === 'initializing') {
        console.log('⏳ [STATUS] WhatsApp está INICIALIZANDO...');
        console.log('📊 [STATUS] Mensagem:', functionData.message);
        console.log('💡 [STATUS] Aguarde alguns segundos para o QR Code ser gerado');
        
        setWhatsappStatus({
          connected: false,
          status: 'initializing',
          message: functionData.message || 'Inicializando WhatsApp, aguarde...'
        });
        console.log('='.repeat(70) + '\n');
        return;
      }

      // Se encontrou o QR code
      if (functionData?.qrCode) {
        console.log('✅ [STATUS] QR CODE ENCONTRADO!');
        console.log('📸 [STATUS] Tipo:', functionData.qrCode.substring(0, 30) + '...');
        console.log('📏 [STATUS] Tamanho:', functionData.qrCode.length, 'caracteres');
        console.log('💡 [STATUS] QR Code pronto para ser escaneado');
        
        setWhatsappStatus({
          connected: false,
          status: 'qr_code',
          qrCode: functionData.qrCode,
          message: functionData.message || 'Escaneie o QR Code'
        });
        console.log('='.repeat(70) + '\n');
        return;
      }

      // Se não tem QR, verificar status
      console.log('\n📊 [STATUS] Nenhum QR Code disponível, verificando status...');
      console.log('📤 [STATUS] Chamando edge function: whatsapp-proxy (action: status)');
      
      const { data: statusData, error: statusError } = await supabaseTenant.functions.invoke(
        'whatsapp-proxy',
        {
          body: {
            action: 'status',
            tenant_id: tenant.id
          }
        }
      );

      if (statusError) {
        console.error('❌ [STATUS] Erro ao verificar status:', statusError);
        console.error('📋 [STATUS] Detalhes do erro:', {
          name: statusError.name,
          message: statusError.message
        });
        throw new Error(statusError.message);
      }

      console.log('📥 [STATUS] Resposta do status:', JSON.stringify(statusData, null, 2));
      
      const isConnected = statusData?.connected || statusData?.status === 'online';
      const currentStatus = statusData?.status || 'disconnected';
      
      console.log('📊 [STATUS] Status final:');
      console.log('   - Conectado:', isConnected);
      console.log('   - Status:', currentStatus);
      console.log('   - Mensagem:', statusData?.message);
      if (statusData?.error) {
        console.log('   - Erro:', statusData.error);
      }

      setWhatsappStatus({
        connected: isConnected,
        status: currentStatus,
        message: statusData?.message,
        error: statusData?.error
      });

      console.log('='.repeat(70) + '\n');

    } catch (error: any) {
      console.error('\n❌ [STATUS] ERRO AO VERIFICAR STATUS');
      console.error('='.repeat(70));
      console.error('📋 [STATUS] Tipo:', error.name);
      console.error('📋 [STATUS] Mensagem:', error.message);
      console.error('📋 [STATUS] Stack:', error.stack);
      console.error('='.repeat(70) + '\n');
      
      setWhatsappStatus({
        connected: false,
        status: 'error',
        error: error.message || 'Erro ao conectar com servidor WhatsApp via proxy.'
      });
    }
  };

  const handleReconnect = async () => {
    if (!serverUrl || !tenant?.id) return;

    try {
      setLoading(true);
      setWaitingTime(0);
      setHasTimedOut(false);
      
      console.log('\n🔄 [RECONECTAR] Forçando reset do WhatsApp');
      console.log('📋 [RECONECTAR] Tenant ID:', tenant.id);
      
      toast({
        title: "Reconectando",
        description: "Iniciando nova conexão WhatsApp...",
      });

      // Limpar o status atual
      setWhatsappStatus(null);

      // Chamar edge function para reset
      const { data, error } = await supabaseTenant.functions.invoke(
        'whatsapp-proxy',
        {
          body: {
            action: 'reset',
            tenant_id: tenant.id
          }
        }
      );

      if (error) {
        console.error('❌ [RECONECTAR] Erro no reset:', error);
        throw new Error(error.message);
      }

      console.log('✅ [RECONECTAR] Reset concluído:', data);

      toast({
        title: "Reconectando",
        description: "Aguarde alguns segundos para o novo QR Code ser gerado...",
      });

      // Aguardar 3 segundos antes de verificar o status
      setTimeout(() => {
        console.log('🔍 [RECONECTAR] Verificando status após reset');
        checkStatus();
        setLoading(false);
      }, 3000);

    } catch (error: any) {
      console.error('❌ [RECONECTAR] Erro:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao tentar reconectar",
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!serverUrl || !tenant?.id) return;

    try {
      setLoading(true);
      
      console.log('\n🔌 [DESCONECTAR] Forçando desconexão do WhatsApp');
      console.log('📋 [DESCONECTAR] Servidor:', serverUrl);
      console.log('📋 [DESCONECTAR] Tenant ID:', tenant.id);
      
      toast({
        title: "Desconectando WhatsApp",
        description: "Encerrando sessão do WhatsApp...",
      });

      // Chamar endpoint de reset no servidor Node.js para forçar desconexão
      const resetUrl = `${serverUrl}/reset/${tenant.id}`;
      console.log('📤 [DESCONECTAR] Chamando:', resetUrl);
      
      const response = await fetch(resetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [DESCONECTAR] Erro ao desconectar:', errorText);
        throw new Error('Erro ao desconectar WhatsApp');
      }

      const result = await response.json();
      console.log('✅ [DESCONECTAR] Desconexão bem sucedida:', result);

      // Limpar o status
      setWhatsappStatus({
        connected: false,
        status: 'disconnected',
        message: 'WhatsApp desconectado com sucesso'
      });

      toast({
        title: "WhatsApp Desconectado",
        description: "A sessão foi encerrada com sucesso.",
      });

      setLoading(false);

    } catch (error: any) {
      console.error('❌ [DESCONECTAR] Erro:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao desconectar WhatsApp",
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
            <div className="flex gap-2">
              {whatsappStatus?.connected && (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleDisconnect}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <LogOut className="h-4 w-4 mr-2" />
                  )}
                  Desconectar
                </Button>
              )}
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
            </div>
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
          ) : whatsappStatus?.status === 'initializing' ? (
            <div className="flex items-center gap-3 text-blue-600">
              <Loader2 className="h-6 w-6 animate-spin" />
              <div>
                <p className="font-semibold">Inicializando WhatsApp</p>
                <p className="text-sm text-muted-foreground">
                  {whatsappStatus.message || 'Aguarde enquanto o servidor inicializa...'}
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
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <div>
                <p className="text-lg font-semibold">Aguardando QR Code...</p>
                <p className="text-sm text-muted-foreground mt-2">
                  O servidor está gerando seu QR Code exclusivo
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Aguardando há {waitingTime} segundo{waitingTime !== 1 ? 's' : ''}
                  {waitingTime > 30 && ' (isso pode demorar até 60s)'}
                </p>
              </div>
              
              {waitingTime > 15 && (
                <div className="pt-4">
                  <Button 
                    onClick={handleReconnect} 
                    variant="outline"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Tentar Novamente
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Demorando muito? Tente forçar uma nova conexão
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Erro com botão de retry destacado */}
      {whatsappStatus?.status === 'error' && (
        <Card className="border-destructive">
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
              <div>
                <p className="text-lg font-semibold text-destructive">Erro de Conexão</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {whatsappStatus.error || 'Não foi possível conectar ao servidor WhatsApp'}
                </p>
              </div>
              
              <div className="pt-4 space-y-3">
                <Button 
                  onClick={handleReconnect} 
                  variant="default"
                  size="lg"
                  className="min-w-[200px]"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-5 w-5 mr-2" />
                  )}
                  Tentar Novamente
                </Button>
                
                <p className="text-xs text-muted-foreground">
                  Isso irá limpar a sessão antiga e gerar um novo QR Code
                </p>
              </div>
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
