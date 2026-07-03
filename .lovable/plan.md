## Objetivo
Ajustar a simulação de "digitando" para seguir a nova regra de tempo baseada em caracteres.

## Nova regra
- **Base**: 0,06s (60ms) por caractere da mensagem.
- **Pausas intermediárias**: a cada múltiplo de 300 caracteres, inserir uma pausa de 1s. Essa pausa ocorre na **metade** do bloco de digitação (ou seja, digita metade → pausa 1s → digita a outra metade → continua).

### Exemplo
Mensagem com 650 caracteres:
- Tempo total de digitação: 650 × 0,06 = 39s
- Múltiplos de 300 completos: 2 (em 300 e em 600) → 2 pausas de 1s
- Fluxo: available → digita 19,5s → pausa 1s → digita 19,5s → pausa 1s → envia

## Onde aplicar

### 1. `supabase/functions/_shared/uazapi-api.ts`
- Substituir `calcTypingDuration(length)` por uma função que retorne uma **lista de segmentos** `{ typingMs, pauseAfterMs }[]`, respeitando os múltiplos de 300 com pausa no meio do bloco.
- Manter uma versão simples `calcTypingDuration` (soma total) para compatibilidade com quem só quer o total.
- Adicionar helper `runTypingSequence(cfg, phone, length)` que executa: `sendPresenceAvailable` → loop nos segmentos (`sendPresenceComposing(cfg, phone, segMs)` + `sleep(segMs)` + `sleep(pauseAfterMs)`).

### 2. Consumidores atualizados para usar `runTypingSequence`
- `supabase/functions/zapi-send-message/index.ts` (bloco uazapi)
- `supabase/functions/zapi-send-item-added/index.ts` (item adicionado + fluxo consentimento)
- `supabase/functions/sendflow-process/index.ts` (envio em grupo — manter a v11 sequence, mas usar o novo cálculo por caractere no `composing`)
- Demais senders que hoje chamam `sendPresenceComposing(..., calcTypingDuration(len))` para uazapi.

### 3. Z-API
- Z-API não suporta indicador "digitando" (já documentado no código). Apenas o **delay total** será ajustado em `simulateTyping` (`supabase/functions/_shared/anti-block-delay.ts`) para respeitar 0,06s por caractere + 1s por múltiplo de 300 — sem enviar presença.

## Fora de escopo
- Não altero anti-block delays já existentes entre mensagens diferentes (throttle, jitter humano) — apenas o cálculo do "digitando" de uma mensagem individual.
- Não altero UI.
