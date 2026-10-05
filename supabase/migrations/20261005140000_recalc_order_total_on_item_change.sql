-- Mantém orders.total_amount coerente quando um item do carrinho é removido ou muda de qtd/preço.
-- Causa: pedido 14226 ficou com total R$ 73 acima dos itens porque o recálculo feito pela tela falhou em silêncio.
-- Fórmula (a mesma da tela e do gatilho de pagamento): max(0, itens - coupon_discount) + frete da observação.
-- Só mexe em pedido NÃO pago e NÃO cancelado. Pedidos com [PIX_DISCOUNT] na observação (já no fluxo de pagamento)
-- ficam de fora: quem recalcula é o create-payment. Nunca bloqueia a operação do item.
CREATE OR REPLACE FUNCTION public.recalc_order_total_on_cart_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cart_id bigint;
  v_products numeric;
  v_freight numeric;
  v_line text;
  v_val text[];
  v_total numeric;
  r record;
BEGIN
  -- exclusões em cascata (ex.: apagar o carrinho inteiro) não precisam recalcular item a item
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_cart_id := COALESCE(NEW.cart_id, OLD.cart_id);
  IF v_cart_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(ci.qty * ci.unit_price), 0) INTO v_products
  FROM cart_items ci WHERE ci.cart_id = v_cart_id;

  -- sem itens: o pedido costuma ser apagado pela tela; não zera o total
  IF v_products = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR r IN
    SELECT o.id, o.tenant_id, o.observation, o.coupon_discount, o.total_amount
    FROM orders o
    WHERE o.cart_id = v_cart_id
      AND COALESCE(o.is_paid, false) = false
      AND COALESCE(o.is_cancelled, false) = false
    FOR UPDATE
  LOOP
    IF r.observation IS NOT NULL AND r.observation LIKE '%[PIX_DISCOUNT]%' THEN
      CONTINUE;
    END IF;

    v_freight := 0;
    IF r.observation IS NOT NULL THEN
      v_line := (regexp_match(r.observation, '(\[FRETE\][^\n]*)'))[1];
      IF v_line IS NOT NULL THEN
        v_val := regexp_match(v_line, 'R\$\s*([\d]+[.,][\d]{2})');
        IF v_val IS NOT NULL THEN
          v_freight := CAST(REPLACE(v_val[1], ',', '.') AS numeric);
        END IF;
      END IF;
    END IF;

    v_total := GREATEST(v_products - COALESCE(r.coupon_discount, 0), 0) + v_freight;

    IF ABS(COALESCE(r.total_amount, 0) - v_total) > 0.01 THEN
      UPDATE orders SET total_amount = v_total WHERE id = r.id;
      INSERT INTO audit_logs (entity, entity_id, action, tenant_id, meta)
      VALUES ('order', r.id::text, 'auto_recalc_total_on_item_change', r.tenant_id,
        jsonb_build_object('previous_total', r.total_amount, 'new_total', v_total,
          'products_subtotal', v_products, 'freight', v_freight,
          'coupon_discount', COALESCE(r.coupon_discount, 0), 'cart_id', v_cart_id));
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[recalc_order_total_on_cart_item_change] erro: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_order_total_on_item_change ON public.cart_items;
CREATE TRIGGER trg_recalc_order_total_on_item_change
  AFTER DELETE OR UPDATE OF qty, unit_price ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_total_on_cart_item_change();
