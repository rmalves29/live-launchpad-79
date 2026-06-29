CREATE TRIGGER set_tenant_id_cart_items
BEFORE INSERT ON public.cart_items
FOR EACH ROW
EXECUTE FUNCTION public.auto_set_tenant_id();