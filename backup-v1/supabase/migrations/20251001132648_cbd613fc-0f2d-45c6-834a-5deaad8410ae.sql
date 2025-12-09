-- Desabilitar o trigger automático (o envio será feito pelo frontend)
DROP TRIGGER IF EXISTS trigger_send_item_added_message_nodejs ON public.cart_items;
DROP FUNCTION IF EXISTS public.send_item_added_message_nodejs();