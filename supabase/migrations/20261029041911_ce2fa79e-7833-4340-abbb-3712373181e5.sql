CREATE TABLE public.pagarme_recurring_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 price numeric(12,2) NOT NULL,
 cycles integer NOT NULL DEFAULT 12,
 pagarme_plan_id text NOT NULL,
 pagarme_link_id text NOT NULL UNIQUE,
 url text NOT NULL,
 status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pagarme_recurring_links TO authenticated;
GRANT ALL ON public.pagarme_recurring_links TO service_role;
ALTER TABLE public.pagarme_recurring_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins manage recurring links" ON public.pagarme_recurring_links FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());