## Objetivo

Adicionar um botão de status **Entregue** no modal de edição do pedido (`EditOrderDialog`), logo após os botões existentes "Em Separação", "Enviado" e "Liberado para Retirada". O botão apenas altera o `order_status` interno — sem disparar WhatsApp ou outras automações.

## Mudanças

### 1. `src/components/EditOrderDialog.tsx`
- Ampliar o tipo do `useState` de `orderStatus` para incluir `'entregue'`:
  ```ts
  useState<'em_separacao' | 'enviado' | 'liberado_retirada' | 'entregue' | ''>('')
  ```
- Adicionar um quarto botão tipo "pill" logo depois do "Liberado para Retirada" (linha ~670), seguindo o mesmo padrão visual dos demais:
  - Ícone: `CheckCircle2` (lucide-react)
  - Cor ativa: verde mais escuro (ex.: bg `#bbf7d0` / text `#166534` / border `#4ade80`) para diferenciar do "Enviado"
  - Label: **Entregue**
  - Comportamento: toggle (clica de novo, volta para vazio)
- A lógica de salvar já persiste `order_status: finalStatus` — nenhum ajuste extra necessário.
- Garantir que o auto-status do rastreio (`finalStatus = trimmedTracking ? 'enviado' : (orderStatus || null)`) **não sobrescreva** "entregue". Ajuste:
  ```ts
  const finalStatus = orderStatus === 'entregue'
    ? 'entregue'
    : (trimmedTracking ? 'enviado' : (orderStatus || null));
  ```

### 2. Exibição na listagem (opcional, recomendado)
Se o `order_status` for exibido como badge em `src/pages/pedidos/Index.tsx` ou no `ViewOrderDialog`, incluir o label e a cor para `'entregue'` para que a coluna mostre corretamente o novo status. (Verifico ao implementar e só altero se já existir o mapeamento.)

## Observações técnicas

- A coluna `orders.order_status` é `text` livre, então não exige migration.
- O trigger `auto_set_order_status_enviado` só atua quando o **código de rastreio muda**; salvar manualmente como "entregue" não dispara o trigger.
- Sem alterações em edge functions, banco ou webhooks.

## Fora de escopo

- Disparo automático de mensagem de "pedido entregue" no WhatsApp.
- Coluna/botão de Entregue na tabela `/pedidos`.
- Registro de `delivered_at` (data de entrega).
