ALTER TABLE public.fe_groups ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_fe_groups_tenant_admin ON public.fe_groups(tenant_id, is_admin);