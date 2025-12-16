-- Trigger para fechar o carrinho quando o pedido for pago
CREATE OR REPLACE FUNCTION public.close_cart_on_paid_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Se o pedido foi marcado como pago e tem um cart_id
  IF NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL) AND NEW.cart_id IS NOT NULL THEN
    -- Fechar o carrinho associado
    UPDATE public.carts
    SET status = 'CLOSED'
    WHERE id = NEW.cart_id;
    
    RAISE LOG 'Carrinho % fechado após pagamento do pedido %', NEW.cart_id, NEW.id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Criar o trigger
DROP TRIGGER IF EXISTS trigger_close_cart_on_paid ON public.orders;
CREATE TRIGGER trigger_close_cart_on_paid
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.close_cart_on_paid_order();