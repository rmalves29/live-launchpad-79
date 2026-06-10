## Objetivo

Resolver dois problemas na página **WhatsApp → Cobrança em Massa**:

1. **Visibilidade**: hoje não há como a cliente conferir o que foi disparado. Precisamos mostrar os últimos 5 envios em massa direto na página.
2. **Prevenção do erro silencioso da Roanne**: quando o Z-API está desconectado, a página segue "enviando" e grava as mensagens no banco como `PENDING`/sem `zapi_message_id`, sem aviso. Precisamos detectar e alertar antes/durante o envio.

---

## Parte 1 — Histórico dos últimos 5 envios em massa

### O que aparece na tela
Um card novo no topo da página *Cobrança em Massa*, acima do formulário, chamado **"Últimos envios"**, listando os 5 disparos mais recentes com:

- Data/hora (fuso Brasília)
- Total de destinatários
- Quantos enviados / quantos com erro / quantos pendentes (não confirmados pela Z-API)
- Pré-visualização do texto (primeiros ~120 caracteres, com botão "ver completo" em modal)
- Badge de status do disparo: **Concluído**, **Parcial**, **Falhou** (quando >50% ficou PENDING)

### Como agrupar os envios
Os envios atuais não têm um identificador de "campanha". Vamos criar um agrupamento simples:

- Adicionar coluna `batch_id uuid` em `whatsapp_messages` (apenas para `type='bulk'`).
- No `Cobranca.tsx`, gerar um `crypto.randomUUID()` antes do loop e gravar em todas as inserções daquele disparo.
- A tela agrupa por `batch_id` e calcula os contadores.

Para os envios **antigos** (sem `batch_id`), agrupamos por janela de tempo: mensagens `type='bulk'` do mesmo tenant criadas dentro de 10 min uma da outra contam como o mesmo "envio" (fallback só para histórico já existente).

### Detalhes técnicos
- Nova migration: `ALTER TABLE whatsapp_messages ADD COLUMN batch_id uuid;` + índice `(tenant_id, type, batch_id)`.
- Novo componente `src/components/whatsapp/BulkSendHistory.tsx`.
- Query: últimos 5 `batch_id` distintos do tenant onde `type='bulk'`, ordenado por `max(created_at)` desc; depois um segundo `select` para puxar todas as linhas desses 5 batches e calcular contadores no cliente.

---

## Parte 2 — Detecção e alerta de Z-API desconectado

### Causa raiz do caso Roanne
No `Cobranca.tsx` linhas 860-899: o código chama `zapi-proxy.functions.invoke()` e considera sucesso quando **não há `error` da Supabase Function**. Mas o `zapi-proxy` pode retornar HTTP 200 com payload do tipo `{error: "You are not connected"}` da Z-API — isso passa como "sucesso" e a linha é gravada no banco sem `zapi_message_id`. Resultado: nada chega no WhatsApp.

### Mudanças

**A) Pré-checagem obrigatória antes de começar o disparo**
- Antes do loop, chamar `zapi-proxy` com `action: 'status'` (endpoint `/status` da Z-API que retorna `{connected: true/false}`).
- Se `connected !== true`: bloquear o envio com um modal grande:

  > ⚠️ WhatsApp desconectado
  >
  > Sua instância Z-API não está conectada. Reconecte antes de enviar para evitar mensagens não entregues.
  >
  > [Reconectar agora] (leva para `/whatsapp/conexao`)  [Cancelar]

**B) Validação da resposta de cada envio**
- Tratar como erro qualquer resposta cujo payload contenha `error`, `not connected`, ou ausência de `messageId`/`zaapId`.
- Gravar `delivery_status = 'failed'` (ou `'pending'` se a Z-API devolveu fila) na inserção em `whatsapp_messages`.

**C) Circuit breaker durante o loop**
- Se 3 envios consecutivos falharem com mensagem indicando desconexão, **pausar o disparo automaticamente** e mostrar o mesmo modal de reconexão, oferecendo "Retomar de onde parou" depois que o usuário reconectar (usa a infra de `sending_jobs` que já existe).

**D) Notificação proativa (opcional, recomendado)**
Como a Roanne fez o disparo e só descobriu depois, adicionar: ao final do disparo, se >30% das mensagens ficaram `failed`/`pending`, mostrar toast vermelho persistente + e-mail para o `admin_email` do tenant via edge function `notify-bulk-failure` com resumo:

> "Disparo de 09/06 às 21:19 — 12 mensagens, 0 entregues. Verifique a conexão do WhatsApp."

---

## Arquivos afetados

**Frontend**
- `src/pages/whatsapp/Cobranca.tsx` — pré-check de status, validação por mensagem, circuit breaker, gravar `batch_id` e `delivery_status`, integrar componente de histórico.
- `src/components/whatsapp/BulkSendHistory.tsx` (novo) — card com os 5 últimos envios.
- `src/components/whatsapp/ZapiDisconnectedModal.tsx` (novo) — modal de aviso/reconexão.

**Backend**
- Migration: adicionar `batch_id uuid` em `whatsapp_messages` + índice.
- (Opcional Parte D) Nova edge function `notify-bulk-failure`.

**Sem mudanças** em `zapi-proxy`, `sending_jobs` ou outros disparos (item, paid, tracking) — escopo limitado à cobrança em massa.

---

## Perguntas antes de implementar

1. Quer que eu inclua a **Parte D (notificação por e-mail ao admin)** ou só o aviso na tela já basta?
2. O modal de "WhatsApp desconectado" deve **bloquear o envio totalmente** ou só **avisar e deixar o usuário decidir continuar**?
3. Para o histórico, quer mostrar os 5 últimos sempre, ou prefere uma lista com "ver mais" para acessar envios mais antigos?
