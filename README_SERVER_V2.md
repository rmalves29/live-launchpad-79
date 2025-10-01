# WhatsApp Server v2.0 - Multi-Tenant

Servidor WhatsApp otimizado com sistema de triggers automáticos do banco de dados.

## 🆕 Novidades v2.0

- ✅ **Triggers Automáticos**: Mensagens de produto adicionado, cancelado e pagamento são enviadas automaticamente pelo banco
- ✅ **Multi-Tenant**: Suporta múltiplas empresas simultaneamente
- ✅ **Otimizado**: Código mais limpo e eficiente
- ✅ **Zero Duplicação**: Não envia mensagens duplicadas, confia nos triggers
- ✅ **Logs Detalhados**: Sistema de logs completo para debug

## 📦 Instalação

```bash
npm install whatsapp-web.js express cors qrcode-terminal node-fetch
```

## 🚀 Iniciar Servidor

```bash
node server-whatsapp-v2.js
```

## 📡 Endpoints

### Status Geral
```
GET /status
```
Retorna status de todos os tenants.

### Status por Tenant
```
GET /status/:tenantId
```

### Enviar Mensagem
```
POST /send
Headers: x-tenant-id: <UUID>
Body: {
  "number": "31999999999",
  "message": "Sua mensagem aqui"
}
```

### Broadcast (Mensagem em Massa)
```
POST /broadcast
Headers: x-tenant-id: <UUID>
Body: {
  "phones": ["31999999999", "31888888888"],
  "message": "Mensagem para todos"
}
```

### Reiniciar Cliente
```
POST /restart/:tenantId
```

### Health Check
```
GET /health
```

## 🔧 Configuração

### 1. Variáveis de Ambiente (Opcional)

```bash
PORT=3333
SUPABASE_SERVICE_KEY=<sua_chave>
```

### 2. Integração WhatsApp no Supabase

Cada tenant deve ter um registro ativo na tabela `integration_whatsapp`:

```sql
INSERT INTO integration_whatsapp (
  tenant_id,
  instance_name,
  is_active,
  api_url,
  webhook_secret
) VALUES (
  '<tenant_uuid>',
  'Instância Tenant',
  true,
  'http://localhost:3333',
  'webhook-secret-123'
);
```

## 🔄 Sistema de Triggers Automáticos

O servidor v2.0 trabalha em conjunto com triggers do banco de dados que enviam mensagens automaticamente:

### Triggers Implementados:

1. **ITEM_ADDED** - Quando produto é adicionado ao carrinho
2. **PRODUCT_CANCELED** - Quando produto é removido/cancelado
3. **PAID_ORDER** - Quando pedido é marcado como pago

**Importante**: O servidor Node **NÃO** envia essas mensagens diretamente. Os triggers do banco fazem isso via edge function `whatsapp-send-template`.

## 📊 Fluxo de Mensagens

```
┌─────────────────┐
│  Ação no App    │
│ (Add produto)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Trigger DB     │
│ (Automático)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Edge Function  │
│ whatsapp-send-  │
│    template     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Node Server    │
│  /send endpoint │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  WhatsApp API   │
│  (Cliente Web)  │
└─────────────────┘
```

## 🔍 Mensagens Recebidas

Quando uma mensagem chega do WhatsApp:

1. Server recebe via `client.on('message')`
2. Processa e identifica:
   - Grupo ou individual
   - Telefone do autor
   - Conteúdo da mensagem
3. Envia para webhook: `/functions/v1/whatsapp-multitenant/:tenantId`
4. Edge function processa e identifica códigos de produtos
5. Cria/atualiza carrinho automaticamente
6. Trigger do banco envia mensagem de confirmação

## 🏢 Multi-Tenant

O servidor suporta múltiplas empresas simultaneamente:

- Cada tenant tem seu próprio cliente WhatsApp
- Autenticação separada por tenant (QR Code único)
- Sessões persistidas em `.wwebjs_auth_v2/tenant_<UUID>`
- Logs identificados por tenant

## 🔐 Segurança

- Autenticação LocalAuth por tenant
- API Key do Supabase necessária
- Webhook secret por tenant
- Validação de tenant em todas as requisições

## 📝 Logs

O servidor registra todas as atividades:

```
✅ Cliente WhatsApp conectado: Mania de Mulher
📨 [uuid] Mensagem recebida: {...}
📤 [uuid] Enviando para 5531999999999
💾 Mensagem salva
```

## 🆚 Diferenças v1.0 vs v2.0

| Recurso | v1.0 | v2.0 |
|---------|------|------|
| Triggers DB | ❌ | ✅ |
| Multi-Tenant | ✅ | ✅ |
| Confirmação Pagamento | Manual | Automático |
| Produto Adicionado | Manual | Automático via Trigger |
| Produto Cancelado | Manual | Automático via Trigger |
| Código Limpo | ⚠️ | ✅ |
| Zero Duplicação | ⚠️ | ✅ |

## 🐛 Debug

Para ver logs detalhados:

```bash
# Status do servidor
curl http://localhost:3333/status

# Health check
curl http://localhost:3333/health

# Status de um tenant específico
curl http://localhost:3333/status/<tenant_uuid>
```

## 📞 Normalização de Telefones

O servidor normaliza automaticamente números brasileiros:

- Remove caracteres não numéricos
- Adiciona DDI 55
- Adiciona 9º dígito para celulares automaticamente

Exemplos:
- `31993786530` → `5531993786530`
- `3193786530` → `5531993786530` (adiciona 9)
- `5531993786530` → `5531993786530`

## 🚨 Troubleshooting

### Cliente não conecta
1. Verifique se tenant tem integração ativa no banco
2. Confira logs do servidor
3. Tente reiniciar: `POST /restart/:tenantId`

### Mensagens não chegam
1. Verifique status: `GET /status/:tenantId`
2. Confirme que status está `online`
3. Teste health check: `GET /health`

### QR Code não aparece
1. Cliente já pode estar autenticado
2. Verifique pasta `.wwebjs_auth_v2/tenant_<UUID>`
3. Delete a pasta para forçar novo QR Code

## 📚 Documentação Adicional

- [WhatsApp Web.js](https://wwebjs.dev/)
- [Express.js](https://expressjs.com/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

## 🤝 Suporte

Para issues e suporte, verifique:
1. Logs do servidor Node
2. Logs da edge function no Supabase
3. Logs do banco de dados (postgres_logs)
