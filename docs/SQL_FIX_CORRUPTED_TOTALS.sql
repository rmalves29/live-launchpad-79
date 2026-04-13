-- ===============================================
-- CORREÇÃO EM MASSA: Pedidos com total corrompido
-- pela trigger validate_order_total_on_payment (regex greedy)
-- 
-- A trigger antiga capturava o valor do [COUPON_DISCOUNT] como frete,
-- somando ao invés de subtrair. São 40 pedidos afetados.
--
-- EXECUTE NO SUPABASE SQL EDITOR
-- ===============================================

-- PASSO 1: Atualizar a trigger para usar regex por linha (fix definitivo)
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
      -- Extrair APENAS a linha do frete
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

-- PASSO 2: Corrigir os 40 pedidos afetados
UPDATE orders SET total_amount = 71.99 WHERE id = 3213;
UPDATE orders SET total_amount = 75.08 WHERE id = 3287;
UPDATE orders SET total_amount = 49.90 WHERE id = 3291;
UPDATE orders SET total_amount = 79.80 WHERE id = 3292;
UPDATE orders SET total_amount = 89.70 WHERE id = 3314;
UPDATE orders SET total_amount = 84.70 WHERE id = 3378;
UPDATE orders SET total_amount = 64.70 WHERE id = 3391;
UPDATE orders SET total_amount = 49.90 WHERE id = 3462;
UPDATE orders SET total_amount = 74.70 WHERE id = 3515;
UPDATE orders SET total_amount = 87.91 WHERE id = 3916;
UPDATE orders SET total_amount = 164.11 WHERE id = 4075;
UPDATE orders SET total_amount = 12.70 WHERE id = 4185;
UPDATE orders SET total_amount = 49.80 WHERE id = 4198;
UPDATE orders SET total_amount = 49.60 WHERE id = 4308;
UPDATE orders SET total_amount = 349.64 WHERE id = 4373;
UPDATE orders SET total_amount = 200.30 WHERE id = 4374;
UPDATE orders SET total_amount = 124.87 WHERE id = 4390;
UPDATE orders SET total_amount = 210.79 WHERE id = 4411;
UPDATE orders SET total_amount = 124.92 WHERE id = 4423;
UPDATE orders SET total_amount = 132.92 WHERE id = 4424;
UPDATE orders SET total_amount = 47.11 WHERE id = 4425;
UPDATE orders SET total_amount = 31.25 WHERE id = 4432;
UPDATE orders SET total_amount = 187.87 WHERE id = 4437;
UPDATE orders SET total_amount = 91.17 WHERE id = 4441;
UPDATE orders SET total_amount = 295.71 WHERE id = 4445;
UPDATE orders SET total_amount = 277.52 WHERE id = 4485;
UPDATE orders SET total_amount = 245.03 WHERE id = 4494;
UPDATE orders SET total_amount = 63.36 WHERE id = 4495;
UPDATE orders SET total_amount = 59.05 WHERE id = 4533;
UPDATE orders SET total_amount = 92.06 WHERE id = 4563;
UPDATE orders SET total_amount = 129.40 WHERE id = 4634;
UPDATE orders SET total_amount = 198.30 WHERE id = 4800;
UPDATE orders SET total_amount = 14.80 WHERE id = 4848;
UPDATE orders SET total_amount = 127.76 WHERE id = 4869;
UPDATE orders SET total_amount = 31.92 WHERE id = 4870;
UPDATE orders SET total_amount = 9.80 WHERE id = 5103;
UPDATE orders SET total_amount = 60.39 WHERE id = 5171;
UPDATE orders SET total_amount = 39.60 WHERE id = 5185;
UPDATE orders SET total_amount = 125.80 WHERE id = 5247;
UPDATE orders SET total_amount = 110.88 WHERE id = 5266;

-- FIM
