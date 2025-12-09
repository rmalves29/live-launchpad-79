-- Create trigger to automatically process paid orders
CREATE TRIGGER trigger_process_paid_order
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.process_paid_order();