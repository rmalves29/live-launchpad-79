# Guia de Migração - Server v1.0 para v2.0

## 📋 Visão Geral

Este guia explica como migrar do servidor WhatsApp antigo (`server-whatsapp-multitenant.js`) para o novo servidor otimizado (`server-whatsapp-v2.js`).

## 🎯 Por que migrar?

### Problemas do v1.0:
- ❌ Mensagens duplicadas (servidor + triggers)
- ❌ Lógica complexa de confirmação de pagamento
- ❌ Código com funcionalidades obsoletas
- ❌ Difícil manutenção

### Vantagens do v2.0:
- ✅ Zero duplicação de mensagens
- ✅ Triggers do banco fazem o trabalho pesado
- ✅ Código limpo e focado
- ✅ Fácil debug e manutenção
- ✅ Sistema completamente automático

## 🔄 Mudanças Principais

### 1. Sistema de Mensagens Automáticas

**ANTES (v1.0)**:
```javascript
// Servidor enviava mensagem de produto adicionado
await sendItemAddedMessage(productData);
```

**DEPOIS (v2.0)**:
```javascript
// Trigger do banco envia automaticamente
// Servidor só recebe e processa mensagens recebidas
```

### 2. Confirmação de Pagamento

**ANTES (v1.0)**:
```javascript
// Servidor verificava pedidos pagos periodicamente
await checkAndSendPendingPaymentConfirmations(tenantId, client);
```

**DEPOIS (v2.0)**:
```javascript
// Trigger 'process_paid_order' no banco faz tudo automaticamente
// Quando is_paid muda para true, trigger envia mensagem
```

### 3. Endpoints Simplificados

**v1.0** tinha:
- `/send` (com lógica de template complexa)
- `/send` (com order_id)
- `/broadcast`
- `/add-label`
- `/status`
- `/restart/:tenantId`

**v2.0** tem:
- `/send` (simples e direto)
- `/broadcast` (envio em massa)
- `/status` (geral)
- `/status/:tenantId` (específico)
- `/restart/:tenantId` (reiniciar cliente)
- `/health` (novo - health check)

## 📦 Passo a Passo da Migração

### Passo 1: Verificar Triggers no Banco

Certifique-se que os seguintes triggers estão ativos:

```sql
-- Verificar triggers
SELECT 
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  tgenabled AS is_enabled
FROM pg_trigger
WHERE tgname IN (
  'trigger_send_item_added',
  'trigger_send_product_canceled',
  'trigger_process_paid_order'
);
```

Devem existir:
- ✅ `trigger_send_item_added` na tabela `cart_items`
- ✅ `trigger_send_product_canceled` na tabela `cart_items`
- ✅ `trigger_process_paid_order` na tabela `orders`

### Passo 2: Testar Edge Function

Verifique se a edge function `whatsapp-send-template` está funcionando:

```bash
curl -X POST https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/whatsapp-send-template \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "<seu_tenant_uuid>",
    "phone": "31999999999",
    "message": "Teste de mensagem"
  }'
```

### Passo 3: Parar Servidor Antigo

```bash
# Encontre o processo
ps aux | grep server-whatsapp-multitenant.js

# Mate o processo
kill <PID>
```

### Passo 4: Copiar Sessões de Autenticação (Opcional)

Se quiser manter as sessões WhatsApp autenticadas:

```bash
# Copiar autenticações
cp -r .wwebjs_auth_tenants .wwebjs_auth_v2
```

**Nota**: Se não copiar, você precisará escanear o QR Code novamente para cada tenant.

### Passo 5: Iniciar Servidor v2.0

```bash
node server-whatsapp-v2.js
```

Aguarde aparecer:
```
🚀 Iniciando WhatsApp Server v2.0...
📋 Sistema de triggers automáticos ativado
🏢 Carregando tenants...
🔧 Inicializando: Mania de Mulher
```

### Passo 6: Verificar Status

```bash
# Status geral
curl http://localhost:3333/status

# Health check
curl http://localhost:3333/health
```

Resposta esperada:
```json
{
  "success": true,
  "status": "online",
  "version": "2.0",
  "timestamp": "2025-01-10T..."
}
```

## 🧪 Testes Pós-Migração

### Teste 1: Adicionar Produto Manual

1. Acesse `/pedidos-manual`
2. Adicione um produto a um pedido
3. Verifique se mensagem foi enviada automaticamente

**Comportamento esperado**:
- ✅ Produto adicionado ao carrinho
- ✅ Trigger dispara automaticamente
- ✅ Edge function chama servidor Node
- ✅ Mensagem enviada via WhatsApp
- ✅ Log salvo em `whatsapp_messages`

### Teste 2: Cancelar Produto

1. Edite um pedido
2. Remova um item
3. Verifique mensagem de cancelamento

**Comportamento esperado**:
- ✅ Item removido de `cart_items`
- ✅ Trigger de DELETE dispara
- ✅ Mensagem de cancelamento enviada
- ✅ Log salvo no banco

