-- =============================================================
-- Migration: integration_omie table + orders columns for Omie sync
-- Execute this in the Supabase SQL Editor
-- =============================================================

-- 1. Tabela integration_omie
CREATE TABLE IF NOT EXISTS public.integration_omie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  app_key text,
  app_secret text,
  sync_orders boolean NOT NULL DEFAULT true,
  sync_products boolean NOT NULL DEFAULT true,
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
ALTER TABLE public.integration_omie ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Tenant users can manage their Omie integration"
  ON public.integration_omie
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.tenant_id = integration_omie.tenant_id OR profiles.role = 'super_admin')
    )
  );

CREATE POLICY "Tenant users can view their Omie integration"
  ON public.integration_omie
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.tenant_id = integration_omie.tenant_id OR profiles.role = 'super_admin')
    )
  );

-- updated_at trigger
CREATE TRIGGER set_integration_omie_updated_at
  BEFORE UPDATE ON public.integration_omie
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Colunas na tabela orders para rastreio Omie
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS omie_order_id bigint;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS omie_sync_status text;
