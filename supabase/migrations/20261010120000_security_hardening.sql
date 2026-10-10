-- Endurecimento de seguranca (auditoria de 10/10/2026)
--  1. sendflow_history / sendflow_tasks: remove a policy "Service role full access" que valia para QUALQUER pessoa
--     (o service role ja ignora RLS; as policies de tenant continuam valendo para quem esta logado).
--  2. crm_agent_status: liga RLS (leitura aberta, escrita so pelo service role).
--  3. Funcoes SECURITY DEFINER: tira a permissao de execucao do publico/anonimo, mantendo so as que a loja publica usa.
--  4. Guardas em get_admin_metrics e restore_order_stock (nao confiavam em quem chamava).
--  5. INSERTs publicos de logs passam a exigir login.
--  6. Infra de rate limit (rate_limit_hit) + hook de tentativas de senha (limite por conta no Supabase Auth).

-- 1) sendflow --------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role full access to sendflow_history" ON public.sendflow_history;
DROP POLICY IF EXISTS "Service role full access to sendflow_tasks" ON public.sendflow_tasks;

-- 2) crm_agent_status ------------------------------------------------------------------------
ALTER TABLE public.crm_agent_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_agent_status_read" ON public.crm_agent_status;
CREATE POLICY "crm_agent_status_read" ON public.crm_agent_status FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.crm_agent_status FROM anon, authenticated;

-- Permissoes de tabela que nunca devem existir para anon/authenticated (TRUNCATE ignora RLS)
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- 3) Funcoes SECURITY DEFINER ------------------------------------------------------------------
DO $$
DECLARE
  r record;
  -- usadas pela loja/checkout publicos (sem login) ou pelas policies de RLS
  keep_anon text[] := ARRAY[
    'get_tenant_by_id','get_tenant_by_slug','list_active_tenants_basic','get_active_shipping_provider',
    'public_register_instagram','get_paid_orders_for_merge','get_tenant_order_merge_days',
    'get_current_tenant_id','is_super_admin','is_tenant_admin','get_own_role','get_own_tenant_id','get_user_tenant_id'
  ];
  -- chamadas pelo painel por usuario logado (cada uma ja confere o perfil por dentro ou ganha guarda abaixo)
  keep_auth text[] := ARRAY[
    'admin_whatsapp_activity_metrics','admin_whatsapp_activity_metrics_cached','get_health_snapshot',
    'get_admin_metrics','get_admin_metrics_cached','restore_order_stock','track_announcement_view'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('public', p.oid, 'EXECUTE'))
      AND p.proname <> ALL (keep_anon)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    IF r.proname = ANY (keep_auth) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.args);
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated', r.proname, r.args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

-- 4) Guardas ----------------------------------------------------------------------------------
-- Quem chama por usuario logado so mexe no que e do proprio tenant (service role / cron: auth.uid() nulo, segue livre).
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.get_admin_metrics()'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%forbidden_admin_only%' THEN
    v_def := regexp_replace(v_def, '\mBEGIN\M',
      E'BEGIN\n  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN RAISE EXCEPTION ''forbidden_admin_only'' USING ERRCODE = ''42501''; END IF;', 'i');
    EXECUTE v_def;
  END IF;

  SELECT pg_get_functiondef('public.restore_order_stock(bigint)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%forbidden_other_tenant%' THEN
    v_def := regexp_replace(v_def, '\mBEGIN\M',
      E'BEGIN\n  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND o.tenant_id = public.get_current_tenant_id()) THEN RAISE EXCEPTION ''forbidden_other_tenant'' USING ERRCODE = ''42501''; END IF;', 'i');
    EXECUTE v_def;
  END IF;
END $$;

-- 5) INSERTs publicos de log -> exigem login (as edge functions usam service role e nao sao afetadas)
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "System can insert webhook logs" ON public.webhook_logs;
CREATE POLICY "System can insert webhook logs" ON public.webhook_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "System can insert conflicts" ON public.whatsapp_session_conflicts;
CREATE POLICY "System can insert conflicts" ON public.whatsapp_session_conflicts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Service role can insert live comments" ON public.instagram_live_comments;
CREATE POLICY "Service role can insert live comments" ON public.instagram_live_comments FOR INSERT TO authenticated WITH CHECK (true);

