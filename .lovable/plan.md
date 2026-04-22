

## Padronizar `{{valor_promo}}` em todas as empresas

### Mudança

Aplicar a regra **"sem preço promocional → remove a linha inteira"** quando `{{valor_promo}}` estiver sozinho na linha.

A função `applyPromotionalPriceFallback` em `supabase/functions/sendflow-process/index.ts` é **global** (roda para todos os tenants), então a correção vale automaticamente para todas as empresas — não há regra por tenant.

### Comportamento final

| Cenário | Resultado |
|---|---|
| Produto COM promo, `{{valor_promo}}` sozinho | Mostra preço promocional |
| Produto COM promo, `{{valor_promo}}` junto com `{{valor}}` | Mostra ambos preços |
| Produto SEM promo, `{{valor_promo}}` sozinho | **Linha removida** ✅ (novo) |
| Produto SEM promo, `{{valor_promo}}` junto com `{{valor}}` | Remove só o trecho promo, mantém preço base |

### Arquivo alterado

`supabase/functions/sendflow-process/index.ts` — função `applyPromotionalPriceFallback`:

- Quando `{{valor_promo}}` está sozinho na linha e o produto não tem promo, retornar `null` em vez de substituir pelo preço base
- Ajustar o `.filter()` para descartar linhas marcadas como `null`

Sem alterações de banco, sem alterações no frontend. Deploy automático da edge function ao salvar.

### Validação após deploy

Testar com um produto sem `promotional_price` em qualquer empresa usando um template que contenha `{{valor_promo}}` em linha própria — a linha deve sumir da mensagem enviada ao grupo.

