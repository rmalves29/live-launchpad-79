-- ===============================================
-- MIGRAÇÃO: Atualizar trigger validate_order_total_on_payment
-- para reconhecer tags [PIX_DISCOUNT] e [COUPON_DISCOUNT]
-- e usar regex POR LINHA (evita captura cruzada)
-- Execute este SQL no Supabase SQL Editor
-- ===============================================

CREATE OR REPLACE FUNCTION public.validate_order_total_on_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_products_total numeric := 0;
  v_freight numeric := 0;
  v_pix_discount numeric := 0;
  v_coupon_discount numeric := 0;
  v_correct_total numeric;
  v_freight_line text;
  v_pix_line text;
  v_coupon_line text;
  v_val_match text[];
BEGIN
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) THEN
    IF NEW.cart_id IS NOT NULL THEN
      SELECT COALESCE(SUM(ci.qty * ci.unit_price), 0) INTO v_products_total
      FROM cart_items ci WHERE ci.cart_id = NEW.cart_id;
    END IF;
    IF v_products_total = 0 THEN RETURN NEW; END IF;

    IF NEW.observation IS NOT NULL THEN
      -- Extrair APENAS a linha do frete (evita capturar valores de outras tags)
      v_freight_line := (regexp_match(NEW.observation, '(\[FRETE\][^\n]*)'))[1];
      IF v_freight_line IS NOT NULL THEN
        v_val_match := regexp_match(v_freight_line, 'R\$\s*([\d]+[.,][\d]{2})');
        IF v_val_match IS NOT NULL THEN
          v_freight := CAST(REPLACE(v_val_match[1], ',', '.') AS numeric);
        END IF;
      END IF;

      -- Extrair APENAS a linha do desconto PIX
      v_pix_line := (regexp_match(NEW.observation, '(\[PIX_DISCOUNT\][^\n]*)'))[1];
      IF v_pix_line IS NOT NULL THEN
        v_val_match := regexp_match(v_pix_line, 'R\$\s*([\d]+[.,][\d]{2})');
        IF v_val_match IS NOT NULL THEN
          v_pix_discount := CAST(REPLACE(v_val_match[1], ',', '.') AS numeric);
        END IF;
      END IF;

      -- Extrair APENAS a linha do desconto cupom
      v_coupon_line := (regexp_match(NEW.observation, '(\[COUPON_DISCOUNT\][^\n]*)'))[1];
      IF v_coupon_line IS NOT NULL THEN
        v_val_match := regexp_match(v_coupon_line, 'R\$\s*([\d]+[.,][\d]{2})');
        IF v_val_match IS NOT NULL THEN
          v_coupon_discount := CAST(REPLACE(v_val_match[1], ',', '.') AS numeric);
        END IF;
      END IF;
    END IF;

    v_correct_total := GREATEST(v_products_total - v_pix_discount - v_coupon_discount, 0) + v_freight;

    IF ABS(NEW.total_amount - v_correct_total) > 0.01 THEN
      RAISE LOG '[validate_order_total] Pedido #% - era %, corrigido para % (produtos=%, frete=%, pix_discount=%, coupon_discount=%)', 
        NEW.id, NEW.total_amount, v_correct_total, v_products_total, v_freight, v_pix_discount, v_coupon_discount;
      INSERT INTO audit_logs (entity, entity_id, action, tenant_id, meta)
      VALUES ('order', NEW.id::text, 'auto_fix_total_on_payment', NEW.tenant_id,
        jsonb_build_object('previous_total', NEW.total_amount, 'corrected_total', v_correct_total,
          'products_subtotal', v_products_total, 'freight', v_freight,
          'pix_discount', v_pix_discount, 'coupon_discount', v_coupon_discount));
      NEW.total_amount := v_correct_total;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
