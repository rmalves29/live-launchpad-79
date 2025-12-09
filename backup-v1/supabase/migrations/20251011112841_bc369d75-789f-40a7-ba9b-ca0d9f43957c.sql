-- Adicionar valor 'individual' ao enum whatsapp_message_type
ALTER TYPE whatsapp_message_type ADD VALUE IF NOT EXISTS 'individual';

-- Comentário
COMMENT ON TYPE whatsapp_message_type IS 'Tipos de mensagens WhatsApp: incoming, outgoing, broadcast, system_log, bulk, mass, item_added, individual';