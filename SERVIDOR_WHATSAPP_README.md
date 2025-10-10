# 🚀 Servidor WhatsApp Multi-Tenant

Servidor Node.js para gerenciar múltiplas conexões WhatsApp com detecção automática de códigos de produtos.

## 📋 Funcionalidades

### ✅ Detecção Automática
- Detecta automaticamente códigos `C###` em mensagens e comentários de grupos
- Processa automaticamente vendas quando detecta códigos
- Envia mensagem de confirmação usando template personalizado por tenant

### 📨 Envio de Mensagens
- `/send` - Enviar mensagem individual
- `/send-group` - Enviar mensagem para grupo (SendFlow)
- Suporte a templates personalizados por tenant

### 📊 Gerenciamento
- `/status` - Status de todos os tenants
- `/status/:tenantId` - Status de um tenant específico
- `/list-all-groups` - Listar todos os grupos WhatsApp

## 🔧 Instalação

### 1. Instalar Dependências

```bash
npm install whatsapp-web.js express cors qrcode-terminal
```

### 2. Configurar Variáveis de Ambiente

Criar arquivo `.env`:

```env
PORT=3333
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_aqui
```

### 3. Iniciar Servidor

```bash
node server1.js
```

ou com auto-reload:

```bash
npm install -g nodemon
nodemon server1.js
```

## 📱 Conectar WhatsApp

1. Inicie o servidor
2. QR Codes aparecerão no terminal para cada tenant
3. Escaneie cada QR Code com o WhatsApp do respectivo tenant
4. Aguarde a mensagem "✅ [Tenant] está pronto!"

## 🔌 Endpoints da API

### Status Geral
```http
GET http://localhost:3333/status
```

Resposta:
```json
{
  "success": true,
  "tenants": {
    "tenant-id-1": {
      "tenant_name": "MANIA DE MULHER",
      "status": "online",
      "qr": null
    }
  }
}
```

### Listar Grupos
```http
GET http://localhost:3333/list-all-groups
Headers:
  x-tenant-id: tenant-id-aqui
```

Resposta:
```json
{
  "success": true,
  "groups": [
    {
      "id": "120363123456789@g.us",
      "name": "Grupo Vendas",
      "participantCount": 250
    }
  ]
}
```

### Enviar para Grupo (SendFlow)
```http
POST http://localhost:3333/send-group
Headers:
  x-tenant-id: tenant-id-aqui
  Content-Type: application/json

Body:
{
  "groupId": "120363123456789@g.us",
  "message": "🛍️ *VESTIDO AZUL* (C101)\n\n💰 R$ 89,90"
}
```

### Enviar Mensagem Individual
```http
POST http://localhost:3333/send
Headers:
  x-tenant-id: tenant-id-aqui
  Content-Type: application/json

Body:
{
  "phone": "5531999999999",
  "message": "Olá! Seu pedido foi confirmado."
}
```

## 🤖 Detecção Automática de Códigos

O servidor detecta automaticamente quando alguém envia mensagens com códigos de produtos:

### Exemplo:
```
Cliente no grupo: "Quero o C101 e o C205"
```

**O que acontece:**
1. ✅ Servidor detecta os códigos C101 e C205
2. 🔍 Busca produtos no banco de dados
3. 🛒 Cria/atualiza pedido automaticamente
4. 📦 Adiciona itens ao carrinho
5. ⬇️ Decrementa estoque
6. 📱 Envia mensagem de confirmação ao cliente

## 🔄 Fluxo de Processamento

```mermaid
graph TD
    A[Mensagem Recebida] --> B{Contém C###?}
    B -->|Não| C[Ignora]
    B -->|Sim| D[Extrai Códigos]
    D --> E[Chama Edge Function]
    E --> F[Busca Produto]
    F --> G[Cria/Atualiza Pedido]
    G --> H[Adiciona ao Carrinho]
    H --> I[Atualiza Estoque]
    I --> J[Envia Confirmação]
```

## 🏗️ Arquitetura

- **Node.js**: Gerencia conexões WhatsApp e envia mensagens
- **Edge Functions**: Processa lógica de negócio (vendas, estoque, etc)
- **Supabase**: Armazena dados e templates

### Por que essa arquitetura?

✅ **Separação de Responsabilidades**
- Node.js: Comunicação WhatsApp
- Edge Functions: Lógica de negócio
- Supabase: Persistência de dados

✅ **Escalabilidade**
- Edge Functions escalam automaticamente
- Node.js gerencia apenas conexões

✅ **Manutenibilidade**
- Código organizado e modular
- Fácil adicionar novas funcionalidades

## 🔧 Configuração do Frontend

No arquivo de integração WhatsApp do frontend, configure:

```typescript
api_url: "http://localhost:3333"  // URL do servidor Node.js
```

Para produção (Railway/Heroku):
```typescript
api_url: "https://seu-app.railway.app"
```

## 📝 Logs

O servidor exibe logs detalhados:

```
📨 Mensagem recebida (MANIA DE MULHER): Quero o C101
🔍 Códigos detectados: [ 'C101' ]
👤 Cliente: 5531999999999
🔄 Processando código C101...
✅ Código C101 processado
```

## 🚨 Troubleshooting

### Problema: QR Code não aparece
**Solução**: Verifique se a porta 3333 está livre e se o Node.js tem permissões

### Problema: "WhatsApp não conectado"
**Solução**: Escaneie o QR Code novamente

### Problema: "tenant_id obrigatório"
**Solução**: Adicione o header `x-tenant-id` nas requisições

### Problema: Códigos não são detectados
**Solução**: Verifique se:
- O formato é C seguido de números (C101, C205)
- O tenant está online
- A edge function está deployada

## 🔐 Segurança

- ✅ Service Role Key armazenada em variável de ambiente
- ✅ Validação de tenant_id em todas as requisições
- ✅ Logs de todas as mensagens enviadas
- ✅ Autenticação persistente local

## 📦 Deploy em Produção

### Railway
```bash
# 1. Criar projeto no Railway
# 2. Conectar repositório
# 3. Adicionar variável de ambiente:
SUPABASE_SERVICE_ROLE_KEY=sua_chave

# 4. Railway detecta automaticamente o start script
```

### Heroku
```bash
heroku create seu-app-whatsapp
heroku config:set SUPABASE_SERVICE_ROLE_KEY=sua_chave
git push heroku main
```

## 📞 Suporte

Em caso de dúvidas:
1. Verifique os logs do servidor
2. Verifique o status dos tenants
3. Consulte a documentação do Supabase
