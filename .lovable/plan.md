

## Integração InfinitePay (Checkout) — Análise de viabilidade

### Resposta direta

**Sim, é totalmente possível integrar o InfinitePay** ao OrderZaps. A API pública de checkout deles é simples (apenas 3 endpoints) e se encaixa perfeitamente no padrão que já usamos para Mercado Pago, Pagar.me e Appmax.

### Como o InfinitePay funciona (resumo técnico)

| Recurso | Como funciona |
|---|---|
| **Autenticação** | Apenas o `handle` (InfiniteTag, ex: `colakids`) — sem API key, sem OAuth |
| **Criar link** | `POST https://api.infinitepay.io/invoices/public/checkout/links` com `handle`, `itens`, `order_nsu`, `redirect_url`, `webhook_url` |
| **Resposta** | `{ link, slug }` — o `link` é a URL do checkout para redirecionar o cliente |
| **Webhook** | InfinitePay POSTa em `webhook_url` com status do pagamento (`paid`, `capture_method`, `transaction_nsu`, `installments`, `paid_amount`) |
| **Consulta de status** | `POST /invoices/public/checkout/payment_check` (fallback) |
| **Métodos aceitos** | PIX, Crédito (até 12x), Débito |
| **Pré-preenchimento** | Aceita objeto `customer` (nome, email, telefone) e `address` (CEP, rua, bairro, etc.) |

### Funcionalidade que dá pra entregar

1. **Aba "InfinitePay" em /config → Integrações**, ao lado de Mercado Pago, Pagar.me e Appmax
2. Cliente escolhe InfinitePay no checkout → sistema gera link → redireciona pra `checkout.infinitepay.io`
3. Após pagar, InfinitePay redireciona de volta para nossa página universal `/pagamento/retorno`
4. Webhook confirma o pagamento automaticamente, marca `is_paid = true`, dispara confirmação por WhatsApp e notifica Bling/ERP — exatamente como Mercado Pago e Pagar.me fazem hoje
5. **Exclusividade mútua**: ativar InfinitePay desativa MP/Pagar.me/Appmax automaticamente (mesmo padrão atual)

### Limitações honestas a considerar

- **Sem desconto PIX nativo**: a API não tem campo separado de desconto PIX por método. Solução: aplicar o desconto antes de gerar o link (igual já fazemos no Pagar.me/Appmax) — funciona, mas o cliente vê o valor já com desconto, não a opção "pague no PIX e ganhe X%"
- **Sem split/divisão de pagamento**
- **Webhook sem assinatura HMAC documentada**: precisamos validar via `payment_check` após receber o webhook (defesa contra spoofing)
- **`handle` é público**: qualquer um que descobrir o handle de um lojista pode gerar links em nome dele. Mitigação: gerar `order_nsu` aleatório e validar status via `payment_check` antes de marcar pedido como pago

### Plano de implementação (alto nível)

1. **Banco**: tabela `integration_infinitepay` (`tenant_id`, `handle`, `is_active`) + trigger de exclusividade mútua com MP/Pagar.me/Appmax
2. **UI de configuração**: componente `InfinitePayIntegration.tsx` na página `/config → Integrações` (campo único: handle)
3. **Edge function** `create-infinitepay-payment`: gera link a partir do carrinho, retorna URL para redirecionamento
4. **Edge function** `infinitepay-webhook` (verify_jwt = false): recebe webhook, chama `payment_check` para confirmar, marca pedido como pago
5. **Checkout**: adicionar InfinitePay como opção em `PublicCheckout.tsx` quando ativa para o tenant
6. **Página de retorno**: já existe (`/pagamento/retorno`) — apenas adicionar suporte ao parâmetro do InfinitePay
7. **Forma de pagamento**: adicionar ao `payment-method-utils.ts` os labels `infinitepay_pix`, `infinitepay_credit`

### Tempo estimado

Integração completa (config + checkout + webhook + retorno + testes) cabe em **uma rodada de implementação** depois que você aprovar.

### Pergunta antes de começar

Quer que eu já implemente tudo, ou prefere que eu faça primeiro só a parte de configuração (cadastro do handle) para testar visualmente, e depois ligo o checkout e o webhook?

