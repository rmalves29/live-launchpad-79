-- Adicionar colunas para rastreamento de status de entrega do Z-API nas mensagens
ALTER TABLE whatsapp_messages 
ADD COLUMN IF NOT EXISTS zapi_message_id TEXT,
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'PENDING';

-- Criar índice para busca rápida por zapi_message_id
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_zapi_message_id 
ON whatsapp_messages(zapi_message_id) 
WHERE zapi_message_id IS NOT NULL;

-- Adicionar colunas nas orders para rastrear se as mensagens foram realmente entregues
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS item_added_delivered BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS payment_confirmation_delivered BOOLEAN DEFAULT FALSE;

-- Comentários para documentação
COMMENT ON COLUMN whatsapp_messages.zapi_message_id IS 'ID da mensagem retornado pelo Z-API';
COMMENT ON COLUMN whatsapp_messages.delivery_status IS 'Status: PENDING, SENT, RECEIVED, READ, PLAYED';