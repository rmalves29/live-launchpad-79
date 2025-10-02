import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { formatPhoneForDisplay } from '@/lib/phone-utils';

export default function WhatsAppConnectionTest() {
  const { toast } = useToast();
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<any>(null);

  const checkStatus = async () => {
    setCheckingStatus(true);
    try {
      const response = await fetch('http://localhost:3333/status');
      const data = await response.json();
      setConnectionStatus(data);
      
      toast({
        title: data.whatsapp.canSendMessages ? '✅ Conectado' : '⚠️ Desconectado',
        description: data.whatsapp.readyToSend,
      });
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      toast({
        title: '❌ Servidor Offline',
        description: 'O servidor Node.js não está respondendo na porta 3333',
        variant: 'destructive'
      });
      setConnectionStatus(null);
    } finally {
      setCheckingStatus(false);
    }
  };

  const sendTestMessage = async () => {
    if (!testPhone) {
      toast({
        title: 'Erro',
        description: 'Digite um número de telefone',
        variant: 'destructive'
      });
      return;
    }

    setTesting(true);
    try {
      const response = await fetch('http://localhost:3333/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: testPhone,
          message: '🧪 Teste de mensagem do OrderZaps! Se você recebeu esta mensagem, o sistema está funcionando perfeitamente! ✅'
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: '✅ Mensagem Enviada!',
          description: `Teste enviado com sucesso para ${formatPhoneForDisplay(testPhone)}`,
        });
      } else {
        toast({
          title: '❌ Falha no Envio',
          description: data.error || 'Erro desconhecido',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Erro ao enviar teste:', error);
      toast({
        title: '❌ Erro de Conexão',
        description: 'Não foi possível conectar ao servidor WhatsApp',
        variant: 'destructive'
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          🔧 Teste de Conexão WhatsApp
          <Button 
            variant="outline" 
            size="sm"
            onClick={checkStatus}
            disabled={checkingStatus}
          >
            {checkingStatus ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Verificar Status</span>
          </Button>
        </CardTitle>
        <CardDescription>
          Verifique se o servidor Node.js está conectado e teste o envio de mensagens
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status da Conexão */}
        {connectionStatus && (
          <div className="space-y-2 p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <span className="font-medium">Status do WhatsApp:</span>
              {connectionStatus.whatsapp.canSendMessages ? (
                <Badge className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Conectado
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  Desconectado
                </Badge>
              )}
            </div>
            
            <div className="text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Estado do Cliente:</span>{' '}
                <span className="font-mono">{connectionStatus.whatsapp.clientState}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Estado Puppeteer:</span>{' '}
                <span className="font-mono">{connectionStatus.whatsapp.puppeteerState}</span>
              </div>
              {connectionStatus.whatsapp.phoneNumber !== 'N/A' && (
                <div>
                  <span className="text-muted-foreground">Número:</span>{' '}
                  <span className="font-mono">{connectionStatus.whatsapp.phoneNumber}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Teste de Envio */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Número de Teste (com DDD, sem DDI)
          </label>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Ex: 31999999999"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendTestMessage()}
            />
            <Button 
              onClick={sendTestMessage}
              disabled={testing || !testPhone}
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="ml-2">Enviar Teste</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            💡 Dica: Use seu próprio número para testar. O sistema adicionará automaticamente o DDI 55 e o 9º dígito conforme necessário.
          </p>
        </div>

        {/* Instruções */}
        <div className="text-sm space-y-2 pt-4 border-t">
          <p className="font-medium">📋 Checklist de Diagnóstico:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
            <li>O servidor Node.js está rodando? (porta 3333)</li>
            <li>O QR Code foi escaneado?</li>
            <li>O WhatsApp Web está conectado?</li>
            <li>O número de teste está no formato correto? (DDD + número)</li>
            <li>Verifique os logs do servidor Node.js no console</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
