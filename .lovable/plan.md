

## Integração Omie ERP

A Omie usa autenticação por **App Key + App Secret** (sem OAuth2), o que simplifica bastante comparado ao Bling/Olist.

### O que será criado

**1. Tabela `integration_omie`** (migration SQL)
- Campos: `app_key`, `app_secret`, `sync_orders`, `sync_products`, `sync_stock`, `sync_invoices`, `is_active`, `last_sync_at`
- RLS seguindo o padrão das demais integrações (profiles join)

**2. Componente Frontend `OmieIntegration.tsx`**
- Formulário para App Key e App Secret
- Toggles para módulos (Pedidos, Produtos, Estoque, NF-e)
- Botão "Testar Conexão" que chama a API Omie (`/geral/empresas/`)
- Indicador de status (conectado/desconectado)
- Seguirá o layout do OlistIntegration/BlingIntegration

**3. Aba na página de Integrações**
- Nova tab "Omie ERP" em `TenantIntegrationsPage.tsx` com ícone e status

**4. Edge Function `omie-sync-orders/index.ts`**
- Recebe `tenant_id`, busca credenciais da `integration_omie`
- Para cada pedido pago não sincronizado:
  - Cria/atualiza cliente via `IncluirCliente` 
  - Cria pedido de venda via `IncluirPedidoVenda`
- Marca pedido como sincronizado (`bling_sync_status` → campo genérico ou novo campo `omie_sync_status`)

**5. Edge Function `omie-sync-products/index.ts`**
- Lista produtos da Omie via `ListarProdutos` e sincroniza com tabela `products`

### Detalhes técnicos

- API Omie: `https://app.omie.com.br/api/v1/` com POST JSON contendo `app_key`, `app_secret`, `call` e `param`
- Sem necessidade de secrets no Supabase (credenciais ficam na tabela por tenant)
- Será necessário adicionar coluna `omie_order_id` e `omie_sync_status` na tabela `orders` para rastreio

