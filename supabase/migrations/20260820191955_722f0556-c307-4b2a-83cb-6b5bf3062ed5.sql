ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT FALSE;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
GRANT SELECT ON public.products TO anon;