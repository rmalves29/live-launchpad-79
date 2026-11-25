-- ⚠️ DESCARTADO em 20/11/2026: apagaria sem cópia e duplicaria a rotina existente cleanup-cron-logs (arquivo no Drive, 7 dias).
-- Ver decisoes.md (Etapa 3 · 3.6). Mantido só como histórico.
-- Etapa 2 · item 2.6 — limpeza de logs do banco do Cartzy (NÃO roda sozinho: é para aplicar com o "ok" do Rafael)
-- Medido em 19/11/2026:
--   cron.job_run_details  162 MB  ~190 mil linhas   (guarda ~16 dias; ~12 mil execuções por dia)
--   net._http_response    117 MB  ~3 mil linhas     (as respostas já são apagadas; o espaço ficou "inchado")
--   public.webhook_logs    90 MB  ~108 mil linhas   (já existe arquivamento diário: archive-webhook-logs-daily)
--   public.fe_group_events 85 MB                    NÃO MEXER: o relatório de entrada/saída de grupos usa o histórico completo (AGENTS.md)
--   public.whatsapp_messages 109 MB                 NÃO MEXER aqui: a pausa de 30 min e o histórico de atendimento usam
--
-- Ganho estimado: ~230 MB. Risco: baixo (são registros de execução, não dados de lojas).

-- 1) Histórico de execução dos agendamentos: manter só os últimos 3 dias (hoje fica ~16 dias).
delete from cron.job_run_details where start_time < now() - interval '3 days';

-- 2) Recuperar o espaço inchado das respostas HTTP (trava a tabela por poucos segundos; rodar fora do horário de live).
vacuum full net._http_response;

-- 3) Daqui para frente: apagar todo dia o histórico de agendamentos com mais de 3 dias.
select cron.schedule('purge-cron-run-details-daily', '20 4 * * *',
  $$ delete from cron.job_run_details where start_time < now() - interval '3 days' $$);
