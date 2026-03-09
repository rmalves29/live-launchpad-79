

## Plano: Integração com Olist ERP (similar ao Bling)

### Visão Geral
Criar uma integração completa com o Olist (antigo Tiny ERP) seguindo exatamente o mesmo padrão da integração Bling existente: tabela no banco, componente de configuração com OAuth, módulos de sincronização, e Edge Functions para sync de pedidos e produtos.

### 1. Banco de Dados — Nova tabela `integration_olist`

Criar via migration uma tabela espelhando a estrutura do `integration_bling`:

- `id`, `tenant_id`, `client_id`, `client_secret`, `access_token`, `refresh_token`, `token_expires_at`
- Módulos: `sync_orders`, `sync_products`, `sync_stock`, `sync_invoices`
- `environment`, `is_active`, `last_sync_at`, `created_at`, `updated_at`
- RLS policies idênticas às do Bling (tenant + super_admin)

### 2. Frontend — Componente `OlistIntegration.tsx`

Novo componente em `src/components/integrations/` seguindo o padrão do `BlingIntegration.tsx`:
- Campos para Client ID e Client Secret (API Token do Olist)
- Botão de autorização OAuth (Olist usa OAuth2)
- Toggle de módulos (Pedidos, Produtos, Estoque, NF-e)
- Status de conexão com badge ativo/inativo
- Painel de sincronização manual

### 3. Edge Functions

Criar 3 Edge Functions:

- **`olist-oauth`** — Inicia fluxo OAuth com redirect
- **`olist-oauth-callback`** — Troca code por token e salva no banco
- **`olist-sync-orders`** — Busca pedidos do Olist e sincroniza com tabela `orders` (mesmo padrão do `bling-sync-orders`)
- **`olist-sync-products`** — Sincroniza produtos do Olist com tabela `products`

### 4. Página de Integrações

Adicionar nova aba "Olist" no `TenantIntegrationsPage.tsx` e item no `IntegrationsChecklist.tsx`.

### 5. Secrets Necessários

- `OLIST_CLIENT_ID` e `OLIST_CLIENT_SECRET` — credenciais do app OAuth do Olist

### Detalhes Técnicos

- A API do Olist (Tiny) usa REST com autenticação via token de API ou OAuth2
- Base URL da API: `https://api.tiny.com.br/api2/`
- Rate limit: ~30 req/min — implementar delay similar ao Bling
- Endpoints principais: `pedidos.pesquisa`, `produtos.pesquisa`, `nota.fiscal.obter`
- O formato de resposta é XML por padrão, mas suporta JSON via parâmetro `formato=json`

### Ordem de Implementação

1. Migration da tabela `integration_olist` + RLS
2. Componente `OlistIntegration.tsx`
3. Aba na página de integrações
4. Edge Functions (OAuth + Sync)
5. Solicitar secrets ao usuário

