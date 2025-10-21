-- Add enum value for FINALIZAR and seed default templates per tenant
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace 
    WHERE n.nspname = 'public' AND t.typname = 'whatsapp_template_type'
  ) THEN
    RAISE NOTICE 'Enum whatsapp_template_type not found - skipping ALTER TYPE';
  END IF;
END $$;

ALTER TYPE public.whatsapp_template_type ADD VALUE IF NOT EXISTS 'FINALIZAR';

-- Seed FINALIZAR template for all active tenants if missing
INSERT INTO public.whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
SELECT 
  tenants.id,
  'FINALIZAR',
  'Finalização de Compra',
  'Perfeita a sua escolha! 💖 Já deixei separada.\nPara pagar agora: clique no link, coloque o seu telefone.\n👉 https://app.orderzaps.com/checkout',
  now(),
  now()
FROM public.tenants
WHERE tenants.is_active = true
AND NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates t 
  WHERE t.type = 'FINALIZAR' AND t.tenant_id = tenants.id
);