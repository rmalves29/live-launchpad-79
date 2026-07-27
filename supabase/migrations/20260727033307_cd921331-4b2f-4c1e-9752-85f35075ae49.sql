CREATE TABLE public.announcement_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  tenant_id UUID,
  tenant_name TEXT,
  seconds_watched INTEGER NOT NULL DEFAULT 0,
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.announcement_views TO authenticated;
GRANT ALL ON public.announcement_views TO service_role;

ALTER TABLE public.announcement_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user manages own announcement views"
ON public.announcement_views FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "super_admin reads announcement views"
ON public.announcement_views FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'::user_role));

CREATE INDEX idx_announcement_views_ann ON public.announcement_views(announcement_id);

CREATE OR REPLACE FUNCTION public.track_announcement_view(
  p_announcement_id UUID,
  p_tenant_id UUID,
  p_tenant_name TEXT,
  p_seconds INTEGER
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  INSERT INTO public.announcement_views (announcement_id, user_id, tenant_id, tenant_name, seconds_watched)
  VALUES (p_announcement_id, auth.uid(), p_tenant_id, p_tenant_name, GREATEST(COALESCE(p_seconds,0),0))
  ON CONFLICT (announcement_id, user_id) DO UPDATE
    SET seconds_watched = GREATEST(public.announcement_views.seconds_watched, EXCLUDED.seconds_watched),
        tenant_id = COALESCE(EXCLUDED.tenant_id, public.announcement_views.tenant_id),
        tenant_name = COALESCE(EXCLUDED.tenant_name, public.announcement_views.tenant_name),
        last_viewed_at = now();
END;
$$;