-- Remove trigger duplicado que está causando erro
-- O frontend já envia a mensagem via whatsappService

DROP TRIGGER IF EXISTS trigger_send_product_canceled_message ON cart_items;

DROP FUNCTION IF EXISTS send_product_canceled_message();

-- Remover a edge function antiga do config.toml também será necessário