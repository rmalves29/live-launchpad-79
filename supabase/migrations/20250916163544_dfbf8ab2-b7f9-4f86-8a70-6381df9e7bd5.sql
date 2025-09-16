-- Create trigger to automatically process paid orders for Melhor Envio integration
CREATE OR REPLACE TRIGGER trigger_process_paid_order
    AFTER UPDATE ON public.orders
    FOR EACH ROW
    WHEN (NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL))
    EXECUTE FUNCTION public.process_paid_order();