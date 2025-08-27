-- Adicionar campo para rastrear mensagens de item adicionado
ALTER TABLE orders 
ADD COLUMN item_added_message_sent BOOLEAN DEFAULT FALSE;

-- Adicionar campo para rastrear mensagens de pagamento confirmado
ALTER TABLE orders 
ADD COLUMN payment_confirmation_sent BOOLEAN DEFAULT FALSE;