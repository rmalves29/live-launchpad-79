## O que vai ser feito

Criar um novo status manual chamado **"Envio Pendente"** que aparece **após "Em Separação"** e antes de "Enviado" no fluxo dos pedidos. Sem automações — apenas etiqueta/cor e filtro.

Novo valor interno: `envio_pendente`

Fluxo final dos botões no modal de edição:
```
Em Separação → Envio Pendente → Enviado → Liberado para Retirada → Entregue
```

## Onde será alterado

1. **Modal Editar Pedido** (`src/components/EditOrderDialog.tsx`)
   - Adicionar `'envio_pendente'` ao tipo do `orderStatus`.
   - Adicionar novo botão "Envio Pendente" entre "Em Separação" e "Enviado" (ícone de caixa/relógio).
   - Lógica de auto-status mantida: ao preencher código de rastreio, muda para `enviado` automaticamente (sobrescreve `envio_pendente`).

2. **Listagem de Pedidos** (`src/pages/pedidos/Index.tsx`)
   - Adicionar `'envio_pendente'` ao tipo do `order_status`.
   - Adicionar opção no filtro (Select) "Envio Pendente".
   - Adicionar badge/coluna visual com cor própria (ex.: âmbar/laranja para diferenciar do azul de "Em Separação" e do verde de "Enviado").
   - Adicionar o status no rótulo do filtro selecionado.

3. **Tipos Supabase** (`src/integrations/supabase/types.ts`)
   - Coluna `order_status` é `text` livre (não há enum no banco), então **não precisa migration**. O novo valor `'envio_pendente'` é aceito direto.

## Detalhes técnicos

- Sem mudança de schema, sem trigger novo, sem edge function.
- Sem disparo de WhatsApp, sem sincronização com Bling.
- Cor sugerida para o badge: âmbar (`bg-amber-100 text-amber-700` ou token equivalente do design system).
- Ícone sugerido (lucide): `PackageCheck` ou `Clock`.

## Fora do escopo

- Notificações automáticas ao cliente.
- Sincronização com ERPs.
- Migração/backfill de pedidos antigos.