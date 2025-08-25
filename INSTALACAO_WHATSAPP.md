# Instalação do Servidor WhatsApp

## 1. Pré-requisitos
- Node.js 18+ instalado
- npm ou yarn

## 2. Instalação das dependências

```bash
npm install whatsapp-web.js express cors express-fileupload qrcode-terminal
```

## 3. Executar o servidor

```bash
node server-whatsapp-minimo.js
```

## 4. Conectar o WhatsApp

1. Execute o servidor
2. Um QR Code aparecerá no terminal
3. Escaneie com seu WhatsApp:
   - Abra o WhatsApp no celular
   - Vá em **Configurações → Aparelhos conectados**
   - Toque em **Conectar um aparelho**
   - Escaneie o QR Code

## 5. Testar o envio

Após conectar, teste se está funcionando:

```bash
curl -X POST http://localhost:3000/send-message \
  -H "Content-Type: application/json" \
  -d '{"to":"5531999999999","message":"Teste de mensagem"}'
```

## 6. Endpoints disponíveis

- `GET /status` - Status da conexão
- `GET /messages?limit=50` - Mensagens recebidas
- `POST /send-message` - Enviar mensagem (usado pelo sistema)

## 7. Adaptações feitas

O código foi adaptado para funcionar com o sistema de pedidos:

1. **Novo endpoint `/send-message`**: Compatível com as chamadas do Supabase Edge Function
2. **Logs melhorados**: Para facilitar o debug
3. **Formato de resposta padronizado**: `{"success": true, "message": "..."}`
4. **Tratamento de erros aprimorado**: Retorna status HTTP adequados

## 8. Estrutura do projeto

```
projeto/
├── server-whatsapp-minimo.js  (servidor principal)
├── .wwebjs_auth/             (dados de autenticação - criado automaticamente)
└── uploads/                  (arquivos temporários - criado automaticamente)
```

## 9. Solução de problemas

- **QR Code não aparece**: Verifique se o Node.js 18+ está instalado
- **Erro de conexão**: Aguarde alguns segundos após escanear o QR
- **Mensagem não enviada**: Verifique se o status retorna "ready" em `/status`