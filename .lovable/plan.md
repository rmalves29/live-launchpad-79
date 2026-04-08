

# Plano: Preço Promocional + Campo Observação nos Produtos

## O que será feito
1. Adicionar dois novos campos na tabela `products`: `promotional_price` (preço promocional) e `observation` (observação)
2. Atualizar o formulário de produtos para editar esses campos
3. Atualizar o SendFlow para suportar as variáveis `{{valor_original}}`, `{{valor_promo}}` e `{{observacao}}` nas mensagens

## Alterações

### 1. Migration — adicionar colunas na tabela `products`
```sql
ALTER TABLE products ADD COLUMN promotional_price numeric DEFAULT NULL;
ALTER TABLE products ADD COLUMN observation text DEFAULT NULL;
```

### 2. `src/components/tenant/TenantProducts.tsx`
- Adicionar campos no formulário: "Preço Promocional" (opcional, abaixo do preço) e "Observação" (textarea, abaixo do grid de preço/estoque)
- Exibir preço promocional na listagem quando existir (ex: "~~R$100~~ R$79,90")
- Incluir `promotional_price` e `observation` no `saveProduct`

### 3. `supabase/functions/sendflow-process/index.ts`
- Adicionar `promotional_price` e `observation` à interface `Product` e à query de busca
- Na função `personalizeMessage`:
  - `{{valor_original}}` → preço original formatado
  - `{{valor_promo}}` → preço promocional (se existir)
  - `{{valor}}` → mostra promo se existir, senão normal
  - `{{observacao}}` → texto da observação (remove a linha se vazio, como cor/tamanho)
- Linhas com `{{valor_promo}}`, `{{valor_original}}` ou `{{observacao}}` são removidas quando o campo estiver vazio

### 4. UI do SendFlow — documentar variáveis
- Atualizar a lista de variáveis disponíveis na página de envio para incluir `{{valor_original}}`, `{{valor_promo}}` e `{{observacao}}`

## Exemplo de template
```
👜 *{{nome}}* ({{codigo}})
🎨 Cor: {{cor}}
💰 ~De {{valor_original}}~ por *{{valor_promo}}*
📝 {{observacao}}
📱 Código: *{{codigo}}*
```

## Detalhes técnicos
- Produtos sem preço promocional ou observação continuam funcionando normalmente (linhas removidas automaticamente)
- Nenhuma breaking change
- 1 migration + 2 arquivos editados + 1 edge function atualizada

