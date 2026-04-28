# Enviar endereço para a InfinitePay

## Situação atual

A função `create-infinitepay-payment` **já está montando** um objeto `address` e anexando ao payload enviado para `https://api.checkout.infinitepay.io/links`:

```ts
infBody.address = {
  zip_code, street, number, complement, district, city, state
}
```

Porém, a documentação oficial da InfinitePay (Checkout via link) **não lista o campo `address` como aceito** no endpoint `/links`. Os campos suportados são apenas:
- `handle`, `redirect_url`, `webhook_url`, `order_nsu`
- `customer` (name, email, phone_number)
- `items` (description, quantity, price)

A página de checkout da InfinitePay coleta o endereço diretamente do cliente final (CEP, rua, número, etc.), por isso o campo enviado pela API hoje é simplesmente **ignorado** pelo servidor deles.

## O que pode ser feito

### Opção A — Pré-preencher via query string (recomendada)
A InfinitePay aceita parâmetros na URL final do checkout para pré-preencher dados do cliente. Vou:

1. Após receber `checkoutUrl` da API, anexar parâmetros como:
   - `?customer_name=...&customer_email=...&customer_phone=...`
   - `&address_zip_code=...&address_street=...&address_number=...&address_complement=...&address_district=...&address_city=...&address_state=...`
2. Combinar com os parâmetros já existentes (lock de método de pagamento PIX/cartão).
3. Garantir URL-encoding correto de cada valor.

Resultado: o cliente cai no checkout da InfinitePay com **todos os campos de endereço já preenchidos**, só precisando confirmar e pagar.

### Opção B — Manter envio no body (status quo)
Manter o `address` no body para o caso da InfinitePay passar a aceitar oficialmente esse campo no futuro. Já está implementado, sem custo adicional.

## Plano de implementação

1. Manter o `infBody.address` atual (não atrapalha — é ignorado).
2. Criar função utilitária `appendAddressToCheckoutUrl(url, customer, address)` que:
   - Faz parse da URL retornada pela API
   - Adiciona parâmetros `customer_*` e `address_*` via `URLSearchParams`
   - Preserva parâmetros existentes (PIX/cartão lock)
3. Integrar essa função no fluxo, **antes** do `buildLockedCheckoutUrl`, ou ajustar `buildLockedCheckoutUrl` para receber esses extras.
4. Redeploy da função `create-infinitepay-payment`.
5. Teste no checkout da La Grandame: valor ≥ R$ 1,00, conferir que ao chegar na página da InfinitePay os campos de endereço já vêm preenchidos.

## Observação importante

A InfinitePay **não documenta publicamente** todos os parâmetros de query string aceitos na página de checkout. Os mais comuns (`customer_name`, `customer_email`, `customer_phone`) são amplamente usados, mas os de endereço podem não funcionar 100%. Se após o deploy alguns campos não preencherem, posso ajustar os nomes dos parâmetros conforme o comportamento observado, ou abrir um chamado com o suporte da InfinitePay para confirmar a nomenclatura oficial.

**Posso prosseguir com a implementação?**