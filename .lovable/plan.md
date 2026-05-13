# Página de teste do novo design

Criar uma rota isolada `/design-preview` para você visualizar exatamente como o sistema ficaria com o layout dos dois mockups que você enviou (Pedidos + Pedido Manual), **sem alterar nada do sistema atual**.

## O que será criado

1. **Nova rota `/design-preview`** em `src/App.tsx`
   - Protegida por `RequireAuth` (só você logado vê)
   - Sem Navbar atual (mostra a sidebar nova do mockup)

2. **Página `src/pages/design-preview/Index.tsx`**
   - Toggle no topo para alternar entre as duas telas: **"Pedidos"** e **"Pedido Manual"**
   - Botão "Abrir modal de edição" para ver o modal de pedido também
   - Dados 100% mockados (hardcoded) — nenhuma chamada ao banco

3. **Componentes locais de preview** (isolados em `src/pages/design-preview/_components/`)
   - `PreviewSidebar.tsx` — sidebar lateral igual ao mockup (logo OrderZap, menu, badge "PRO")
   - `PedidosPreview.tsx` — tela de listagem de pedidos (cards de stats, filtros, tabela)
   - `ManualPreview.tsx` — tela de pedido manual (busca cliente, carrinho, totais)
   - `EditOrderModalPreview.tsx` — modal de edição

## O que NÃO será alterado

- Nenhuma página existente (Pedidos, Manual, Config, etc.)
- `index.css`, `tailwind.config.ts`, Navbar atual
- Hooks, queries, edge functions, RLS
- Tema (continua light/dark como está)

## Estilo

Pixel-a-pixel fiel aos mockups: cores hex diretas (`#4f46e5` indigo, `#dcfce7`/`#16a34a` verde status, `#f9fafb` bg, etc.) usadas localmente apenas nesses componentes de preview, sem tocar no design system global.

## Como você verá

Após implementar, basta acessar `/design-preview` no navegador. Se aprovar, eu faço a refatoração global usando esse padrão.