-- Campos essenciais para OAuth
ALTER TABLE public.shipping_integrations
  ADD COLUMN IF NOT EXISTS refresh_token   text,
  ADD COLUMN IF NOT EXISTS expires_at      timestamptz,
  ADD COLUMN IF NOT EXISTS token_type      text DEFAULT 'Bearer',
  ADD COLUMN IF NOT EXISTS scope           text;

-- Operacionais (opcionais, mas úteis)
ALTER TABLE public.shipping_integrations
  ADD COLUMN IF NOT EXISTS account_id      bigint,
  ADD COLUMN IF NOT EXISTS company_id      bigint,
  ADD COLUMN IF NOT EXISTS webhook_id      bigint;

-- Defaults práticos
ALTER TABLE public.shipping_integrations
  ALTER COLUMN sandbox   SET DEFAULT false,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

-- Índice/constraint para evitar duplicidade por tenant+provider
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'shipping_integrations_tenant_provider_key'
  ) THEN
    ALTER TABLE public.shipping_integrations
      ADD CONSTRAINT shipping_integrations_tenant_provider_key
      UNIQUE (tenant_id, provider);
  END IF;
END $$;

-- Trigger para manter updated_at sempre atualizado
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shipping_integrations_updated_at ON public.shipping_integrations;
CREATE TRIGGER trg_shipping_integrations_updated_at
BEFORE UPDATE ON public.shipping_integrations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();