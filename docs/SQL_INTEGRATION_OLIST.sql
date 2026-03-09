-- =============================================================
-- Migration: integration_olist table + RLS
-- Execute this in the Supabase SQL Editor
-- =============================================================

CREATE TABLE IF NOT EXISTS public.integration_olist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id text,
  client_secret text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  sync_orders boolean NOT NULL DEFAULT false,
  sync_products boolean NOT NULL DEFAULT false,
  sync_stock boolean NOT NULL DEFAULT false,
  sync_invoices boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'production',
  is_active boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- Enable RLS
ALTER TABLE public.integration_olist ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same pattern as integration_bling)
CREATE POLICY "Tenant users can manage their Olist integration"
  ON public.integration_olist
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.tenant_id = integration_olist.tenant_id OR profiles.role = 'super_admin')
    )
  );

CREATE POLICY "Tenant users can view their Olist integration"
  ON public.integration_olist
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.tenant_id = integration_olist.tenant_id OR profiles.role = 'super_admin')
    )
  );

-- updated_at trigger
CREATE TRIGGER set_integration_olist_updated_at
  BEFORE UPDATE ON public.integration_olist
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
