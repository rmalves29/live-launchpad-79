## Aplicar paleta Cartzy

A ideia é trocar a paleta atual (cyan-teal + violeta) pela nova paleta Cartzy (navy + cyan brilhante + azul elétrico) **somente nos tokens globais do design system** — sem precisar mexer em cada componente. Como todo o app usa `hsl(var(--primary))`, `bg-card`, `text-foreground`, etc., a mudança propaga automaticamente.

Isso permite você avaliar e, se não gostar, reverter em 1 mensagem.

### O que muda

**1. `src/index.css` — tokens HSL (modo claro e escuro)**

Conversão da paleta para HSL:
- `#0A1628` Navy → `217 60% 10%`
- `#00D9FF` Cyan Bright → `189 100% 50%`
- `#0099FF` Electric Blue → `204 100% 50%`
- `#1A2332` Dark Gray → `217 32% 15%`
- `#F5F7FA` Light Gray → `216 25% 97%`
- `#6B7280` Medium Gray → `220 9% 46%`

Modo claro (`:root`):
- `--background`: Light Gray `216 25% 97%`
- `--foreground`: Navy `217 60% 10%`
- `--primary`: Cyan Bright `189 100% 50%` (CTAs)
- `--accent`: Electric Blue `204 100% 50%` (hover/destaque secundário)
- `--secondary`: tom claro derivado do azul
- `--ring`: Cyan Bright
- Sidebar: fundo Navy `217 60% 10%` com texto branco e accent Cyan (segue a recomendação "Header/Navbar fundo Navy")

Modo escuro (`.dark`):
- `--background`: Navy `217 60% 10%`
- `--card`: Dark Gray `217 32% 15%`
- `--foreground`: branco
- `--primary`: Cyan Bright
- `--accent`: Electric Blue
- `--muted-foreground`: Medium Gray

**2. Gradientes e classes utilitárias** (mesmo arquivo)

Atualizar:
- `.btn-gradient-primary` → `linear-gradient(90deg, #00D9FF 0%, #0099FF 100%)` com `box-shadow: 0 4px 12px rgba(0,217,255,.3)` no estado normal e `.5` no hover (exatamente como na sua spec).
- `.btn-gradient-accent` → gradiente com glow `linear-gradient(135deg, #00D9FF 0%, #0066FF 50%, #0099FF 100%)`.
- `.glow-primary` / `.glow-accent` → sombra cyan ao invés de teal/violeta.
- `.text-gradient-primary` / `.text-gradient-mixed` → mesmas cores Cartzy.
- `.glass-card` no modo escuro → base Navy/Dark Gray.
- `@keyframes glowPulse` → glow cyan.

**3. `tailwind.config.ts` — sombras `glow-*`**

Já usam `hsl(var(--primary))`, então herdam automaticamente o cyan novo. Sem alteração necessária.

### O que NÃO muda
- Nenhum componente `.tsx` é tocado.
- Cores de status (`success`, `warning`, `destructive`, `info`) ficam como estão — verde/amarelo/vermelho continuam fazendo sentido para feedback.
- Tipografia (Inter + Space Grotesk) mantida.
- Layout, espaçamentos, animações: idênticos.

### Como reverter
Se você não gostar, basta pedir "voltar paleta antiga" — restauro o `index.css` em uma única edição.

### Áreas onde você verá impacto imediato
- Botões primários (login, salvar, CTAs) → gradiente cyan→azul
- Sidebar/Navbar → fundo navy com links cyan no hover
- Cards e bordas → tom mais frio, azulado
- Modo escuro → fundo navy profundo (em vez do azul-acinzentado atual)
- Tela de Auth (onde você está agora) → primeiro lugar onde verá a mudança

Posso aplicar?
