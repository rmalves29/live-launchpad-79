# Adicionar atalhos de monitoramento no menu Config

Converter o item "Config" do navbar em um dropdown com 3 opções (visíveis apenas para `super_admin`, exceto a primeira):

1. **Configurações** → navega para `/config` (todos os usuários)
2. **Métricas Supabase** → abre painel oficial em nova aba (super_admin)
3. **Cloud Lovable** → abre dashboard do projeto em nova aba (super_admin)

## Mudanças técnicas

**Arquivo único:** `src/components/Navbar.tsx`

- Remover `{ path: '/config', label: 'Config' }` do array `navItems`.
- Adicionar `isConfigActive = location.pathname.startsWith('/config')`.
- Adicionar novo `DropdownMenu` "Config" ao lado do dropdown de WhatsApp na nav desktop, seguindo exatamente o mesmo padrão visual:
  - Item "Configurações" sempre visível
  - Itens "Métricas Supabase" e "Cloud Lovable" apenas se `isSuperAdmin`, com ícone `ExternalLink` e `window.open(url, '_blank', 'noopener,noreferrer')`
- No menu mobile (Sheet), adicionar uma seção "Config" com a mesma lógica de visibilidade, seguindo o padrão da seção WhatsApp atual.

**URLs alvo:**
- Supabase: `https://supabase.com/dashboard/project/<PROJECT_REF>/reports/database`
- Lovable Cloud: `https://lovable.dev/projects/154035f9-093b-4aed-ac82-a01434f3c19b`

O `PROJECT_REF` do Supabase será extraído de `src/integrations/supabase/client.ts` (campo `SUPABASE_URL`) durante a implementação.

Nenhuma outra rota, função ou tabela é afetada.
