CREATE OR REPLACE FUNCTION public.audit_product_changes() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    INSERT INTO audit_logs (entity, entity_id, action, tenant_id, meta)
    VALUES ('product', NEW.id::text, 'name_changed', NEW.tenant_id,
      jsonb_build_object('code', NEW.code, 'old_name', OLD.name, 'new_name', NEW.name));
  END IF;

  IF OLD.price IS DISTINCT FROM NEW.price THEN
    INSERT INTO audit_logs (entity, entity_id, action, tenant_id, meta)
    VALUES ('product', NEW.id::text, 'price_changed', NEW.tenant_id,
      jsonb_build_object('code', NEW.code, 'old_price', OLD.price, 'new_price', NEW.price));
  END IF;

  IF OLD.code IS DISTINCT FROM NEW.code THEN
    INSERT INTO audit_logs (entity, entity_id, action, tenant_id, meta)
    VALUES ('product', NEW.id::text, 'code_changed', NEW.tenant_id,
      jsonb_build_object('old_code', OLD.code, 'new_code', NEW.code));
  END IF;

  IF OLD.stock IS DISTINCT FROM NEW.stock THEN
    INSERT INTO audit_logs (entity, entity_id, action, tenant_id, meta)
    VALUES ('product', NEW.id::text, 'stock_changed', NEW.tenant_id,
      jsonb_build_object(
        'code', NEW.code,
        'old_stock', OLD.stock,
        'new_stock', NEW.stock,
        'delta', (NEW.stock - OLD.stock),
        'direction', CASE WHEN NEW.stock > OLD.stock THEN 'entrada' ELSE 'saida' END
      ));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Registra o estoque inicial no cadastro do produto (quando criado com estoque > 0)
CREATE OR REPLACE FUNCTION public.audit_product_initial_stock() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock IS NOT NULL AND NEW.stock > 0 THEN
    INSERT INTO audit_logs (entity, entity_id, action, tenant_id, meta)
    VALUES ('product', NEW.id::text, 'stock_initial', NEW.tenant_id,
      jsonb_build_object(
        'code', NEW.code,
        'old_stock', 0,
        'new_stock', NEW.stock,
        'delta', NEW.stock,
        'direction', 'entrada'
      ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_product_initial_stock ON public.products;
CREATE TRIGGER trg_audit_product_initial_stock
AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.audit_product_initial_stock();