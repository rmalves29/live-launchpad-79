

## Plano: Tornar nome opcional no cadastro de clientes

### Alterações em `src/pages/clientes/Index.tsx`

1. **Linha 240**: Remover `!newCustomer.name` da validação, deixando apenas `!newCustomer.phone` como obrigatório.
2. **Linha 243**: Atualizar mensagem de erro para "Informe o telefone".
3. **Linha 996**: Alterar placeholder de `"Nome completo (obrigatório)"` para `"Nome completo (opcional)"`.

Nenhuma alteração no checkout — o nome continua obrigatório lá.

