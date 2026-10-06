-- Loja da Live: data e hora para a página sair do ar sozinha (ex.: meia-noite do dia da live).
-- O servidor (live-shop) já trata a página como fechada assim que a hora passa; o cron abaixo só grava o estado
-- (desativada) e limpa o agendamento, para o painel mostrar a situação certa.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS live_shop_close_at timestamptz;
COMMENT ON COLUMN public.tenants.live_shop_close_at IS 'Quando a Loja da Live deve ser desativada automaticamente (NULL = sem agendamento).';

SELECT cron.schedule('live-shop-auto-close', '* * * * *', $cron$
  WITH closed AS (
    UPDATE public.tenants
    SET live_shop_enabled = false, live_shop_close_at = NULL
    WHERE live_shop_close_at IS NOT NULL AND live_shop_close_at <= now()
    RETURNING id, name
  )
  INSERT INTO public.audit_logs (entity, entity_id, action, tenant_id, meta)
  SELECT 'tenant', id::text, 'live_shop_auto_closed', id, jsonb_build_object('name', name) FROM closed;
$cron$);
