
CREATE TABLE public.help_tutorials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_key TEXT NOT NULL,
  title TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_help_tutorials_page_key ON public.help_tutorials(page_key, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.help_tutorials TO authenticated;
GRANT ALL ON public.help_tutorials TO service_role;

ALTER TABLE public.help_tutorials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage help tutorials"
ON public.help_tutorials FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "Authenticated can view help tutorials"
ON public.help_tutorials FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER update_help_tutorials_updated_at
BEFORE UPDATE ON public.help_tutorials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
