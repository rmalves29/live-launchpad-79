-- Até 2 integrações de frete ativas por empresa; o pedido guarda de qual transportadora é.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_provider text;
COMMENT ON COLUMN public.orders.shipping_provider IS 'Integração de frete escolhida no checkout (melhor_envio, mandae, correios...). NULL = pedido antigo: usar a integração ativa da empresa.';

CREATE OR REPLACE FUNCTION public.enforce_max_active_shipping_integrations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_others integer;
BEGIN
  IF NEW.is_active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;
  -- evita corrida entre duas ativações simultâneas da mesma empresa
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text, 0));
  SELECT count(*) INTO v_others
  FROM public.shipping_integrations si
  WHERE si.tenant_id = NEW.tenant_id AND si.is_active = true AND si.id IS DISTINCT FROM NEW.id;
  IF v_others >= 2 THEN
    RAISE EXCEPTION 'Limite de 2 integrações de frete ativas por empresa. Desative uma antes de ativar outra.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_max_active_shipping_integrations ON public.shipping_integrations;
CREATE TRIGGER trg_max_active_shipping_integrations
  BEFORE INSERT OR UPDATE OF is_active ON public.shipping_integrations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_active_shipping_integrations();
