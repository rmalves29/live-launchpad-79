-- Backfill admin_email/admin_user_id from profiles and create sync trigger
-- 1) Backfill for existing tenants where fields are null/empty
WITH selected AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, id AS user_id, email
  FROM public.profiles
  WHERE role = 'tenant_admin' AND tenant_id IS NOT NULL
  ORDER BY tenant_id, COALESCE(updated_at, created_at) DESC NULLS LAST
)
UPDATE public.tenants t
SET admin_email = s.email,
    admin_user_id = s.user_id
FROM selected s
WHERE t.id = s.tenant_id
  AND (t.admin_email IS NULL OR t.admin_email = '')
  AND t.admin_user_id IS NULL;

-- 2) Function to sync tenant admin into tenants table
CREATE OR REPLACE FUNCTION public.sync_tenant_admin_to_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'tenant_admin' AND NEW.tenant_id IS NOT NULL THEN
    UPDATE public.tenants
    SET admin_email = NEW.email,
        admin_user_id = NEW.id,
        updated_at = now()
    WHERE id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Create triggers on profiles
DROP TRIGGER IF EXISTS trg_profiles_sync_tenant_admin_ins ON public.profiles;
CREATE TRIGGER trg_profiles_sync_tenant_admin_ins
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE PROCEDURE public.sync_tenant_admin_to_tenant();

DROP TRIGGER IF EXISTS trg_profiles_sync_tenant_admin_upd ON public.profiles;
CREATE TRIGGER trg_profiles_sync_tenant_admin_upd
AFTER UPDATE OF role, tenant_id, email ON public.profiles
FOR EACH ROW
EXECUTE PROCEDURE public.sync_tenant_admin_to_tenant();