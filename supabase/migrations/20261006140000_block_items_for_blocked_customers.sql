-- Cliente bloqueado não pode receber NOVOS itens em nenhum canal (bazar, live, WhatsApp, Instagram, lista de espera, tela interna).
-- A regra no banco vale para qualquer caminho, inclusive os que não checam o bloqueio no código.
-- Também registra em audit_logs quem bloqueou/desbloqueou e quando.

-- Chave de comparação de telefone: DDD + últimos 8 dígitos (ignora 55 e o 9º dígito).
CREATE OR REPLACE FUNCTION public.phone_match_key(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN d IS NULL OR length(d) < 10 THEN d
    ELSE left(d, 2) || right(d, 8)
  END
  FROM (
    SELECT CASE
      WHEN length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 12
           AND left(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 2) = '55'
        THEN substr(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 3)
      ELSE nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '')
    END AS d
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.block_items_for_blocked_customers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_phone text;
  v_key text;
BEGIN
  -- só interessa quando entra item novo ou a quantidade AUMENTA
  IF TG_OP = 'UPDATE' AND NOT (NEW.qty > OLD.qty) THEN
    RETURN NEW;
  END IF;

  SELECT c.tenant_id, c.customer_phone INTO v_tenant, v_phone
  FROM carts c WHERE c.id = NEW.cart_id;

  -- carrinho sem telefone real (ex.: comentário de Instagram sem cadastro, "@usuario")
  IF v_phone IS NULL OR v_phone LIKE '@%' THEN
    RETURN NEW;
  END IF;

  v_key := phone_match_key(v_phone);
  IF v_key IS NULL OR length(v_key) < 10 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM customers cu
    WHERE cu.tenant_id = v_tenant
      AND cu.is_blocked = true
      AND phone_match_key(cu.phone) = v_key
  ) THEN
    RAISE EXCEPTION 'CLIENTE_BLOQUEADO: não é possível adicionar itens para cliente bloqueado'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_items_for_blocked_customers ON public.cart_items;
CREATE TRIGGER trg_block_items_for_blocked_customers
  BEFORE INSERT OR UPDATE OF qty ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.block_items_for_blocked_customers();

-- Auditoria de bloqueio/desbloqueio
CREATE OR REPLACE FUNCTION public.audit_customer_block_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
    INSERT INTO audit_logs (entity, entity_id, action, tenant_id, meta)
    VALUES ('customer', NEW.id::text,
      CASE WHEN COALESCE(NEW.is_blocked, false) THEN 'blocked' ELSE 'unblocked' END,
      NEW.tenant_id,
      jsonb_build_object('customer_name', NEW.name, 'phone', NEW.phone,
        'from', COALESCE(OLD.is_blocked, false), 'to', COALESCE(NEW.is_blocked, false),
        'user_id', auth.uid()));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[audit_customer_block_change] erro: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_customer_block_change ON public.customers;
CREATE TRIGGER trg_audit_customer_block_change
  AFTER UPDATE OF is_blocked ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.audit_customer_block_change();
