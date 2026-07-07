---
aliases: [Humanização WhatsApp]
tags: [whatsapp, uazapi, humanizacao, roadmap, ideias]
status: proposta
resumo: Funções da UazAPI ainda não usadas que podem humanizar as mensagens — exploração feita em 2026-07-07, nada implementado ainda
atualizado: 2026-07-07
---

# Humanização de Mensagens — Ideias UazAPI

Exploração de recursos da [[UazAPI GO]] **ainda não usados** pelo sistema, ordenados por impacto.

**Em uso hoje:** `send/text`, `send/media`, `send/menu` (botão), presença `composing`/`available`, reação (só no sendflow).

---

## 1. Reagir à resposta da cliente com emoji ❤️ ⭐ quick win
- `POST /send/reaction` — **código já existe** (`sendReaction` em `_shared/uazapi-api.ts`), usado só no sendflow
- Quando a cliente responde e ativa o consentimento v2, o sistema fica mudo — reagir com ❤️/👍 confirma recebimento **sem gastar mensagem** (reação não conta como mensagem)
- Onde: `zapi-webhook`, no ponto de ativação do consentimento

## 2. `replyid` — responder citando a mensagem ⭐ quick win
- Campo opcional do `send/text`; a mensagem sai citando (quote) a mensagem da cliente
- Uso: confirmação de item adicionado citando o `C123x2` que a cliente mandou no grupo
- O webhook já tem o `messageId` — só passar adiante

## 3. Nota de voz (`ptt`) + presença `recording`
- `POST /send/media` com `type: "ptt"` = voice note real; `presence: "recording"` mostra "gravando áudio..."
- Ideia: dona da loja grava 1x um áudio de "pagamento recebido" → enviado como nota de voz
- Máxima humanização; requer gravar os áudios (decisão da lojista)

## 4. Padrão de digitação realista ⭐ quick win
- Hoje: um `composing` único → mensagem
- Humano: digita, para, digita → `composing` 3s → `paused` 1,5s → `composing` 2s → mensagem

## 5. `delay` nativo no `send/text` ⭐ quick win
- Campo `delay` faz a própria UazAPI mostrar "digitando..." antes de soltar a mensagem
- Mais confiável que orquestrar presença na edge function (não depende dela ficar viva)

## 6. Quebrar mensagem longa em 2–3 balões
- "Oiii" → *(digitando)* → "Adicionei a blusa rosa ✨" → "Total R$ 89,90, finaliza: link"
- ⚠️ Multiplica volume de mensagens (3x) — usar só em item adicionado, mantendo throttle

## 7. `mentions` em grupos
- Mencionar cliente no sendflow/grupos — uso pontual, menção em massa parece spam

## 8. `sticker` pós-pagamento
- `type: "sticker"` com URL do webp — sticker da marca de "obrigada 💖" após pagamento

---

## Pacote recomendado (fase 1 — sem aumentar volume)
1. Reação ❤️ à resposta da cliente (item 1)
2. `replyid` na confirmação de item (item 2)
3. Digitação com pausa + `delay` nativo (itens 4+5)

Áudio (3) e balões múltiplos (6) dependem de decisão: gravar áudios / aceitar mais volume.

## Relacionados
- [[UazAPI GO]]
- [[WhatsApp - Engine]]
- [[Roadmap]]
