-- =============================================================
-- Migration: integration_bagy table + bagy_order_id column + RLS
-- Execute this in the Supabase SQL Editor
-- =============================================================

-- Tabela de integração Bagy (Dooca Commerce)
CREATE TABLE IF NOT EXISTS public.integration_bagy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  access_token text,
  is_active boolean NOT NULL DEFAULT false,
  sync_orders_out boolean NOT NULL DEFAULT true,
  sync_stock boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- Enable RLS
ALTER TABLE public.integration_bagy ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Tenant users can manage their Bagy integration"
  ON public.integration_bagy
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.tenant_id = integration_bagy.tenant_id OR profiles.role = 'super_admin')
    )
  );

-- updated_at trigger
CREATE TRIGGER set_integration_bagy_updated_at
  BEFORE UPDATE ON public.integration_bagy
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Coluna bagy_order_id na tabela orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bagy_order_id bigint;
