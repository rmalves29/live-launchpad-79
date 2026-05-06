## Objetivo

Replicar a **identidade visual da página `/landing`** (fundo deep navy `#020c1b`, acentos cyan/sky, glow rings, tipografia bold tracking-tight) em todo o sistema, sem alterar a estrutura das páginas (Pedidos, Produtos, Clientes, Navbar, tabelas, formulários permanecem como estão). O escuro vira o tema padrão e o usuário pode alternar para claro.

## Paleta-alvo (extraída da landing)

| Token | Escuro (padrão) | Claro (toggle) |
|---|---|---|
| `--background` | `#020c1b` (deep navy) | branco atual |
| `--foreground` | branco | navy atual |
| `--card` | `rgba(255,255,255,0.02)` sobre navy | branco atual |
| `--border` | `rgba(255,255,255,0.05)` | atual |
| `--primary` (CTAs) | sky-500 `#0ea5e9` | sky-500 |
| `--accent` (gradiente) | cyan-400 `#22d3ee` → blue-400 | atual |
| `--muted-foreground` | gray-400 `#9ca3af` | atual |

Glow ambiente (radial blur sky-500/8, cyan-500/5) aplicado uma vez no body em modo escuro.

## Mudanças

### 1. `src/index.css` — redefinir tokens

- Reescrever bloco `:root` (claro) e `.dark` (escuro) com as cores acima.
- Tornar `.dark` o tema **padrão** adicionando a classe no `<html>` via `index.html` ou `main.tsx`.
- Acrescentar gradiente de fundo global no `body.dark` (radial sky/cyan blurs fixos, pointer-events none).
- Atualizar `.glass-card`, `.btn-gradient-primary`, `.glow-primary`, `.text-gradient-primary` para usar a nova paleta sky/cyan no escuro.
- Headings continuam Space Grotesk; aumentar `tracking-tight` global em h1/h2.

### 2. Tema padrão escuro + toggle

- `index.html`: adicionar `class="dark"` em `<html>`.
- Criar `src/components/ThemeToggle.tsx` (Sun/Moon, persistência em `localStorage`).
- Inserir o `ThemeToggle` na Navbar, ao lado do `TenantSwitcher` (`src/components/Navbar.tsx`, área "Right side - User & Tenant").
- Pequeno script inline no `index.html` que lê `localStorage.theme` antes do React montar (evita flash claro).

### 3. Ajustes pontuais de Navbar

- Trocar `bg-card/90` por classes que respondem ao tema (já respondem via tokens — só validar contraste).
- Botão "Entrar" passa a usar `bg-sky-500 hover:bg-sky-400` para casar com a landing.
- Logo OrderZap mantém o layout atual (sem mexer no chip já editado).

### 4. Ajustes globais leves

- `src/App.css`: remover `max-width: 1280px` do `#root` que conflita com fundo escuro (regra antiga do template Vite).
- Verificar componentes shadcn (`Button`, `Card`, `Input`) — todos já consomem tokens CSS, então herdarão o tema automaticamente.
- Páginas internas: **não alterar JSX**. A mudança nos tokens propaga para todas.

### 5. Exclusões (não mudam)

- `/landing` continua com seu CSS hard-coded próprio (`bg-[#020c1b]`).
- Storefront público (`/t/:slug`) — não afetado, já tem tema próprio.
- Checkout público — mantém aparência atual para não quebrar conversão.
- PrivacyPolicy/TermsOfUse — checar e manter em claro se for melhor para leitura (decisão durante implementação).

## Arquivos editados

```
src/index.css                        (paleta + utilitários)
src/App.css                          (remover max-width legado)
index.html                           (class="dark" + script anti-flash)
src/components/Navbar.tsx            (ThemeToggle + cor do botão Entrar)
src/components/ThemeToggle.tsx       (novo)
```

## Riscos

- Componentes que usam cores hard-coded (`bg-white`, `text-black`, `bg-gray-50`) ao invés de tokens vão "vazar" no escuro. Vou rodar `rg "bg-white|text-black|bg-gray-[0-9]"` em `src/` durante a implementação e converter para tokens (`bg-background`, `text-foreground`, `bg-muted`).
- Modais/Dialogs do Radix já usam tokens — devem ficar ok.

## Resultado esperado

Sistema inteiro com a estética da landing (fundo navy profundo, cards sutis com borda cyan, botões sky com glow), mantendo todos os fluxos e funcionalidades. Toggle no canto superior direito permite voltar ao tema claro a qualquer momento.