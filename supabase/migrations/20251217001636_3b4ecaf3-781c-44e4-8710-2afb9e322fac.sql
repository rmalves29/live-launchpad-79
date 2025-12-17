-- Fix function search_path security warnings
-- Adding SET search_path = public to all functions that don't have it

-- 1. set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 2. update_sending_jobs_updated_at
CREATE OR REPLACE FUNCTION public.update_sending_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 3. update_mkt_mm_updated_at
CREATE OR REPLACE FUNCTION public.update_mkt_mm_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 4. cleanup_stale_sessions
CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  UPDATE public.whatsapp_active_sessions
  SET status = 'disconnected'
  WHERE status = 'active' 
    AND last_heartbeat < (now() - interval '2 minutes');
END;
$function$;

-- 5. update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- 6. set_unique_order_id
CREATE OR REPLACE FUNCTION public.set_unique_order_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF NEW.unique_order_id IS NULL OR NEW.unique_order_id = '' THEN
        NEW.unique_order_id = 'PED-' || EXTRACT(EPOCH FROM now())::bigint || '-' || NEW.id;
    END IF;
    RETURN NEW;
END;
$function$;

-- 7. auto_set_tenant_id
CREATE OR REPLACE FUNCTION public.auto_set_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := get_user_tenant_id();
  END IF;
  RETURN NEW;
END;
$function$;

-- 8. update_integration_updated_at
CREATE OR REPLACE FUNCTION public.update_integration_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- 9. update_customers_updated_at (already has SECURITY DEFINER but ensure search_path)
CREATE OR REPLACE FUNCTION public.update_customers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 10. get_current_tenant_id (add search_path)
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    RETURN (
        SELECT tenant_id 
        FROM profiles 
        WHERE id = auth.uid()
    );
END;
$function$;

-- 11. is_super_admin (add search_path)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    RETURN (
        SELECT role = 'super_admin'
        FROM profiles 
        WHERE id = auth.uid()
    );
END;
$function$;

-- 12. tenant_has_access (add search_path)
CREATE OR REPLACE FUNCTION public.tenant_has_access(tenant_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  tenant_record RECORD;
BEGIN
  SELECT * INTO tenant_record FROM tenants WHERE id = tenant_uuid;
  
  IF NOT FOUND OR tenant_record.is_blocked THEN
    RETURN FALSE;
  END IF;
  
  IF tenant_record.plan_type IN ('free', 'enterprise') THEN
    RETURN TRUE;
  END IF;
  
  IF tenant_record.trial_ends_at IS NOT NULL AND tenant_record.trial_ends_at > NOW() THEN
    RETURN TRUE;
  END IF;
  
  IF tenant_record.subscription_ends_at IS NOT NULL AND tenant_record.subscription_ends_at > NOW() THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$function$;

-- 13. normalize_bazar_phone (add search_path)
CREATE OR REPLACE FUNCTION public.normalize_bazar_phone(phone text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_clean text;
  v_has_country boolean;
  v_ddd text;
  v_number text;
  v_ddd_int integer;
BEGIN
  IF phone IS NULL THEN
    RETURN NULL;
  END IF;

  v_clean := regexp_replace(phone, '\\D', '', 'g');
  v_has_country := v_clean LIKE '55%';

  IF v_has_country THEN
    v_clean := substr(v_clean, 3);
  END IF;

  IF length(v_clean) < 10 THEN
    RETURN v_clean;
  END IF;

  v_ddd := substr(v_clean, 1, 2);
  v_number := substr(v_clean, 3);

  BEGIN
    v_ddd_int := v_ddd::integer;
  EXCEPTION WHEN others THEN
    RETURN v_clean;
  END;

  IF v_ddd_int < 11 OR v_ddd_int > 99 THEN
    RETURN v_clean;
  END IF;

  IF v_ddd_int <= 30 THEN
    IF length(v_number) = 8 THEN
      v_number := '9' || v_number;
    END IF;
  ELSE
    IF length(v_number) = 9 AND substr(v_number, 1, 1) = '9' THEN
      v_number := substr(v_number, 2);
    END IF;
  END IF;

  RETURN v_ddd || v_number;
END;
$function$;

-- 14. normalize_phone_regional (add search_path)
CREATE OR REPLACE FUNCTION public.normalize_phone_regional(phone text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_clean text;
  v_has_country boolean;
  v_ddd text;
  v_number text;
  v_ddd_int integer;
BEGIN
  IF phone IS NULL THEN
    RETURN NULL;
  END IF;

  v_clean := regexp_replace(phone, '\\D', '', 'g');
  v_has_country := v_clean LIKE '55%';

  IF v_has_country THEN
    v_clean := substr(v_clean, 3);
  END IF;

  IF length(v_clean) < 10 THEN
    RETURN v_clean;
  END IF;

  v_ddd := substr(v_clean, 1, 2);
  v_number := substr(v_clean, 3);

  BEGIN
    v_ddd_int := v_ddd::integer;
  EXCEPTION WHEN others THEN
    RETURN v_clean;
  END;

  IF v_ddd_int < 11 OR v_ddd_int > 99 THEN
    RETURN v_clean;
  END IF;

  IF v_ddd_int <= 30 THEN
    IF length(v_number) = 8 THEN
      v_number := '9' || v_number;
    END IF;
  ELSE
    IF length(v_number) = 9 AND substr(v_number, 1, 1) = '9' THEN
      v_number := substr(v_number, 2);
    END IF;
  END IF;

  RETURN v_ddd || v_number;
END;
$function$;