-- 6) Rate limit ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0
);
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_hits FROM PUBLIC, anon, authenticated;

-- true = liberado; false = passou do limite na janela
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hits integer;
BEGIN
  INSERT INTO public.rate_limit_hits AS r (key, window_start, hits)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    window_start = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN now() ELSE r.window_start END,
    hits         = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN 1 ELSE r.hits + 1 END
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_max;
END;
$$;
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO service_role;

-- IP de quem chamou via PostgREST (cabecalho x-forwarded-for)
CREATE OR REPLACE FUNCTION public.request_client_ip()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(trim(split_part(COALESCE(NULLIF(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), ''), 'unknown');
$$;

-- Cadastro publico de Instagram: no maximo 20 por hora por IP
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.public_register_instagram(text,text,text,text)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%rate_limit_hit%' THEN
    v_def := regexp_replace(v_def, '\mBEGIN\M',
      E'BEGIN\n  IF NOT public.rate_limit_hit(''reg_ig:'' || public.request_client_ip(), 20, 3600) THEN\n    RETURN jsonb_build_object(''success'', false, ''error'', ''Muitas tentativas. Tente novamente mais tarde.'');\n  END IF;', 'i');
    EXECUTE v_def;
  END IF;
END $$;

-- Limpeza diaria das contagens antigas
CREATE OR REPLACE FUNCTION public.rate_limit_cleanup()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  DELETE FROM public.rate_limit_hits WHERE window_start < now() - interval '1 day';
  DELETE FROM public.auth_login_failures WHERE created_at < now() - interval '1 day';
$$;
REVOKE ALL ON FUNCTION public.rate_limit_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_cleanup() TO service_role;

-- Hook "Password verification attempt" do Supabase Auth: bloqueia a CONTA apos 5 senhas erradas em 15 min.
-- (nao da para forjar: quem registra a falha e o proprio Auth). Precisa ser ativado em Auth > Hooks.
CREATE TABLE IF NOT EXISTS public.auth_login_failures (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_login_failures_user_idx ON public.auth_login_failures (user_id, created_at DESC);
ALTER TABLE public.auth_login_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_login_failures FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hook_password_verification_attempt(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user  uuid := NULLIF(event ->> 'user_id', '')::uuid;
  v_valid boolean := COALESCE((event ->> 'valid')::boolean, false);
  v_fails integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('decision', 'continue');
  END IF;

  SELECT count(*) INTO v_fails FROM public.auth_login_failures
  WHERE user_id = v_user AND created_at > now() - interval '15 minutes';

  IF v_fails >= 5 THEN
    RETURN jsonb_build_object('decision', 'reject',
      'message', 'Muitas tentativas de login com senha incorreta. Tente novamente em alguns minutos.');
  END IF;

  IF v_valid THEN
    DELETE FROM public.auth_login_failures WHERE user_id = v_user;
  ELSE
    INSERT INTO public.auth_login_failures (user_id) VALUES (v_user);
  END IF;

  RETURN jsonb_build_object('decision', 'continue');
END;
$$;
REVOKE ALL ON FUNCTION public.hook_password_verification_attempt(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb) TO supabase_auth_admin;
GRANT SELECT, INSERT, DELETE ON public.auth_login_failures TO supabase_auth_admin;
GRANT USAGE, SELECT ON SEQUENCE public.auth_login_failures_id_seq TO supabase_auth_admin;

-- Agenda a limpeza (03:10 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'rate-limit-cleanup';
    PERFORM cron.schedule('rate-limit-cleanup', '10 3 * * *', 'SELECT public.rate_limit_cleanup()');
  END IF;
END $$;
