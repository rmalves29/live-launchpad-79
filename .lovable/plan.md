
# Fila de Espera de Produtos

Quando um produto está esgotado e uma cliente tenta comprar (vitrine, WhatsApp/LIVE, manual), ela entra automaticamente em uma fila por ordem de chegada. Quando o estoque volta (cancelamento de pedido ou reposição), o sistema cria um pedido automaticamente para a próxima cliente da fila, reserva a unidade e notifica via WhatsApp com link de pagamento. Se ela não pagar dentro do tempo configurado, passa para a próxima.

## 1. Banco de dados (migration)

**Nova tabela `product_waitlist`**
- `id`, `tenant_id`, `product_id`, `customer_id`, `customer_phone`, `customer_name`
- `qty` (quantidade desejada, default 1)
- `status`: `waiting` | `notified` | `converted` | `expired` | `cancelled`
- `position` (calculada por ordem de `created_at` no tenant+produto)
- `source`: `storefront` | `whatsapp` | `manual`
- `notified_at`, `reserved_until`, `order_id` (pedido criado quando atendida)
- `created_at`, `updated_at`
- Índices: `(tenant_id, product_id, status, created_at)` e `(reserved_until)` para o cron.
- RLS: tenant_admin/staff do tenant; service_role total. GRANTs explícitos.

**Nova coluna em `tenants`**
- `waitlist_reserve_minutes` integer default 120 (tempo de reserva configurável).
- `waitlist_enabled` boolean default true.

**Trigger `on_stock_returned_process_waitlist`**
- Em `products` AFTER UPDATE quando `stock` aumenta de 0 para >0 (ou simplesmente sobe): chama edge function `waitlist-process-next` via `http_post` (fast-path, respeitando limite de 4s — apenas dispara, não processa).
- Em `orders` AFTER UPDATE quando `is_cancelled` vira true: trigger já existente restaura estoque; o trigger de `products` cuida do resto.

## 2. Edge Functions

**`waitlist-enqueue`** (chamada por `storefront-add-to-cart`, fluxo WhatsApp e admin)
- Recebe `tenant_id`, `product_id`, dados da cliente, `source`.
- Verifica se cliente já está na fila ativa daquele produto (status `waiting` ou `notified`) — se sim, retorna posição atual.
- Insere registro `waiting`, calcula posição (count + 1), retorna `{position, estimated_wait}`.

**`waitlist-process-next`** (disparada por trigger e cron)
- Para cada produto com estoque > 0, busca o primeiro `waiting` ordenado por `created_at`.
- Decrementa estoque atomicamente (igual `storefront-add-to-cart`); se falhar, encerra.
- Cria pedido LIVE de hoje para a cliente (mesma lógica do storefront), reserva unidade.
- Atualiza waitlist: `status=notified`, `notified_at=now`, `reserved_until=now + waitlist_reserve_minutes`, `order_id`.
- Envia WhatsApp via template novo `WAITLIST_AVAILABLE` com link de pagamento e prazo.

**`waitlist-expire-reservations`** (cron a cada 5 min via pg_cron)
- Busca `notified` com `reserved_until < now` e sem pagamento.
- Cancela o pedido reservado (restaura estoque, dispara o trigger novamente para a próxima).
- Marca waitlist como `expired` e envia mensagem opcional avisando.

## 3. Integração nos pontos de entrada

**`storefront-add-to-cart`**: quando retorna `OUT_OF_STOCK`/`INSUFFICIENT_STOCK`, chamar `waitlist-enqueue` e devolver `{waitlisted: true, position}` para a UI mostrar "Você é a 3ª na fila".

**Fluxo WhatsApp (reconhecimento de código)**: quando produto esgotado, em vez de só responder "esgotado", enfileirar e responder com posição.

**Admin (página de produto / pedido manual)**: botão "Adicionar cliente à fila" disponível mesmo com estoque zero.

## 4. UI — Página "Fila de Espera"

**Menu lateral**: novo item em **Gestão** → `Fila de Espera` (rota `/fila-espera`).

**Página** (`src/pages/fila-espera/Index.tsx`):
- Filtro por produto, status, canal.
- Tabela com colunas: Posição, Produto (código + foto), Cliente (nome/telefone/Instagram), Qtd, Status (badge colorido), Origem, Entrou em, Reserva expira em, Pedido (link), Ações.
- Ações por linha: Reordenar (subir/descer), Remover da fila, Notificar manualmente (força processamento mesmo sem estoque, se admin quiser), Ver pedido reservado.
- Card no topo: total esperando, total notificadas pendentes, total convertidas (últimos 30d).
- Realtime via Supabase Realtime na tabela `product_waitlist`.

**Configurações → aba Loja**: novo campo "Tempo de reserva da fila de espera (minutos)" + toggle "Ativar fila de espera".

**Storefront**: quando produto esgotado, botão muda para "Entrar na fila de espera" e modal pede dados (mesmo fluxo de identificação já existente).

## 5. Template WhatsApp

Novo tipo `WAITLIST_AVAILABLE` criado automaticamente para todo tenant via trigger existente `create_default_whatsapp_templates`:
```
🎉 Boa notícia! O produto *{{produto}}* (cód. {{codigo}}) voltou ao estoque e separamos uma unidade para você!
⏰ Você tem até {{prazo}} para finalizar o pagamento.
💳 Link: {{link}}
Caso não pague no prazo, o produto passa para a próxima cliente da fila.
```

## 6. Detalhes técnicos relevantes

- Trigger `http_post` apenas dispara edge function (fast-path < 4s) conforme regra do projeto.
- Datas em UTC-3 explícito.
- Decremento de estoque atômico com `gt('stock', 0)` para evitar race condition entre fila e compra normal.
- Pedidos criados pela fila marcados com `source='waitlist'` para rastreabilidade.
- Cancelamento pela fila usa mesmo caminho de cancelamento existente para reaproveitar restauração de estoque.
- RLS: cliente final nunca lê a tabela diretamente; storefront recebe posição via edge function.
