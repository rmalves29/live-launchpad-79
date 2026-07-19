# Marcação "@respondeu_voce" no Fluxo de Envio

## Objetivo
Adicionar uma nova opção ao lado de "Marcar todos com @" que, ao enviar, faz aparecer o texto **@respondeu_voce** na mensagem enquanto **notifica todos os participantes** do grupo (mesmo efeito de menção em massa, com rótulo customizado).

## Como vai funcionar

### UI — `src/components/fluxo-envio/MessageComposer.tsx`
- Manter o checkbox atual **"Marcar todos com @"** intacto.
- Adicionar novo checkbox **"@respondeu_voce"** logo abaixo, com o hint: *"Marca todos do grupo mostrando @respondeu_voce"*.
- Estado local novo: `mentionRespondeuVoce` (boolean), mutuamente exclusivo com `mentionAll` (marcar um desmarca o outro para evitar duas menções concorrentes).
- Enviar novo campo `mention_label: "respondeu_voce"` no payload para `fe-send-message` quando o toggle estiver ativo.

### Edge Function — `supabase/functions/fe-send-message/index.ts`
- Aceitar `mention_label?: string` no `SendRequest`.
- Quando `mention_label === "respondeu_voce"`:
  1. Buscar participantes do grupo (mesma função já usada em `mention_all`: `getZapiGroupParticipants` / `evoGetGroupParticipants`).
  2. Preencher o array `mentioned` com todos os JIDs (dispara notificação "@você" para cada participante — igual à menção normal).
  3. Prefixar o `content_text` com a string literal **`@respondeu_voce `** (uma vez, no topo da mensagem) antes do envio.
- Se ambos `mention_all` e `mention_label` chegarem, `mention_label` prevalece.
- Aplicar em **texto, imagem (caption), vídeo (caption)** — mesmos pontos onde `mentioned` já é injetado hoje.

### Limitação técnica do WhatsApp (importante avisar)
O WhatsApp só renderiza a "bolinha azul" de menção quando o texto após `@` é um número de telefone real presente no array `mentioned`. Como `@respondeu_voce` não é um número, ele aparecerá como **texto simples** na conversa — mas **todos os participantes recebem a notificação de menção** (o ping é o mesmo do "marcar todos"). É exatamente o comportamento que você pediu: efeito de marcação + rótulo customizado visível.

## Arquivos alterados
- `src/components/fluxo-envio/MessageComposer.tsx` — novo checkbox e envio do flag.
- `supabase/functions/fe-send-message/index.ts` — novo campo e lógica de prefixo + mentioned.

## Fora de escopo
- Automações de entrada/saída (só o composer manual, conforme sua resposta).
- Alterar comportamento atual do "Marcar todos".
