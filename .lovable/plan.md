

# Agendamento de Postagem no SendFlow

## Resumo

Adicionar um campo de data/hora de agendamento na página SendFlow. Quando o usuário define um horário futuro, o job é criado com status `scheduled` e um campo `scheduled_at`. Um cron job (já existente para `fe-process-scheduled`) ou lógica no `sendflow-process` verifica se o horário chegou antes de iniciar o processamento.

## Como vai funcionar

1. O usuário seleciona produtos, grupos, configura delays normalmente
2. Opcionalmente define uma data/hora para início do envio
3. Se agendado: job é criado com status `scheduled` e `scheduled_at` no `job_data`. O backend **não** processa até o horário chegar
4. Se imediato (sem agendamento): comportamento atual, sem mudanças

## Alterações

### 1. Frontend - `src/pages/sendflow/Index.tsx`
- Adicionar estado `scheduledAt` (string ISO ou null)
- Adicionar UI com date/time picker antes do botão de envio: campo de data e hora (inputs nativos `date` e `time`)
- Switch/checkbox "Agendar envio" que revela os campos
- Quando agendado, o botão muda para "Agendar Envio" com ícone de relógio
- Passar `scheduledAt` para o hook `useBackendSendFlow`

### 2. Hook - `src/hooks/useBackendSendFlow.ts`
- Aceitar `scheduledAt?: string` no `startSendFlowJob`
- Se `scheduledAt` definido: criar job com status `scheduled` em vez de `running`, incluir `scheduled_at` no `job_data`
- **Não** invocar `sendflow-process` imediatamente quando agendado
- Toast: "Envio agendado para DD/MM/YYYY HH:mm"

### 3. Edge Function - `supabase/functions/sendflow-process/index.ts`
- Ao receber um job com status `scheduled`: verificar se `scheduled_at` já passou
  - Se sim: mudar para `running` e processar
  - Se não: retornar sem processar (o cron vai tentar novamente)

### 4. Cron Job - Nova Edge Function `sendflow-check-scheduled`
- Roda a cada minuto via pg_cron
- Busca jobs com status `scheduled` e `scheduled_at <= now()`
- Para cada um: muda status para `running` e invoca `sendflow-process`
- SQL do cron a ser executado no Supabase

### 5. Coluna no banco
- Adicionar coluna `scheduled_at` (timestamptz, nullable) na tabela `sending_jobs` via query SQL

### 6. UI de jobs agendados
- No `SendingProgressLive` ou `SendingControl`, mostrar jobs agendados com horário previsto e opção de cancelar

## Regras mantidas
- Todas as configurações de envio (anti-bloqueio, delays entre grupos/produtos, random delay) são salvas no `job_data` e respeitadas normalmente quando o processamento começa
- A única diferença é **quando** o processamento inicia

