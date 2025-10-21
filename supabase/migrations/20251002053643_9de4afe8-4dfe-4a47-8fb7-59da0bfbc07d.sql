-- Garantir que o trigger esteja ativo na tabela orders
DROP TRIGGER IF EXISTS trigger_paid_order ON public.orders;

CREATE TRIGGER trigger_paid_order
  AFTER UPDATE OF is_paid ON public.orders
  FOR EACH ROW
  WHEN (NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL))
  EXECUTE FUNCTION public.process_paid_order();