
CREATE OR REPLACE FUNCTION public.audit_cart_items_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_product RECORD;
  v_order_id bigint;
BEGIN
  -- Buscar tenant_id e order_id pelo carrinho
  IF TG_OP = 'DELETE' THEN
    SELECT tenant_id INTO v_tenant_id FROM carts WHERE id = OLD.cart_id;
    SELECT id INTO v_order_id FROM orders WHERE cart_id = OLD.cart_id ORDER BY id DESC LIMIT 1;
    SELECT id, code, name INTO v_product FROM products WHERE id = OLD.product_id;

    INSERT INTO audit_logs (entity, entity_id, action, tenant_id, meta)
    VALUES ('cart_item', OLD.id::text, 'deleted', v_tenant_id,
      jsonb_build_object(
        'cart_id', OLD.cart_id,
        'order_id', v_order_id,
        'product_id', OLD.product_id,
        'product_code', v_product.code,
        'product_name', v_product.name,
        'qty', OLD.qty,
        'unit_price', OLD.unit_price,
        'user_id', auth.uid()
      ));
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.qty IS DISTINCT FROM NEW.qty OR OLD.unit_price IS DISTINCT FROM NEW.unit_price THEN
      SELECT tenant_id INTO v_tenant_id FROM carts WHERE id = NEW.cart_id;
      SELECT id INTO v_order_id FROM orders WHERE cart_id = NEW.cart_id ORDER BY id DESC LIMIT 1;
      SELECT id, code, name INTO v_product FROM products WHERE id = NEW.product_id;

      INSERT INTO audit_logs (entity, entity_id, action, tenant_id, meta)
      VALUES ('cart_item', NEW.id::text, 'updated', v_tenant_id,
        jsonb_build_object(
          'cart_id', NEW.cart_id,
          'order_id', v_order_id,
          'product_id', NEW.product_id,
          'product_code', v_product.code,
          'product_name', v_product.name,
          'old_qty', OLD.qty,
          'new_qty', NEW.qty,
          'old_unit_price', OLD.unit_price,
          'new_unit_price', NEW.unit_price,
          'user_id', auth.uid()
        ));
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'INSERT' THEN
    SELECT tenant_id INTO v_tenant_id FROM carts WHERE id = NEW.cart_id;
    SELECT id INTO v_order_id FROM orders WHERE cart_id = NEW.cart_id ORDER BY id DESC LIMIT 1;
    SELECT id, code, name INTO v_product FROM products WHERE id = NEW.product_id;

    INSERT INTO audit_logs (entity, entity_id, action, tenant_id, meta)
    VALUES ('cart_item', NEW.id::text, 'inserted', v_tenant_id,
      jsonb_build_object(
        'cart_id', NEW.cart_id,
        'order_id', v_order_id,
        'product_id', NEW.product_id,
        'product_code', v_product.code,
        'product_name', v_product.name,
        'qty', NEW.qty,
        'unit_price', NEW.unit_price,
        'user_id', auth.uid()
      ));
    RETURN NEW;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[audit_cart_items_changes] erro: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_cart_items ON public.cart_items;
CREATE TRIGGER trg_audit_cart_items
AFTER INSERT OR UPDATE OR DELETE ON public.cart_items
FOR EACH ROW EXECUTE FUNCTION public.audit_cart_items_changes();
