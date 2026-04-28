## Objetivo

Quando o gateway de pagamento ativo do tenant for **InfinitePay**:
1. O quadro "Forma de Pagamento" (PIX / Cartão de Crédito) **não aparece** no checkout público.
2. O cliente consegue finalizar o pedido normalmente, **sem precisar selecionar nada** — vai direto para o checkout da InfinitePay, onde escolherá PIX, Cartão ou Boleto.

Para os demais gateways (Mercado Pago, Pagar.me, Appmax) o quadro continua aparecendo como hoje.

## Mudanças

### `src/pages/pedidos/PublicCheckout.tsx`

**1) Detectar qual gateway está ativo**

No `useEffect` que já consulta as 4 integrações de pagamento (linhas ~292-326), aproveitar a mesma resposta para definir um novo estado:

```ts
const [activePaymentProvider, setActivePaymentProvider] =
  useState<'infinitepay' | 'mp' | 'pagarme' | 'appmax' | null>(null);
```

Preencher dentro do `Promise.all` existente — sem nova requisição ao banco.

**2) Esconder o quadro quando for InfinitePay**

Envolver o bloco "Forma de Pagamento" (linhas 1701-1749, incluindo o `<Separator />` que vem antes) com:

```tsx
{activePaymentProvider !== 'infinitepay' && (
  <>
    <Separator />
    {/* Forma de Pagamento ... */}
  </>
)}
```

Resultado: o quadro azul com PIX/Cartão simplesmente não é renderizado quando InfinitePay está ativa.

**3) Garantir que o envio funcione sem interação**

Quando `activePaymentProvider === 'infinitepay'`, definir automaticamente `paymentMethod = 'pix'` via `useEffect`. Isso:
- Permite que `handleSubmit` rode sem o cliente clicar em nada.
- Mantém o cálculo do desconto PIX da InfinitePay (se configurado em `integration_infinitepay.pix_discount_percent`) sendo aplicado no resumo.
- A InfinitePay ignora esse valor e mostra todas as formas de pagamento dela (PIX, Cartão, Boleto) na própria tela.

### Backend

Sem alterações. A edge function `create-infinitepay-payment` já funciona com qualquer `payment_method` recebido — ela só monta o link e a InfinitePay cuida da seleção real.

## Resultado visual

- **Tenant com InfinitePay ativa**: o quadro azul "Forma de Pagamento" desaparece completamente. O cliente vê: Itens → Frete → Cupom → Resumo → botão Finalizar.
- **Tenant com MP / Pagar.me / Appmax**: nada muda — o quadro continua sendo exibido normalmente.