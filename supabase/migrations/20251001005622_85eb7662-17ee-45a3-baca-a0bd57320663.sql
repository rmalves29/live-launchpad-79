-- Corrigir search_path das funções de trigger
ALTER FUNCTION send_item_added_message() SET search_path = public;
ALTER FUNCTION send_product_canceled_message() SET search_path = public;