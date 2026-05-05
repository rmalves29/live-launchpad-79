## Ajustar cores do sistema para combinar com a logo Cartzy

A logo enviada usa **navy escuro como cor dominante** das letras, com **cyan brilhante apenas como glow/contorno** e fundo branco. Hoje o sistema está com a lógica invertida: o cyan vibrante virou fundo principal (`--background: 189 100% 50%`), o que cansa a vista e não reflete a hierarquia da marca.

A proposta é **reorganizar os tokens** em `src/index.css` para que o sistema espelhe a logo: base clara/neutra, navy como cor de texto e estrutura, cyan e azul elétrico apenas como destaque (botões, links, glows).

### Mudanças no modo claro (`:root`)

| Token | Hoje | Novo | Equivalente |
|---|---|---|---|
| `--background` | `189 100% 50%` (cyan puro) | `0 0% 100%` | Branco puro (fundo da logo) |
| `--foreground` | `189 100% 50%` (cyan) | `217 60% 10%` | Navy `#0A1628` (cor das letras) |
| `--primary` | `217 60% 10%` (navy) | `189 100% 50%` | Cyan `#00D9FF` (CTAs/botões) |
| `--primary-foreground` | `189 100% 50%` | `217 60% 10%` | Navy sobre cyan |
| `--accent` | `204 100% 50%` | `204 100% 50%` | Electric Blue (mantém) |
| `--secondary` | `200 60% 95%` | `216 25% 97%` | Light Gray `#F5F7FA` |
| `--muted` | `216 20% 93%` | `216 20% 95%` | Cinza muito sutil |
| `--border` | `216 20% 88%` | `216 20% 90%` | Borda mais clara |
| `--ring` | `217 60% 10%` | `189 100% 50%` | Foco cyan |
| `--card` | `0 0% 100%` | `0 0% 100%` | Branco (mantém) |
| `--card-foreground` | `217 32% 15%` | `217 60% 10%` | Navy puro |

### Sidebar (alinhada à logo)
A sidebar volta a ter **fundo navy** com textos brancos e accent cyan — exatamente como a logo (letras navy "destacadas" pelo cyan):

| Token | Novo |
|---|---|
| `--sidebar-background` | `217 60% 10%` (Navy) |
| `--sidebar-foreground` | `0 0% 100%` (branco) |
| `--sidebar-primary` | `189 100% 50%` (Cyan) |
| `--sidebar-primary-foreground` | `217 60% 10%` (Navy) |
| `--sidebar-accent` | `217 32% 18%` |
| `--sidebar-accent-foreground` | `189 100% 70%` |

### Modo escuro (`.dark`)

| Token | Novo | Equivalente |
|---|---|---|
| `--background` | `217 60% 10%` | Navy `#0A1628` (fundo dark) |
| `--foreground` | `0 0% 100%` | Branco |
| `--card` | `217 32% 15%` | Dark Gray `#1A2332` |
| `--primary` | `189 100% 50%` | Cyan (CTAs continuam vibrantes) |
| `--primary-foreground` | `217 60% 10%` | Navy sobre cyan |
| `--ring` | `189 100% 50%` | Foco cyan |

### Gradientes e utilidades

Ajustes para refletir a hierarquia **navy → cyan** (igual ao fluxo visual da logo, das letras escuras para o glow):

- `.btn-gradient-primary`: `linear-gradient(90deg, #00D9FF 0%, #0099FF 50%, #0A1628 100%)` — começa cyan vibrante e finaliza no navy (inversão do atual, que começa navy).
- `.btn-gradient-accent`: mantém `cyan → electric blue → deep blue` (já está bom).
- `.text-gradient-primary`: `navy → electric blue` (mantém).
- `.text-gradient-mixed`: `cyan → electric blue → navy` para títulos hero.
- `.glow-primary` / `.glow-accent`: mantêm glow cyan/azul.
- `.glass-card` (modo claro): trocar o tint cyan saturado por um tint mais sutil (`hsl(189 100% 97%)` no lugar de `hsl(189 100% 95%)`) para não competir com os botões.
- `.bg-grid`: já usa azul elétrico com baixa opacidade — mantém.

### O que NÃO muda
- Tipografia (Inter + Space Grotesk).
- Cores de status (`success`, `warning`, `destructive`, `info`).
- Layout, espaçamentos, animações, componentes `.tsx`.
- `tailwind.config.ts` (todos os tokens já são derivados via `hsl(var(--*))`).

### Resultado visual esperado
- **Tela de login / dashboard**: fundo branco/cinza claro, textos navy, botões cyan vibrante com glow — exatamente o "feeling" da logo sobre fundo branco.
- **Sidebar**: navy escuro com itens ativos em cyan — reproduz o contraste navy+cyan da logo.
- **Modo escuro**: fundo navy profundo, cyan como destaque — versão "noturna" da mesma identidade.

### Como reverter
Basta pedir "voltar paleta cyan invertida" — restauro `index.css` em uma única edição.

Posso aplicar?
