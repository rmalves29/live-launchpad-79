-- Fixa o caminho de busca (search_path) de 10 funções apontadas pelo verificador de segurança do Supabase
-- (lint "function_search_path_mutable"). Sem isso, quem cria uma tabela/função com o mesmo nome num
-- esquema que vem antes no caminho pode fazer a função usar a versão falsa.
--
-- Caminho escolhido: public, extensions, pg_temp — o mesmo que as sessões já usam hoje
-- ("$user", public, extensions), sem o "$user". Por isso o comportamento não muda.
--
-- Simulado em produção em 20/11/2026, dentro de uma transação desfeita no final:
--   resultados idênticos antes/depois em todas as funções; checagem de cliente bloqueada (roda a cada
--   item da live) 1,094 ms → 1,098 ms; pior caso (2.181 clientes) 59,7 ms → 60,5 ms.
--
-- Fica de fora de propósito:
--   * cleanup_table_in_batches: é um procedimento que confirma (COMMIT) por dentro; o Postgres não deixa
--     um procedimento com caminho fixo fazer isso — ele pararia de funcionar. Já usa nomes completos (public.).
--
-- Observação: get_admin_metrics já falha hoje (ordena por "mean_exec_time", que a subconsulta renomeou para
-- "mean_ms") e nenhuma tela a chama — vai para a lista de limpeza.
--
-- Para desfazer: alter function ... reset search_path; (para cada uma abaixo)

alter function public.agenda_msg_cliente(agenda_reunioes)                     set search_path = public, extensions, pg_temp;
alter function public.agenda_msg_confirmacao(agenda_reunioes)                 set search_path = public, extensions, pg_temp;
alter function public.cleanup_net_http_responses(timestamptz)                 set search_path = public, extensions, pg_temp;
alter function public.count_cron_logs(timestamptz)                            set search_path = public, extensions, pg_temp;
alter function public.delete_cron_logs(timestamptz, bigint, bigint)           set search_path = public, extensions, pg_temp;
alter function public.get_admin_metrics()                                     set search_path = public, extensions, pg_temp;
alter function public.get_cron_logs_for_export(timestamptz, integer, integer) set search_path = public, extensions, pg_temp;
alter function public.phone_match_key(text)                                   set search_path = public, extensions, pg_temp;
alter function public.request_client_ip()                                     set search_path = public, extensions, pg_temp;
alter function public.tr_orders_paid_at()                                     set search_path = public, extensions, pg_temp;
