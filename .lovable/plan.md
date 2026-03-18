

## Plano: Integração Bagy — Exportar Pedidos + Abater Estoque (somente OrderZap)

### Resumo
Criar integração com a Bagy (Dooca Commerce API) para exportar pedidos do OrderZap e abater estoque automaticamente. A aba será visível apenas para tenants com slug `orderzap` (usando o mesmo padrão `ALLOWED_ADVANCED_SLUGS` já existente para WhatsApp Cloud e Instagram).

### Arquivos a criar

| Arquivo | Descrição |
|---|---|
| `docs/SQL_INTEGRATION_BAGY.sql` | SQL de referência para a tabela |
| `supabase/functions/bagy-sync/index.ts` | Edge function com actions: `test_connection`, `export_order`, `sync_stock` |
| `src/components/integrations/BagyIntegration.tsx` | Componente de configuração (Bearer token, toggles, sync manual) |

### Arquivos a editar

| Arquivo | Alteração |
|---|---|
| `supabase/config.toml` | Adicionar `[functions.bagy-sync]` |
| `src/components/TenantIntegrationsPage.tsx` | Adicionar aba Bagy dentro do bloco `showAdvancedIntegrations`, query de status, import do componente |

### Migração SQL

Criar tabela `integration_bagy`:
- `id uuid PK`, `tenant_id uuid UNIQUE FK`, `access_token text`, `is_active boolean`
- `sync_orders_out boolean`, `sync_stock boolean`, `last_sync_at timestamptz`
- RLS: mesmo padrão das outras integrações (tenant + super_admin via profiles)

Adicionar coluna `bagy_order_id bigint` na tabela `orders`.

### Edge Function `bagy-sync`

Uma única function consolidada com CORS, recebendo `{ tenant_id, action, order_id? }`:

- **`test_connection`**: `GET /products?limit=1` na API Dooca para validar token
- **`export_order`**: Busca pedido + itens no OrderZap, cria pedido na Bagy via `POST /orders`, salva `bagy_order_id`
- **`sync_stock`**: Para cada item exportado, busca produto na Bagy por SKU, calcula novo saldo e atualiza via `PUT /stocks`

Base URL: `https://api.dooca.store`, Auth: `Bearer {token}`

### Componente `BagyIntegration.tsx`

Seguindo padrão do OlistIntegration:
- Campo Bearer Token (com toggle mostrar/ocultar)
- Botão "Testar Conexão"
- Toggle: Exportar pedidos para Bagy
- Toggle: Abater estoque automaticamente
- Botão: Sincronizar estoque manualmente
- Badge ativo/inativo, data da última sincronização

### Visibilidade

A aba Bagy será renderizada condicionalmente usando `showAdvancedIntegrations` (slugs `orderzap` e `app`), mesmo padrão já usado para WhatsApp Cloud e Instagram.

