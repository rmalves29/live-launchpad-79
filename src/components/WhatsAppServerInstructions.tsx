import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Code, Download, Play, Smartphone, Terminal } from 'lucide-react';

const WhatsAppServerInstructions = () => {
  const codeBlock = `// server-whatsapp-minimo.js
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

// ===================== Config =====================
const PORT = process.env.PORT || 3000;
const COUNTRY_CODE = process.env.COUNTRY_CODE || '55';
const HEADLESS = (process.env.HEADLESS || 'true').toLowerCase() === 'true';

// ... resto do código`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Instruções - Servidor WhatsApp Node.js
          </CardTitle>
          <CardDescription>
            Configure o servidor Node.js para integrar o WhatsApp com seu sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pré-requisitos */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">1. Pré-requisitos</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Node.js 18+</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">npm ou yarn</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">WhatsApp Business</Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Instalação */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">2. Instalação das Dependências</h3>
            <div className="bg-muted p-4 rounded-lg">
              <code className="text-sm">
                npm install whatsapp-web.js express cors express-fileupload qrcode-terminal
              </code>
            </div>
          </div>

          <Separator />

          {/* Código do Servidor */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">3. Criar o Servidor</h3>
            <p className="text-muted-foreground">
              Crie um arquivo <code>server-whatsapp-minimo.js</code> com o código fornecido.
            </p>
            <div className="bg-muted p-4 rounded-lg max-h-32 overflow-y-auto">
              <pre className="text-xs text-muted-foreground">
                {codeBlock}
              </pre>
            </div>
            <Alert>
              <Code className="h-4 w-4" />
              <AlertDescription>
                O código completo do servidor foi fornecido pelo usuário. Use exatamente como foi passado.
              </AlertDescription>
            </Alert>
          </div>

          <Separator />

          {/* Execução */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">4. Executar o Servidor</h3>
            <div className="space-y-2">
              <div className="bg-muted p-4 rounded-lg">
                <code className="text-sm">node server-whatsapp-minimo.js</code>
              </div>
              <p className="text-sm text-muted-foreground">
                O servidor irá iniciar na porta 3000 por padrão.
              </p>
            </div>
          </div>

          <Separator />

          {/* QR Code */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">5. Conectar WhatsApp</h3>
            <div className="space-y-2">
              <Alert>
                <Smartphone className="h-4 w-4" />
                <AlertDescription>
                  Após executar o servidor, um QR Code aparecerá no terminal. Escaneie com seu WhatsApp Business.
                </AlertDescription>
              </Alert>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Abra o WhatsApp no seu celular</li>
                <li>Vá em <strong>Configurações → Aparelhos conectados</strong></li>
                <li>Toque em <strong>Conectar um aparelho</strong></li>
                <li>Escaneie o QR Code exibido no terminal</li>
              </ul>
            </div>
          </div>

          <Separator />

          {/* Configuração da Integração */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">6. Configurar Integração</h3>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Após conectar o WhatsApp, configure a integração nesta página:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Defina a URL do servidor (ex: http://localhost:3000)</li>
                <li>Ative o monitoramento automático</li>
                <li>O sistema processará mensagens automaticamente</li>
                <li>Pedidos serão criados quando detectar o formato correto</li>
              </ul>
            </div>
          </div>

          <Separator />

          {/* Formato das Mensagens */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">7. Formato das Mensagens</h3>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                O sistema detecta pedidos automaticamente quando as mensagens seguem este formato:
              </p>
              <div className="bg-muted p-4 rounded-lg">
                <pre className="text-sm">
{`Pedido:
2x Produto A - R$ 25,00
1x Produto B - R$ 30,00
Nome: João Silva`}
                </pre>
              </div>
              <p className="text-xs text-muted-foreground">
                Formato flexível: [quantidade]x [nome do produto] - R$ [preço]
              </p>
            </div>
          </div>

          <Alert>
            <Play className="h-4 w-4" />
            <AlertDescription>
              <strong>Importante:</strong> Mantenha o servidor Node.js executando para receber mensagens em tempo real.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};

export default WhatsAppServerInstructions;