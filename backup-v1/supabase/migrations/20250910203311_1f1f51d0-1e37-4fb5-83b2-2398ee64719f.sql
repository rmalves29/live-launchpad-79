-- Add admin credential linkage columns to tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS admin_email text,
  ADD COLUMN IF NOT EXISTS admin_user_id uuid;

-- Add FK to auth.users for admin_user_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_name = 'tenants_admin_user_fk'
      AND tc.table_name = 'tenants'
      AND tc.constraint_schema = 'public'
  ) THEN
    ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_admin_user_fk
    FOREIGN KEY (admin_user_id)
    REFERENCES auth.users (id)
    ON DELETE SET NULL;
  END IF;
END $$;