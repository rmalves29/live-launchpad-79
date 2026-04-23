

## Travar método de pagamento (PIX/Cartão) em todos os gateways — atuais e futuros

### Resposta direta

**Sim, dá para deixar programado.** Vou centralizar a lógica de restrição num único lugar do código, de forma que:
1. **Funcione hoje** para Mercado Pago, Pagar.me, Appmax e InfinitePay
2. **Funcione automaticamente** para qualquer gateway novo que for adicionado no futuro, exigindo apenas implementar uma função padrão `applyPaymentMethodLock()` no novo gateway

### Como vai funcionar

**Regra única, válida para todos os gateways:**

| Cliente escolheu | Gateway mostra | Desconto PIX |
|---|---|---|
| **PIX** | Apenas PIX (cartão e boleto bloqueados) | ✅ Aplicado |
| **Cartão** | Apenas cartão (PIX e boleto bloqueados) | ❌ Não aplicado |

### Implementação por gateway (atuais)

| Gateway | Como travar |
|---|---|
| **Mercado Pago** | Adicionar `payment_methods.excluded_payment_types` na preference (bloqueia `credit_card`, `debit_card`, `ticket`, `atm` quando PIX; bloqueia `bank_transfer` quando cartão) + `default_payment_method_id` |
| **Pagar.me** | Trocar `accepted_payment_methods` para `["pix"]` ou `["credit_card"]` conforme escolha; remover blocos não usados da payload |
| **Appmax** | Enviar `payment_type: "Pix"` ou `"CreditCard"` e omitir as opções não escolhidas |
| **InfinitePay** | Adicionar parâmetro `?payment_method=pix` ou `?payment_method=credit_card` na URL do checkout retornada |

### Como fica preparado para gateways futuros

Vou criar um **módulo compartilhado** `supabase/functions/_shared/payment-method-lock.ts` com:

```text
applyPaymentMethodLock(provider, payload, paymentMethod)
  ├─ 'mercado_pago' → injeta excluded_payment_types
  ├─ 'pagarme'      → ajusta accepted_payment_methods
  ├─ 'appmax'       → define payment_type
  ├─ 'infinitepay'  → ajusta URL
  └─ <novo>         → fallback documentado: TODO + log de aviso
```

Quando um gateway novo for adicionado (ex: PagSeguro, Asaas, Stripe BR), basta:
1. Adicionar um `case 'novo_gateway':` nessa função
2. A edge function do novo gateway chama `applyPaymentMethodLock('novo_gateway', payload, body.payment_method)` antes de enviar para a API externa

**Documentação inline** no arquivo deixará claro o padrão para futuras integrações — um checklist no topo do arquivo lembrando: "Todo gateway novo DEVE chamar esta função antes de criar o link de pagamento."

### O que NÃO muda

- UI do checkout (continua com PIX/Cartão)
- Webhooks de confirmação
- Página de retorno `/pagamento/retorno`
- Cálculo do desconto PIX
- Templates de WhatsApp e sincronização Bling

### Detalhes técnicos

**Arquivos criados:**
- `supabase/functions/_shared/payment-method-lock.ts` — função central com switch por provider + JSDoc com instruções para gateways novos

**Arquivos editados:**
- `supabase/functions/create-payment/index.ts` — chamar `applyPaymentMethodLock` para MP, Pagar.me e Appmax antes de enviar
- `supabase/functions/create-infinitepay-payment/index.ts` — chamar `applyPaymentMethodLock` antes de retornar a URL

**Sem alterações em:** banco de dados, frontend, webhooks, página de retorno.

### Validação após deploy

Para cada gateway ativo (MP, Pagar.me, Appmax, InfinitePay):
1. Criar pedido teste, escolher **PIX** → confirmar que o gateway mostra **apenas PIX**
2. Repetir escolhendo **Cartão** → confirmar que mostra **apenas cartão** e o valor **não tem desconto PIX**

