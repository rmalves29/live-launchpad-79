# Guia do Sistema Multi-Tenant WhatsApp

## Visão Geral

O servidor WhatsApp foi atualizado para suportar o sistema multi-tenant, permitindo que múltiplas empresas (tenants) utilizem o mesmo servidor WhatsApp com isolamento completo de dados.

## Como Funciona

### 1. Identificação do Tenant

O sistema identifica o tenant através da URL da requisição:
- URL exemplo: `http://servidor:3333/empresa1/api/send`
- O primeiro segmento do path (`empresa1`) é usado para identificar o tenant
- Este segmento deve corresponder ao `whatsapp_api_url` configurado na tabela `tenants`

### 2. Configuração dos Tenants

Cada tenant deve ter configurado na tabela `tenants`:
- `whatsapp_api_url`: URL completa do endpoint WhatsApp (ex: `http://servidor:3333/empresa1`)
- `is_active`: Deve estar como `true`
- `slug`: Identificador único do tenant

### 3. Isolamento de Dados

Todas as operações do WhatsApp agora respeitam o `tenant_id`:
- Templates WhatsApp específicos por tenant
- Produtos e pedidos isolados por tenant
- Telefones de broadcast filtrados por tenant
- Logs e mensagens segregados por tenant

## Endpoints Atualizados

### Webhooks Oficiais
- `POST /{tenant}/webhooks/order-created`
- `POST /{tenant}/webhooks/order-item-added`
- `POST /{tenant}/webhooks/order-item-cancelled`

### Endpoints de Teste
- `POST /{tenant}/api/test/order-created`
- `POST /{tenant}/api/test/item-added`
- `POST /{tenant}/api/test/item-cancelled`

### Broadcast
- `POST /{tenant}/api/broadcast/by-phones`
- `POST /{tenant}/api/broadcast/orders`

### Envio Simples
- `POST /{tenant}/send`
- `POST /{tenant}/send-message`
- `POST /{tenant}/add-label`

## Exemplo de Configuração

1. **Criar tenant na tabela**:
```sql
INSERT INTO tenants (name, slug, whatsapp_api_url, is_active) 
VALUES ('Empresa 1', 'empresa1', 'http://localhost:3333/empresa1', true);
```

2. **Configurar webhook no sistema**:
```
URL do webhook: http://localhost:3333/empresa1/webhooks/order-created
```

3. **Enviar mensagem de teste**:
```bash
curl -X POST http://localhost:3333/empresa1/api/test/order-created \
  -H "Content-Type: application/json" \
  -d '{"phone": "5511999999999", "customer_name": "João", "total_amount": 100.00, "id": 123}'
```

## Cache de Tenants

O sistema mantém um cache dos tenants ativos por 1 minuto para otimizar performance. O cache é atualizado automaticamente quando necessário.

## Backward Compatibility

O sistema mantém compatibilidade com instalações existentes:
- URLs sem tenant específico continuam funcionando
- Dados existentes sem `tenant_id` são tratados normalmente
- Migração gradual é possível

## Monitoramento

- Logs incluem informação do tenant quando disponível
- Console mostra quais tenants foram carregados na inicialização
- Erros de tenant são logados para debug

## Considerações de Performance

- Cache de tenants reduz consultas ao banco
- Cache de templates por tenant e tipo
- Middleware eficiente para identificação de tenant
- Isolamento de dados não impacta performance significativamente