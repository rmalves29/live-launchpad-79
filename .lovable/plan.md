## Objetivo

Reestilizar a página **Configurações** (`src/pages/config/Index.tsx`) seguindo o mockup enviado, mantendo **100% das funcionalidades** atuais e **sem alterar a barra lateral** (`AppSidebar`).

## Escopo (somente visual)

Alterações ficam restritas ao arquivo `src/pages/config/Index.tsx` — apenas o wrapper da página e a barra de abas. Os componentes internos de cada aba (`CompanySettings`, `ShippingOptionsManager`, `WhatsAppGroupsManager`, `CouponsManager`, `GiftsManager`, `PrinterSettings`, `TenantsManager`, `TenantSimulator`, `IntegrationsChecklist`, `WhatsAppSettings`, `MelhorEnvioStatus`, `AvailabilitySettings`) **não serão modificados** — assim nada de funcional quebra.

## Mudanças visuais (espelhando o mockup)

1. **Fundo da página**: branco / cinza muito claro (`bg-white`), sem o `container mx-auto px-4 py-8` antigo.
2. **Cabeçalho**:
   - Título "Configurações do Sistema" 24px bold + ícone Settings indigo.
   - Subtítulo cinza menor logo abaixo.
   - Padding `28px 32px 0`.
3. **Barra de abas** (substitui a `TabsList` em grid):
   - Layout horizontal com `border-b` cinza claro.
   - Cada aba: padding `10px 18px`, fonte 13px, ícone à esquerda.
   - Aba ativa: texto `text-[#4f46e5]` + `border-b-2 border-[#4f46e5]`.
   - Hover: cor indigo no texto.
   - Mantém ordem atual: Configurações (super admin), Empresa, Frete, Grupos, Cupons, Brindes, Impressora, Empresas (super admin).
   - Scroll horizontal no mobile (`overflow-x-auto`).
4. **Conteúdo** (`TabsContent`): padding `24px 32px`, espaçamento `space-y-5`. Cards internos continuam renderizando normalmente.
5. **Cards de "configurações do evento" / "status das integrações"** (aba "Configurações"): apenas refino visual — bordas `#e2e8f0`, radius `10px`, padding 20px. Estrutura e dados permanecem idênticos.

## Funcionalidades preservadas

- `Tabs` do shadcn continua orquestrando o estado (mantém `defaultValue` e `searchParams.get('tab')`).
- Lógica de `isMaster` (super admin) para mostrar abas "Configurações" e "Empresas".
- `loadSettings()`, `useEffect`, integrações com Supabase, toasts, loading e fallback de "Acesso Negado" — sem alteração.
- Todos os sub-componentes recebem as mesmas props (nenhuma).
- `AppSidebar` e `AppShell` ficam **intocados**.

## Detalhes técnicos

- Implementação usando os componentes shadcn `Tabs / TabsList / TabsTrigger / TabsContent` com `className` customizado para reproduzir o visual de border-bottom (em vez do grid pill atual).
- Utilizando classes Tailwind diretas com tokens hex do mockup (mesmo padrão já adotado em `etiquetas/Index.tsx` e `TenantIntegrationsPage.tsx` aprovados anteriormente).
- Sem alterações em `index.css`, `tailwind.config.ts`, rotas, ou dependências.

## Riscos

- Mínimos. É um restyle isolado de 1 arquivo. Os filhos das abas continuam idênticos, então nada de funcional quebra.
