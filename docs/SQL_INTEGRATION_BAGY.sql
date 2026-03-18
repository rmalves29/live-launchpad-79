-- =============================================================
-- Migration: integration_bagy table + bagy_order_id column + RLS
-- + Trigger para exportação automática ao pagar
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

-- =============================================================
-- Trigger: auto-exportar pedido para Bagy quando pago
-- =============================================================

CREATE OR REPLACE FUNCTION public.export_paid_order_to_bagy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_integration RECORD;
  v_supabase_url TEXT;
  v_response http_response;
BEGIN
  -- Só processar quando is_paid muda para true
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) THEN

    -- Verificar se tenant tem integração Bagy ativa com sync_orders_out habilitado
    SELECT * INTO v_integration
    FROM public.integration_bagy
    WHERE tenant_id = NEW.tenant_id
      AND is_active = true
      AND sync_orders_out = true;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';

    BEGIN
      SELECT * INTO v_response FROM http_post(
        v_supabase_url || '/functions/v1/bagy-sync',
        jsonb_build_object(
          'tenant_id', NEW.tenant_id,
          'action', 'export_order',
          'order_id', NEW.id
        )::text,
        'application/json'
      );

      RAISE LOG '[bagy-auto-export] Pedido #% exportado para Bagy - Status: %', NEW.id, v_response.status;

    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[bagy-auto-export] Erro ao exportar pedido #% para Bagy: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger na tabela orders
CREATE TRIGGER trigger_export_paid_order_to_bagy
  AFTER UPDATE OF is_paid ON public.orders
  FOR EACH ROW
  WHEN (NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL))
  EXECUTE FUNCTION public.export_paid_order_to_bagy();
