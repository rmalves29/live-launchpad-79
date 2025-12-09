-- Create trigger to process orders marked as paid
DROP TRIGGER IF EXISTS trg_process_paid_order ON public.orders;

CREATE TRIGGER trg_process_paid_order
AFTER UPDATE OF is_paid ON public.orders
FOR EACH ROW
WHEN (NEW.is_paid = true AND (OLD.is_paid IS DISTINCT FROM true))
EXECUTE FUNCTION public.process_paid_order();