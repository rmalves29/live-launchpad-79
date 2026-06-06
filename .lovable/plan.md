## Objetivo
Adicionar à cobrança em massa **dois recursos novos**:
1. Lista de produtos do pedido na mensagem (nome, código, qtd, valor unitário, total)
2. Um **botão clicável customizável** com label e URL definidos pelo usuário

## 1. Lista de produtos no template (já planejado)

### Buscar itens junto com clientes
Em `loadCustomers()` (`src/pages/whatsapp/Cobranca.tsx`), ampliar o select para incluir `id, cart_id`. Em seguida, buscar `cart_items` (qty, unit_price, product_name, product_code) dos carrinhos. Guardar `order_id`, `items[]` e `total_amount` no estado de cada Customer.

Quando o telefone tem vários pedidos no período → usar o pedido **mais recente**.

### Novas variáveis no template
- `{{produtos}}` → bloco multilinha:
  ```
  • Brinco Pérola (C123) — 2x R$ 19,90
  • Colar Coração (C456) — 1x R$ 39,90
  ```
- `{{total}}` → total formatado em `R$ xx,xx`
- `{{pedido}}` → número do pedido
- `{{nome}}` (já existe)

Se o cliente não tiver itens, `{{produtos}}` vira vazio e linhas órfãs são limpas.

### UI
Abaixo do textarea, mostrar chips de variáveis disponíveis (clique insere o token) e um botão "Inserir lista de produtos" que injeta o trecho padrão.

## 2. Botão customizável (CTA)

### Z-API — endpoint
A Z-API expõe `POST /send-button-actions`, que aceita até 3 botões dos tipos `URL`, `CALL` ou `REPLY`. Para nosso caso usaremos **um único botão tipo URL**.

Payload enviado (via `zapi-proxy`):
```json
{
  "phone": "55...",
  "message": "<mensagem com produtos + total>",
  "buttonActions": [
    { "id": "1", "type": "URL", "url": "<link customizado>", "label": "<CTA customizado>" }
  ]
}
```

### UI na página de Cobrança
Adicionar dentro do card de Mensagem um bloco "Botão de ação (opcional)":
- Switch **Adicionar botão à mensagem** (off por padrão)
- Quando ligado, mostrar 2 campos:
  - **Texto do botão (CTA)** — `Input` máx. 20 caracteres (limite do WhatsApp)
  - **Link do botão (URL)** — `Input` validado (precisa começar com `http://` ou `https://`)
- Suporte a variáveis no link e no CTA também: `{{nome}}`, `{{pedido}}`, `{{total}}` — útil quando o link é dinâmico por cliente (ex.: link de pagamento). Mostrar dica abaixo do campo.

### Lógica de envio
Em `handleSendMessages()`:
- Se botão ativo + URL válido → chamar `zapi-proxy` com `action: 'send-button-actions'` em vez de `send-text`.
- Se houver imagem **e** botão → enviar imagem com legenda primeiro e o botão em mensagem separada (limitação Z-API: `send-button-image` existe mas é instável; mais seguro separar).
- Se botão ativo mas URL inválido → bloquear envio com toast.

### Suporte no zapi-proxy
Verificar/estender `supabase/functions/zapi-proxy/index.ts` para encaminhar a action `send-button-actions` ao endpoint correto da Z-API. Se já existir uma action genérica, reutilizar; se não, adicionar bloco análogo aos atuais `send-text` / `send-image`.

### Agendamento
Em `scheduleMessage()`, persistir no `job_data`:
```ts
{
  button: { enabled: boolean, label: string, url: string } | null,
  customers: [{ phone, name, items, total, order_id, payment_link }, ...]
}
```
para que o processador agendado possa reconstruir o envio com botão.

## Arquivos afetados
- `src/pages/whatsapp/Cobranca.tsx` — carga de itens, novos campos de estado (botão), UI, substituição de variáveis no envio.
- `supabase/functions/zapi-proxy/index.ts` — encaminhar `send-button-actions` (se ainda não suportar).
- (Possivelmente) worker que processa `sending_jobs` agendados — adicionar suporte ao novo `button` no `job_data`.

## Limitações a comunicar ao usuário
- WhatsApp aceita no máximo ~20 caracteres no rótulo do botão.
- Botões só funcionam de forma consistente com instâncias Z-API conectadas via WhatsApp Business; em WhatsApp pessoal de algumas versões antigas o cliente pode ver o link como texto comum.
- Mensagens com botão **não** podem ter imagem anexada no mesmo envio (vamos enviar a imagem separada antes do botão).

## Pontos a confirmar
1. Quando o cliente tem **mais de um pedido** no período → usar só o mais recente, ou consolidar tudo em uma lista única?
2. O botão deve ser **único e fixo para todos** os clientes do disparo, ou queremos suportar URL dinâmica via variáveis (ex.: `{{payment_link}}` para mandar o link de pagamento individual de cada pedido)?
