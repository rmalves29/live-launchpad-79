# Instalação do Sistema WhatsApp

## Dependências Necessárias

Para usar o sistema WhatsApp, você precisa instalar as seguintes dependências:

```bash
npm install whatsapp-web.js@^1.23.0 express@^4.18.2 express-fileupload@^1.4.3 cors@^2.8.5 qrcode-terminal@^0.12.0 node-fetch@^3.3.2
```

### Dependências de Desenvolvimento (Opcional)
```bash
npm install -D nodemon@^3.0.2
```

## Como Iniciar o Servidor WhatsApp

1. **Instale as dependências** (comando acima)

2. **Inicie o servidor:**
```bash
node server-whatsapp.js
```

3. **Escaneie o QR Code** que aparece no terminal com seu WhatsApp

4. **Aguarde o status mudar para "Online"** na página de Integração WhatsApp

## Funcionalidades Disponíveis

### ✅ Mensagens Automáticas
- **Item Adicionado**: Mensagem automática quando cliente escolhe um produto
- **Item Cancelado**: Mensagem automática quando produto é cancelado  
- **Pedido Criado**: Mensagem automática quando novo pedido é criado

### 📱 Integração com Frontend
- **Status do WhatsApp**: Monitore conexões ativas
- **Mensagens em Massa**: Envie para clientes por status (pagos/não pagos/todos)
- **Sistema de Labels**: Adiciona label "APP" automaticamente

### 🔧 APIs Disponíveis

#### Webhooks (com autenticação)
- `POST /webhooks/order-created` - Pedido criado
- `POST /webhooks/order-item-added` - Item adicionado 
- `POST /webhooks/order-item-cancelled` - Item cancelado

#### APIs de Teste (sem autenticação)
- `POST /api/test/order-created` - Teste pedido criado
- `POST /api/test/item-added` - Teste item adicionado
- `POST /api/test/item-cancelled` - Teste item cancelado

#### Broadcast
- `POST /api/broadcast/by-phones` - Envio por lista de telefones
- `POST /api/broadcast/orders` - Envio por status de pedido

#### Status e Logs
- `GET /api/status` - Status das instâncias
- `GET /api/logs` - Logs do sistema
- `GET /api/message-status` - Status das mensagens

## Configuração

### Variáveis de Ambiente (Opcionais)

Crie um arquivo `.env` na raiz do projeto:

```env
# Porta do servidor
PORT=3333

# Configurações WhatsApp
WPP_INSTANCES=instancia1
WIPE_WWEB_SESSION=false
DISABLE_LABELS=false
MASS_BROADCAST_LABEL=APP

# Segurança (altere estes valores)
BROADCAST_SECRET=whatsapp-broadcast-2024
WEBHOOK_SECRET=whatsapp-webhook-2024

# Supabase (já configurado)
SUPABASE_URL=https://hxtbsieodbtzgcvvkeqx.supabase.co
SUPABASE_SERVICE_KEY=sua-service-key-aqui
```

### Configurações Supabase

O sistema está configurado para usar:
- **URL**: `https://hxtbsieodbtzgcvvkeqx.supabase.co`
- **Tabela de Pedidos**: `orders`
- **Campo Telefone**: `customer_phone`
- **Campo Pago**: `is_paid`

## Uso no Sistema

1. **Acesse** `/whatsapp-integration` para ver o status
2. **Configure** templates em `/whatsapp-templates`
3. **Teste** adicionando produtos em `/pedidos-manual`
4. **Envie mensagens em massa** pela página de integração

## Troubleshooting

### QR Code não aparece
- Verifique se o Chrome está instalado
- Tente limpar a sessão: `WIPE_WWEB_SESSION=true node server-whatsapp.js`

### Erro "getChat undefined" 
- Aguarde a injeção do WhatsApp Web carregar (automático)
- O sistema já tem tratamento para este erro

### Instância fica offline
- Verifique conexão com internet
- Reescaneie o QR Code se necessário
- Verifique se o WhatsApp no celular está ativo

## Exemplo de Uso da API

### Enviar mensagem individual
```javascript
const response = await fetch('http://localhost:3333/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    number: '5511999999999',
    message: 'Olá! Seu pedido foi confirmado.'
  })
});
```

### Broadcast por status
```javascript
const response = await fetch('http://localhost:3333/api/broadcast/orders', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'x-api-key': 'whatsapp-broadcast-2024'
  },
  body: JSON.stringify({
    status: 'paid', // 'paid', 'unpaid', 'all'
    message: 'Mensagem para todos os clientes com pedidos pagos!'
  })
});
```