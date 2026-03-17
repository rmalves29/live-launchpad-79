

# Adicionar botão de excluir empresa na página Empresas

## Resumo
Adicionar um botão de exclusão (Trash2) ao lado dos botões de editar e bloquear na tabela de empresas, com diálogo de confirmação para evitar exclusões acidentais.

## Alterações em `src/pages/empresas/Index.tsx`

1. **Importar `useConfirmDialog`** e adicionar o hook no componente
2. **Criar função `handleDeleteTenant`** que:
   - Exibe diálogo de confirmação com nome da empresa
   - Deleta `tenant_credentials` do tenant (FK)
   - Deleta `profiles` associados ao tenant
   - Deleta o tenant
   - Limpa `localStorage` se era o tenant preview ativo
   - Recarrega a lista
3. **Adicionar botão Trash2** na coluna de ações, entre o botão de editar e o de bloquear
4. **Renderizar `{confirmDialogElement}`** no JSX

O fluxo é idêntico ao que já existe no `TenantsManager.tsx`, adaptado para o layout de tabela da página `/empresas`.

