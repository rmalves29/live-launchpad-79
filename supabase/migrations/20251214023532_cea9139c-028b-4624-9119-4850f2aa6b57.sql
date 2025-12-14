-- Deduplicate paid order triggers to avoid multiple HTTP calls and timeouts
DROP TRIGGER IF EXISTS process_paid_order_trigger ON public.orders;
DROP TRIGGER IF EXISTS trigger_paid_order ON public.orders;