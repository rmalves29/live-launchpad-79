-- Dedicated Olist scheduler identity. No project-wide key is changed.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'olist_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'olist_cron_secret', 'Olist scheduler only');
  end if;
  if not exists (select 1 from vault.secrets where name = 'olist_cron_previous_command') then
    perform vault.create_secret(command, 'olist_cron_previous_command', 'Olist scheduler rollback')
      from cron.job where jobname = 'olist-orders-sweep';
  end if;
end $$;

-- Vault requires owner privileges; this small validator is callable ONLY by service_role.
-- The caller receives a boolean, never the stored secret.
create or replace function public.olist_cron_authorized(p_secret text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(
    p_secret ~ '^[a-f0-9]{64}$' and (
      select extensions.digest(s.decrypted_secret, 'sha256') = extensions.digest(p_secret, 'sha256')
      from vault.decrypted_secrets s where s.name = 'olist_cron_secret' limit 1
    ), false);
$$;
revoke all on function public.olist_cron_authorized(text) from public, anon, authenticated;
grant execute on function public.olist_cron_authorized(text) to service_role;
