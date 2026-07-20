## Landing page de venda — Fluxo de Envio (SendFlow OrderZap)

Nova página pública `/fluxo-envio` (rota isolada, sem login), inspirada na estrutura narrativa da landing do Cartzy, mas com foco 100% no módulo **Fluxo de Envio**. Reaproveita a paleta atual do projeto (Deep Navy `#020c1b`, Sky `#0EA5E9`, Cyan `#22D3EE`, Indigo `#6366F1`) e o `FuturisticFX`. Nenhuma outra área do sistema é alterada.

---

### 1. Rota e navegação

- Novo arquivo `src/pages/LandingFluxoEnvio.tsx`.
- Rota pública `/fluxo-envio` em `src/App.tsx` (fora do `RequireAuth`).
- CTAs apontam para `/auth?plan=fluxo-envio` e para o WhatsApp comercial já usado na landing atual.
- **Nada** na landing principal do Cartzy é alterado.

### 2. Mensagem central (hero)

> **"Escale seus grupos de WhatsApp sem tomar bloqueio — envie campanhas para milhares de contatos ao mesmo tempo, com ritmo humano e proteção anti-ban."**

Subheadline reforça: sem custo por mensagem, sem API oficial da Meta, com suporte humano.

### 3. Estrutura de seções (espelhando a Cartzy)

1. **Navbar fixa** (dark blur) + CTA "Quero testar"
2. **Hero** — headline + subheadline + 2 CTAs + mockup do painel Fluxo de Envio + `FuturisticFX`
3. **Barra de números** (CountUp): grupos gerenciados, mensagens enviadas/dia, taxa anti-ban, uptime
4. **Marquee de integrações** — WhatsApp, Instagram, Bling, MP, Pagar.me, Correios, Melhor Envio etc.
5. **Dores** (voz do usuário) — 6 cards:
   - "Meu número foi banido no meio do lançamento"
   - "Envio manual em 30 grupos leva minhas 3 horas da noite"
   - "Não sei quais grupos deram mais retorno"
   - "As pessoas saem do grupo e eu nem fico sabendo"
   - "Membros bloqueados voltam entrando na minha lista"
   - "Meu concorrente dispara 10x mais rápido que eu"
6. **Gambiarras já tentadas** — 6 cards:
   - Enviar mensagem uma por uma no WhatsApp Web
   - CRMs genéricos cheios de botão
   - Contratar estagiário pra copiar/colar
   - Ferramenta gringa sem suporte em português
   - Bot pirata que travou e queimou 3 chips
   - Planilha de controle manual dos grupos
7. **Como funciona** — 5 passos: conectar WhatsApp → importar grupos → montar campanha com mídia → agendar disparo com ritmo humano → acompanhar relatório em tempo real
8. **Features** (9 cards com ícones):
   - Disparo em massa com ritmo humano
   - Agendamento de campanhas
   - Fluxo de Retorno (traz de volta quem saiu) — feature diferencial
   - Bloqueio de clientes indesejados
   - Distribuição ponderada entre grupos
   - Fast-path de redirecionamento (link entra direto no grupo)
   - Relatórios de entrada/saída em tempo real
   - Mensagens variadas (anti-bloqueio)
   - Suporte humano no WhatsApp
9. **Antes × Depois** — 6 linhas de comparação
10. **Transformação** — 3 cards (dono do lançamento antes/depois)
11. **Depoimentos** — 3 cards (nomes/nichos plausíveis: infoproduto, e-commerce, revenda live)
12. **Benefícios em números** — 4 blocos com CountUp
13. **FAQ** (8 perguntas) — bloqueio, Meta oficial, suporte, contrato, quantidade de grupos, integração, migração, teste grátis
14. **CTA final** com glow + link WhatsApp
15. **Footer** com links legais existentes

### 4. Design system

- **Paleta reutilizada 100%** dos tokens já definidos em `index.css` — sem cores novas.
- Fundo global escuro `bg-[#020c1b]` com `FuturisticFX` no hero e efeitos `lp-*` (aurora, scan, shimmer, marquee, reveal, glow) reaproveitados do arquivo de FX da Cartzy — colados como `<style>` inline, sem tocar em `index.css`.
- Tipografia: Space Grotesk (títulos) + Inter (corpo), já carregadas.
- Ícones: `lucide-react` (Send, Users, Shield, Zap, BarChart3, Clock, MessageSquare, Repeat, AlertCircle, Moon, Heart, Bot, etc.).
- Reveal on scroll, CountUp, marquee, `lp-frame` (borda cônica girando) — todos componentes internos do próprio arquivo, sem novas libs.

### 5. Mockup do painel

Screenshot atual da tela `/sendflow` capturado via Playwright e salvo em `src/assets/fluxo-envio-mockup.png` para uso no hero (moldura com `lp-frame` + glow).

### 6. SEO

- `<title>` e `<meta description>` específicos setados via `usePageTitle` já existente.
- H1 único; hierarquia H2/H3 semântica; alt em todas as imagens.
- Rota adicionada como opção futura de link no footer da landing Cartzy (comentada, sem substituir).

### 7. O que **não** vou fazer

- Não altero `LandingPage.tsx`, `App.css`, `index.css`, nem qualquer rota autenticada.
- Não crio backend, tabelas, edge functions ou integrações — página é 100% estática/marketing.
- Não adiciono libs novas (motion, gsap, three) — tudo com CSS + IntersectionObserver, igual ao padrão da Cartzy.
- Não invento preços; o CTA de planos leva ao WhatsApp comercial (mesmo padrão da Cartzy).

---

### Detalhes técnicos (para referência)

- Arquivo: `src/pages/LandingFluxoEnvio.tsx` (~700 linhas, single-file como a Cartzy).
- Componentes internos: `Reveal`, `CountUp`, `FeatureCard`, `PainCard`, `StepCard`, `FaqItem`.
- Rota: `<Route path="/fluxo-envio" element={<LandingFluxoEnvio />} />` adicionada em `src/App.tsx`.
- Assets: 1 screenshot novo em `src/assets/` (capturado da tela `/sendflow` em modo demo).

Confirma que posso implementar assim, ou quer ajustar alguma seção antes?