### Teste 3: Marcar Pedido como Pago

1. Vá em `/pedidos`
2. Marque um pedido como pago
3. Verifique confirmação de pagamento

**Comportamento esperado**:
- ✅ `is_paid` atualizado para `true`
- ✅ Trigger dispara
- ✅ Mensagem de pagamento confirmado enviada
- ✅ `payment_confirmation_sent` marcado como `true`

### Teste 4: Mensagem em Massa

```bash
curl -X POST http://localhost:3333/broadcast \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: <tenant_uuid>" \
  -d '{
    "phones": ["31999999999", "31888888888"],
    "message": "🎉 Promoção imperdível!"
  }'
```

**Comportamento esperado**:
- ✅ Mensagens enviadas para todos os números
- ✅ Delay de 2s entre cada envio
- ✅ Logs salvos como tipo `bulk`

## ⚠️ Problemas Comuns

### Problema 1: Mensagens Duplicadas

**Sintoma**: Cliente recebe 2 mensagens iguais

**Causa**: Servidor v1.0 ainda rodando junto com v2.0

**Solução**:
```bash
# Matar todos os processos Node WhatsApp
pkill -f "server-whatsapp"

# Iniciar apenas v2.0
node server-whatsapp-v2.js
```

### Problema 2: QR Code não Aparece

**Sintoma**: Servidor inicia mas não mostra QR Code

**Causa**: Sessão já autenticada

**Solução**: Cliente já está conectado! Verifique:
```bash
curl http://localhost:3333/status/<tenant_uuid>
```

Se status for `online`, está tudo certo.

### Problema 3: Trigger Não Dispara

**Sintoma**: Produto adicionado mas mensagem não enviada

**Causa**: Trigger pode estar desabilitado ou com erro

**Solução**:
```sql
-- Ver logs de erro do postgres
SELECT * FROM postgres_logs 
WHERE event_message ILIKE '%trigger%' 
ORDER BY timestamp DESC 
LIMIT 20;

-- Verificar se trigger existe e está habilitado
SELECT * FROM pg_trigger 
WHERE tgname = 'trigger_send_item_added';
```

### Problema 4: Edge Function com Erro

**Sintoma**: Trigger dispara mas mensagem não chega

**Causa**: Edge function `whatsapp-send-template` com problema

**Solução**:
1. Ver logs da edge function no Supabase Dashboard
2. Verificar se `integration_whatsapp` tem `api_url` configurada
3. Testar edge function manualmente (ver Passo 2)

## 📊 Monitoramento

### Logs do Servidor

```bash
# Iniciar com logs detalhados
node server-whatsapp-v2.js | tee server.log
```

### Logs do Banco

```sql
-- Ver mensagens recentes
SELECT 
  created_at,
  type,
  phone,
  LEFT(message, 50) as message_preview
FROM whatsapp_messages
WHERE tenant_id = '<tenant_uuid>'
ORDER BY created_at DESC
LIMIT 20;
```

### Logs da Edge Function

Acesse: Supabase Dashboard → Edge Functions → `whatsapp-send-template` → Logs

## 🔄 Rollback (Voltar para v1.0)

Se algo der errado:

```bash
# Parar v2.0
pkill -f "server-whatsapp-v2"

# Iniciar v1.0
node server-whatsapp-multitenant.js
```

**⚠️ IMPORTANTE**: Se voltar para v1.0, desabilite os triggers para evitar duplicação:

```sql
-- Desabilitar triggers temporariamente
ALTER TABLE cart_items DISABLE TRIGGER trigger_send_item_added;
ALTER TABLE cart_items DISABLE TRIGGER trigger_send_product_canceled;
ALTER TABLE orders DISABLE TRIGGER trigger_process_paid_order;
```

## ✅ Checklist Pós-Migração

- [ ] Servidor v2.0 iniciado com sucesso
- [ ] Todos os tenants com status `online`
- [ ] Teste de adicionar produto funcionando
- [ ] Teste de cancelar produto funcionando
- [ ] Teste de marcar como pago funcionando
- [ ] Teste de broadcast funcionando
- [ ] Sem mensagens duplicadas
- [ ] Logs sendo salvos corretamente
- [ ] Servidor v1.0 desligado
- [ ] Documentação atualizada

## 🎉 Conclusão

Após a migração completa:

- ✅ Sistema 100% automático
- ✅ Zero intervenção manual
- ✅ Mensagens enviadas pelos triggers
- ✅ Servidor focado em receber mensagens
- ✅ Código limpo e manutenível

## 📞 Suporte

Se encontrar problemas:

1. Verifique logs do servidor Node
2. Verifique logs da edge function
3. Verifique logs do Postgres
4. Teste edge function manualmente
5. Verifique status dos triggers

---

**Versão**: 2.0  
**Data**: Janeiro 2025  
**Compatível com**: Todas as empresas (multi-tenant)
