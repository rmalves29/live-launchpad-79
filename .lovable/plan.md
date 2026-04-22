

## Corrigir SendFlow para preservar EXATAMENTE o template configurado

### Causas do problema

Comparando o template configurado (com linhas em branco entre os blocos) com a mensagem entregue (compactada), identifiquei **3 culpados** em `supabase/functions/sendflow-process/index.ts` e `_shared/anti-block-delay.ts`:

| # | Onde | O que faz | Efeito visível |
|---|---|---|---|
| 1 | `addMessageVariation()` (linhas 128-132 do `anti-block-delay.ts`) | **Adiciona automaticamente "Olá tudo bem?" no topo** de toda mensagem em massa | Polui o template configurado |
| 2 | `addMessageVariation()` (linhas 134-143) | Troca emojis aleatoriamente (ex: 🛍️→📦, 💰→💵) com 30% de chance | Emojis diferentes do template |
| 3 | `personalizeMessage()` linha 132: `replace(/\n{3,}/g, '\n\n')` | Colapsa quebras de linha extras | OK, mas combina com o item 1 que insere `\n` extra |

O caso da imagem ainda tem outro detalhe: `{{ tamanho }}` foi removido (produto sem tamanho) — comportamento correto — mas a **linha em branco que separava o bloco "Cor/Tamanho" do bloco "De/Por"** também sumiu junto, porque a regex `.*\{\{tamanho\}\}.*\n?` consome a quebra de linha seguinte.

### Mudanças propostas

**Arquivo 1: `supabase/functions/sendflow-process/index.ts`**

- Trocar `addMessageVariation(message, false)` → enviar `message` puro (sem variação automática). O template já vem do banco, deve ser respeitado 100%.
- Manter apenas o zero-width space invisível como anti-spam (opcional, sem afetar layout).
- Ajustar a remoção de campos vazios (`cor`, `tamanho`, `observacao`) para **preservar a quebra de linha em branco** quando ela faz parte da estrutura visual do template:
  - Mudar regex de `.*\{\{...\}\}.*\n?` (que come o `\n` seguinte) para `.*\{\{...\}\}.*` (deixa o `\n` no lugar), e depois apenas o `replace(/\n{3,}/g, '\n\n')` consolida o excesso.

**Arquivo 2: `supabase/functions/_shared/anti-block-delay.ts`**

- Criar uma versão "soft" da variação: opção para chamar sem prepend de saudação e sem troca de emoji. Ou simplesmente o SendFlow para de chamar `addMessageVariation` e usa apenas o zero-width space inline.

### Comportamento final

| Template configurado | Resultado enviado |
|---|---|
| Linha em branco entre blocos | ✅ Linha em branco preservada |
| `🛍️` no template | ✅ `🛍️` enviado (sem swap aleatório) |
| Sem saudação extra no topo | ✅ Sem "Olá tudo bem?" injetado |
| Campo opcional vazio (cor/tamanho/observacao) | ✅ Linha some, mas quebra estrutural ao redor é mantida |
| Pedido sem promo + `{{valor_promo}}` sozinho | ✅ Linha some (regra já aplicada) |
| Anti-spam (zero-width space) | ✅ Mantido (invisível, não afeta layout) |

### Validação após deploy

Reenviar o produto **C1040** (sem tamanho) com o template atual da Mania de Mulher. Resultado esperado: estrutura visual idêntica ao template, com a linha em branco entre "Cor: DOURADO" e "💰 De: ... Por: ...", sem saudação automática no topo, e emojis exatamente como configurados.

### Escopo

Mudança global — vale para todas as empresas que usam SendFlow. Sem alterações de banco. Deploy automático das edge functions.

