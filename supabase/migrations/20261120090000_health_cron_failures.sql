-- Alertas de saúde: tarefas agendadas (pg_cron) que falharam desde um instante.
-- O schema cron não é exposto pela API; esta função (só para a service role) entrega o resumo.
create or replace function public.admin_health_cron_failures(p_since timestamptz)
returns table (jobname text, failures bigint, last_error text)
language sql
security definer
set search_path = cron, public
as $$
  select j.jobname::text,
         count(*) as failures,
         (array_agg(left(d.return_message, 300) order by d.start_time desc))[1] as last_error
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
   where d.start_time >= p_since
     and d.status = 'failed'
   group by j.jobname;
$$;

revoke all on function public.admin_health_cron_failures(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_health_cron_failures(timestamptz) to service_role;
