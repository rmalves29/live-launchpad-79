# 🚀 WhatsApp Server v3 - Multi-Tenant

Servidor Node.js moderno e otimizado para gerenciar múltiplas instâncias WhatsApp com arquitetura multi-tenant.

## ✨ Características

- ✅ **Multi-Tenant**: Gerencia múltiplos clientes WhatsApp simultaneamente
- ✅ **Integração Supabase**: Sincronizado com banco de dados
- ✅ **Templates**: Sistema de templates personalizáveis por tenant
- ✅ **Broadcast**: Envio em massa com controle de delay
- ✅ **Webhooks**: Integração com Edge Functions
- ✅ **Labels**: Sistema de etiquetas automático
- ✅ **Normalização**: Tratamento correto do 9º dígito por DDD
- ✅ **Logging**: Sistema completo de logs
- ✅ **Sessões**: Persistência de sessões LocalAuth

## 📋 Pré-requisitos

- Node.js 16+ instalado
- Conta Supabase configurada
- Variável `SUPABASE_SERVICE_KEY` configurada

## 🛠️ Instalação

### 1. Instalar dependências

```bash
npm install whatsapp-web.js express cors qrcode-terminal node-fetch
```

### 2. Configurar variável de ambiente

```bash
export SUPABASE_SERVICE_KEY=sua_chave_service_role_aqui
```

Opcional: definir porta customizada
```bash
export PORT=3333
```

### 3. Iniciar servidor

**Opção A: Script automatizado**
```bash
chmod +x start-v3.sh
./start-v3.sh
```

**Opção B: Comando direto**
```bash
node server-whatsapp-v3.js
```

## 📱 Primeiro Uso

1. Ao iniciar, o servidor carrega todos os tenants ativos do Supabase
2. Para cada tenant com integração WhatsApp ativa, um QR Code será exibido
3. Escaneie cada QR Code com o WhatsApp correspondente
4. Aguarde a mensagem "✅ Cliente conectado"

## 🔌 Endpoints da API

### Status Geral
```http
GET http://localhost:3333/status
```

Retorna status de todos os tenants conectados.

### Status de Tenant Específico
```http
GET http://localhost:3333/status/:tenantId
```

### Enviar Mensagem Simples
```http
POST http://localhost:3333/send
Content-Type: application/json

{
  "tenantId": "uuid-do-tenant",
  "phone": "31999999999",
  "message": "Olá! Esta é uma mensagem de teste."
}
```

### Broadcast (Envio em Massa)
```http
POST http://localhost:3333/broadcast
Content-Type: application/json

{
  "tenantId": "uuid-do-tenant",
  "phones": ["31999999999", "11988888888"],
  "message": "Mensagem em massa",
  "delayMs": 2000
}
```

### Adicionar Label/Etiqueta
```http
POST http://localhost:3333/add-label
Content-Type: application/json

{
  "tenantId": "uuid-do-tenant",
  "phone": "31999999999",
  "label": "APP"
}
```

### Enviar com Template
```http
POST http://localhost:3333/send-template
Content-Type: application/json

{
  "tenantId": "uuid-do-tenant",
  "phone": "31999999999",
  "templateType": "PAID_ORDER",
  "variables": {
    "order_id": "123",
    "total": "150.00"
  }
}
```

### Reiniciar Cliente de Tenant
```http
POST http://localhost:3333/restart/:tenantId
```

### Health Check
```http
GET http://localhost:3333/health
```

## 🔧 Configuração Frontend

Atualize a URL do servidor WhatsApp no Supabase:

```sql
UPDATE integration_whatsapp 
SET api_url = 'http://localhost:3333'
WHERE tenant_id = 'seu-tenant-id';
```

Ou se estiver em produção:
```sql
UPDATE integration_whatsapp 
SET api_url = 'https://seu-dominio.com:3333'
WHERE tenant_id = 'seu-tenant-id';
```

## 📊 Templates Suportados

Os seguintes tipos de templates são reconhecidos:

- `ITEM_ADDED` - Item adicionado ao pedido
- `PRODUCT_CANCELED` - Produto cancelado
- `PAID_ORDER` - Confirmação de pagamento
- `SENDFLOW` - Divulgação em grupos
- `MSG_MASSA` - Mensagem em massa

Variáveis disponíveis nos templates: `{{nome}}`, `{{codigo}}`, `{{valor}}`, `{{total}}`, `{{order_id}}`, etc.

## 🔄 Fluxo de Funcionamento

### Envio de Mensagem
```
Frontend (React) → whatsapp-service.ts → HTTP POST → Server v3 → WhatsApp
                                                    ↓
                                            Salva no Supabase
```

### Recebimento de Mensagem
```
WhatsApp → Server v3 → Webhook (Edge Function) → Supabase → Frontend
                  ↓
          Salva no banco
```

## 🗂️ Estrutura de Arquivos

```
.wwebjs_auth_v3/           # Sessões WhatsApp por tenant
├── tenant_uuid-1/
├── tenant_uuid-2/
└── ...

server-whatsapp-v3.js      # Servidor principal
start-v3.sh                # Script de inicialização
```

## 🐛 Troubleshooting

### Problema: QR Code não aparece
- Verifique se a integração está ativa no Supabase
- Confirme que `SUPABASE_SERVICE_KEY` está configurada
- Veja os logs do servidor para erros

### Problema: Cliente não conecta
- Delete a pasta `.wwebjs_auth_v3/tenant_xxx`
- Reinicie o servidor
- Escaneie o QR Code novamente

### Problema: Mensagens não enviam
- Confirme que o status do tenant é "connected"
- Acesse `http://localhost:3333/status` para verificar
- Verifique os logs para erros específicos

### Problema: Telefone não encontrado
- Confirme que o número tem 9º dígito correto
- Use o formato: `31999999999` (sem DDI 55)
- O servidor normaliza automaticamente

## 🔒 Segurança

- ✅ Service Key armazenada em variável de ambiente
- ✅ CORS configurado
- ✅ Validação de campos obrigatórios
- ✅ Tratamento de erros robusto
- ✅ Logs detalhados para auditoria

## 📈 Performance

- Sessões persistentes (não precisa escanear QR toda vez)
- Delay configurável entre envios em massa
- Múltiplos clientes simultâneos
- Conexões WebSocket eficientes

## 🆘 Suporte

Para problemas ou dúvidas:
1. Verifique os logs do servidor
2. Consulte `http://localhost:3333/status`
3. Revise a configuração no Supabase
4. Verifique a conectividade de rede

## 🚀 Produção

Para rodar em produção:

1. Use um gerenciador de processos (PM2):
```bash
npm install -g pm2
pm2 start server-whatsapp-v3.js --name whatsapp-v3
pm2 save
pm2 startup
```

2. Configure HTTPS com nginx/Apache
3. Use variáveis de ambiente do sistema
4. Configure backup automático de `.wwebjs_auth_v3/`

## 📝 Changelog

### v3.0.0 (2025-01-08)
- Reescrita completa do servidor
- Suporte multi-tenant otimizado
- Integração aprimorada com Supabase
- Sistema de templates melhorado
- Normalização de telefones por DDD
- Broadcast com controle de delay
- Sistema de labels/etiquetas
- Webhooks para Edge Functions
- Documentação completa
