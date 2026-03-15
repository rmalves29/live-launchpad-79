-- ============================================================
-- Fluxo de Envio - Execute no SQL Editor do Supabase
-- ============================================================

-- 1. fe_groups
CREATE TABLE IF NOT EXISTS public.fe_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_jid text NOT NULL,
  group_name text NOT NULL,
  invite_link text,
  participant_count integer DEFAULT 0,
  max_participants integer DEFAULT 256,
  is_entry_open boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, group_jid)
);
ALTER TABLE public.fe_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant manage fe_groups" ON public.fe_groups FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());
CREATE POLICY "Service role fe_groups" ON public.fe_groups FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. fe_campaigns
CREATE TABLE IF NOT EXISTS public.fe_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  is_entry_open boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, slug)
);
ALTER TABLE public.fe_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant manage fe_campaigns" ON public.fe_campaigns FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());
CREATE POLICY "Service role fe_campaigns" ON public.fe_campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Public read active campaigns" ON public.fe_campaigns FOR SELECT USING (is_active = true);

-- 3. fe_campaign_groups
CREATE TABLE IF NOT EXISTS public.fe_campaign_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.fe_campaigns(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.fe_groups(id) ON DELETE CASCADE,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, group_id)
);
ALTER TABLE public.fe_campaign_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant manage fe_campaign_groups" ON public.fe_campaign_groups FOR ALL USING (
  EXISTS (SELECT 1 FROM public.fe_campaigns c WHERE c.id = fe_campaign_groups.campaign_id AND (c.tenant_id = get_current_tenant_id() OR is_super_admin()))
);
CREATE POLICY "Service role fe_campaign_groups" ON public.fe_campaign_groups FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. fe_messages
CREATE TABLE IF NOT EXISTS public.fe_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.fe_campaigns(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.fe_groups(id) ON DELETE SET NULL,
  content_type text NOT NULL DEFAULT 'text' CHECK (content_type IN ('text','image','audio','video')),
  content_text text,
  media_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.fe_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant manage fe_messages" ON public.fe_messages FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());
CREATE POLICY "Service role fe_messages" ON public.fe_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. fe_link_clicks
CREATE TABLE IF NOT EXISTS public.fe_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.fe_campaigns(id) ON DELETE CASCADE,
  ip_hash text,
  user_agent text,
  redirected_group_id uuid REFERENCES public.fe_groups(id) ON DELETE SET NULL,
  clicked_at timestamptz DEFAULT now()
);
ALTER TABLE public.fe_link_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant view fe_link_clicks" ON public.fe_link_clicks FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.fe_campaigns c WHERE c.id = fe_link_clicks.campaign_id AND (c.tenant_id = get_current_tenant_id() OR is_super_admin()))
);
CREATE POLICY "Service role fe_link_clicks" ON public.fe_link_clicks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Public insert clicks" ON public.fe_link_clicks FOR INSERT WITH CHECK (true);

-- 6. fe_group_events
CREATE TABLE IF NOT EXISTS public.fe_group_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.fe_groups(id) ON DELETE SET NULL,
  group_jid text,
  phone text,
  event_type text NOT NULL CHECK (event_type IN ('join','leave')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.fe_group_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant view fe_group_events" ON public.fe_group_events FOR SELECT USING (tenant_id = get_current_tenant_id() OR is_super_admin());
CREATE POLICY "Service role fe_group_events" ON public.fe_group_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. fe_auto_messages
CREATE TABLE IF NOT EXISTS public.fe_auto_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.fe_groups(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('join','leave')),
  content_type text NOT NULL DEFAULT 'text' CHECK (content_type IN ('text','image','audio','video')),
  content_text text,
  media_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.fe_auto_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant manage fe_auto_messages" ON public.fe_auto_messages FOR ALL USING (tenant_id = get_current_tenant_id() OR is_super_admin());
CREATE POLICY "Service role fe_auto_messages" ON public.fe_auto_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Triggers updated_at
CREATE TRIGGER set_fe_groups_updated_at BEFORE UPDATE ON public.fe_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_fe_campaigns_updated_at BEFORE UPDATE ON public.fe_campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_fe_messages_updated_at BEFORE UPDATE ON public.fe_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_fe_auto_messages_updated_at BEFORE UPDATE ON public.fe_auto_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
