

## Plano: Desconto PIX configurável para todas as integrações de pagamento

### Visão Geral
Adicionar um campo configurável de desconto PIX em cada integração de pagamento (Mercado Pago, Pagar.me, App Max), um seletor de forma de pagamento (PIX ou Cartão) no checkout público, e aplicar o desconto automaticamente sobre o subtotal dos produtos quando PIX for selecionado.

### 1. Banco de Dados — Adicionar coluna `pix_discount_percent`

Criar migration para adicionar o campo nas 3 tabelas de integração:

```sql
ALTER TABLE integration_pagarme ADD COLUMN pix_discount_percent numeric DEFAULT 0;
ALTER TABLE integration_mp ADD COLUMN pix_discount_percent numeric DEFAULT 0;
ALTER TABLE integration_appmax ADD COLUMN pix_discount_percent numeric DEFAULT 0;
```

Também atualizar a trigger `validate_order_total_on_payment` para reconhecer a tag `[PIX_DISCOUNT]` nas observações e não corrigir indevidamente o total quando houver desconto PIX.

### 2. Telas de Integração — Campo de configuração

Adicionar input numérico "Desconto PIX (%)" nos 3 componentes:
- `PagarMeIntegration.tsx` — campo `pix_discount_percent`
- `PaymentIntegrations.tsx` (Mercado Pago) — campo `pix_discount_percent`
- `AppmaxIntegration.tsx` — campo `pix_discount_percent`

Cada um salva/carrega o valor da respectiva tabela.

### 3. Checkout Público (`PublicCheckout.tsx`)

**Buscar config de desconto PIX**: Ao carregar o tenant, consultar as 3 tabelas de integração ativas para obter o `pix_discount_percent` configurado (usa a mesma lógica de prioridade: AppMax > Pagar.me > MP).

**Seletor de forma de pagamento**: Após as opções de frete e antes do resumo, exibir um radio group com:
- PIX (com badge mostrando "X% OFF" se configurado)
- Cartão de Crédito

**Cálculo do desconto**: Quando PIX for selecionado, aplicar `pix_discount_percent` sobre o subtotal dos produtos (excluindo frete e cupom). Exibir o valor original riscado e o valor com desconto.

**Enviar ao backend**: Incluir `payment_method` e `pix_discount` no payload enviado ao `create-payment`.

### 4. Edge Function `create-payment`

- Receber `payment_method` e `pix_discount` no payload
- Recalcular total: `productsTotal - pixDiscount - couponDiscount + shippingCost`
- Adicionar tag `[PIX_DISCOUNT] R$ X.XX` na observação do pedido
- Passar o total correto para o gateway de pagamento

### 5. Trigger `validate_order_total_on_payment`

Atualizar para extrair `[PIX_DISCOUNT]` da observação via regex, subtraindo do total esperado para evitar "correções" indevidas.

### Resumo de arquivos afetados

| Arquivo | Alteração |
|---|---|
| Migration SQL | Adicionar `pix_discount_percent` em 3 tabelas + atualizar trigger |
| `PagarMeIntegration.tsx` | Campo de config desconto PIX |
| `PaymentIntegrations.tsx` | Campo de config desconto PIX |
| `AppmaxIntegration.tsx` | Campo de config desconto PIX |
| `PublicCheckout.tsx` | Seletor PIX/Cartão + cálculo desconto + UI |
| `create-payment/index.ts` | Receber/processar desconto PIX |

