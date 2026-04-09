

# Plano: Corrigir redirecionamento pós-pagamento (404)

## Problema identificado
Após o cliente finalizar o pagamento, o gateway (Pagar.me, Appmax ou Mercado Pago) redireciona o cliente de volta ao sistema, mas ele cai em uma página 404. Isso acontece porque:

1. **Pagar.me**: A `success_url` aponta para `/mp/return?status=success`, mas não há URLs de falha/pendente configuradas
2. **Appmax**: Não tem **nenhuma** URL de retorno configurada — após pagar, o checkout do Appmax não sabe para onde redirecionar o cliente
3. **Variável PUBLIC_APP_URL**: Pode não estar configurada na edge function, fazendo o redirect apontar para `app.orderzaps.com` enquanto o cliente está no `live-launchpad-79.lovable.app`

## Solução

### 1. Criar página dedicada de retorno de pagamento
Renomear e melhorar a página `/mp/return` para ser uma página genérica de retorno de pagamento que funcione para todos os provedores (MP, Pagar.me, Appmax).

- Criar rota `/pagamento/retorno` (mais intuitiva)
- Manter `/mp/return` como redirect para compatibilidade
- A página exibirá status do pagamento (sucesso/pendente/falha) com visual claro
- Incluirá botão "Voltar ao catálogo da loja" com link dinâmico baseado no tenant

### 2. Configurar URLs de retorno em todos os provedores

**Pagar.me** (edge function `create-payment`):
- Adicionar `success_url` apontando para `/pagamento/retorno?status=success&tenant={slug}`

**Appmax** (edge function `create-payment`):
- Passar o slug do tenant no body do checkout
- Incluir URL de retorno no pedido Appmax (campo `url_callback` ou similar)

**Mercado Pago**:
- Já tem `back_urls` configurados — apenas ajustar para incluir o slug do tenant

### 3. Incluir slug do tenant nas URLs de retorno
Para que a página de retorno saiba para qual loja redirecionar o cliente, todas as URLs terão o parâmetro `&tenant={slug}`.

### 4. Garantir que PUBLIC_APP_URL esteja correto
Verificar se a variável de ambiente `PUBLIC_APP_URL` está definida nas edge functions. Se não, usar o origin da requisição como fallback dinâmico.

## Alterações técnicas

| Arquivo | O que muda |
|---|---|
| `src/pages/pagamento/Retorno.tsx` | Nova página de retorno de pagamento universal |
| `src/App.tsx` | Adicionar rota `/pagamento/retorno` e redirect de `/mp/return` |
| `supabase/functions/create-payment/index.ts` | Corrigir `success_url` do Pagar.me, adicionar `back_urls` dinâmicos com tenant slug, usar origin da requisição como fallback |
| `src/pages/callbacks/MpReturn.tsx` | Redirecionar para a nova rota |

## Resultado esperado
Após o pagamento, o cliente verá uma página amigável com:
- Confirmação visual do status (aprovado/pendente/falha)
- Botão para voltar ao catálogo da loja
- Informações do pedido quando disponível

