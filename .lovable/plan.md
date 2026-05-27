## Migration: Flags de métodos de pagamento

Adiciona colunas `enable_pix` e `enable_credit_card` (default `true`) nas 4 tabelas de integração de pagamento, e cria trigger que impede salvar com ambas desativadas.

### SQL

```sql
-- 1. Adicionar colunas (default true para não quebrar integrações existentes)
ALTER TABLE public.integration_mp
  ADD COLUMN IF NOT EXISTS enable_pix boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_credit_card boolean NOT NULL DEFAULT true;

ALTER TABLE public.integration_pagarme
  ADD COLUMN IF NOT EXISTS enable_pix boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_credit_card boolean NOT NULL DEFAULT true;

ALTER TABLE public.integration_appmax
  ADD COLUMN IF NOT EXISTS enable_pix boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_credit_card boolean NOT NULL DEFAULT true;

ALTER TABLE public.integration_infinitepay
  ADD COLUMN IF NOT EXISTS enable_pix boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_credit_card boolean NOT NULL DEFAULT true;

-- 2. Trigger: impede salvar com ambas as flags desativadas
CREATE OR REPLACE FUNCTION public.ensure_payment_method_enabled()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.enable_pix = false AND NEW.enable_credit_card = false THEN
    RAISE EXCEPTION 'Pelo menos um método de pagamento (PIX ou Cartão de Crédito) deve estar habilitado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_payment_method_enabled_mp ON public.integration_mp;
CREATE TRIGGER ensure_payment_method_enabled_mp
  BEFORE INSERT OR UPDATE ON public.integration_mp
  FOR EACH ROW EXECUTE FUNCTION public.ensure_payment_method_enabled();

DROP TRIGGER IF EXISTS ensure_payment_method_enabled_pagarme ON public.integration_pagarme;
CREATE TRIGGER ensure_payment_method_enabled_pagarme
  BEFORE INSERT OR UPDATE ON public.integration_pagarme
  FOR EACH ROW EXECUTE FUNCTION public.ensure_payment_method_enabled();

DROP TRIGGER IF EXISTS ensure_payment_method_enabled_appmax ON public.integration_appmax;
CREATE TRIGGER ensure_payment_method_enabled_appmax
  BEFORE INSERT OR UPDATE ON public.integration_appmax
  FOR EACH ROW EXECUTE FUNCTION public.ensure_payment_method_enabled();

DROP TRIGGER IF EXISTS ensure_payment_method_enabled_infinitepay ON public.integration_infinitepay;
CREATE TRIGGER ensure_payment_method_enabled_infinitepay
  BEFORE INSERT OR UPDATE ON public.integration_infinitepay
  FOR EACH ROW EXECUTE FUNCTION public.ensure_payment_method_enabled();
```

Sipag já possui `enable_pix` e `enable_credit_card` — fora do escopo.

Após aprovar, executo a migration. As alterações de UI (toggles nas integrações e ocultar métodos desativados no checkout) ficam para o próximo passo.
