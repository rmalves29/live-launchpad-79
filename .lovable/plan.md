

## Plano: Agendamento de Postagem no SendFlow — ✅ IMPLEMENTADO

### Resumo
Sistema de agendamento que permite definir data/hora para início do envio no SendFlow. Jobs agendados ficam com status `scheduled` até que um cron job (`sendflow-check-scheduled`) detecte que o horário chegou e dispare o processamento.

### Arquivos alterados
- `src/pages/sendflow/Index.tsx` — UI de agendamento (switch + date/time inputs)
- `src/hooks/useBackendSendFlow.ts` — Aceita `scheduledAt`, cria job com status `scheduled`
- `src/components/SendingControl.tsx` — Mostra jobs agendados com opção de cancelar
- `supabase/functions/sendflow-check-scheduled/index.ts` — Cron function que dispara jobs no horário
- `supabase/config.toml` — Config da nova edge function
- `docs/SQL_SENDFLOW_SCHEDULING.sql` — SQL para rodar no Supabase (coluna + constraint + cron)

### SQL pendente (rodar no Supabase SQL Editor)
Ver `docs/SQL_SENDFLOW_SCHEDULING.sql`
