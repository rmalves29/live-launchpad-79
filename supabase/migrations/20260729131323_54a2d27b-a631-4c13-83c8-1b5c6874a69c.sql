CREATE TABLE public.instagram_lives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  media_id text NOT NULL,
  permalink text,
  status text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  comments_count_api integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT instagram_lives_tenant_media_key UNIQUE (tenant_id, media_id)
);

GRANT SELECT ON public.instagram_lives TO authenticated;
GRANT ALL ON public.instagram_lives TO service_role;

ALTER TABLE public.instagram_lives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their lives"
ON public.instagram_lives FOR SELECT
USING ((tenant_id = get_current_tenant_id()) OR is_super_admin());

CREATE POLICY "Service role can manage lives"
ON public.instagram_lives FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_instagram_lives_tenant_started ON public.instagram_lives (tenant_id, started_at DESC);

ALTER TABLE public.instagram_live_comments
  ADD COLUMN IF NOT EXISTS order_id bigint,
  ADD COLUMN IF NOT EXISTS matched_qty integer;

CREATE INDEX IF NOT EXISTS idx_ig_live_comments_tenant_media
  ON public.instagram_live_comments (tenant_id, media_id, created_at DESC);

CREATE TRIGGER trg_instagram_lives_updated_at
BEFORE UPDATE ON public.instagram_lives
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();