-- Adicionar campo para identificar grupo de WhatsApp nos pedidos
ALTER TABLE orders ADD COLUMN whatsapp_group_name TEXT;

-- Adicionar campo para identificar grupo de WhatsApp nas mensagens
ALTER TABLE whatsapp_messages ADD COLUMN whatsapp_group_name TEXT;

-- Criar índice para otimizar consultas por grupo
CREATE INDEX idx_orders_whatsapp_group ON orders(whatsapp_group_name);
CREATE INDEX idx_whatsapp_messages_group ON whatsapp_messages(whatsapp_group_name);

-- Atualizar alguns dados existentes com grupos exemplo (baseado no event_type)
UPDATE orders SET whatsapp_group_name = CASE 
  WHEN event_type = 'BAZAR' THEN 'Grupo Bazar'
  WHEN event_type = 'MANUAL' THEN 'Grupo Manual'
  ELSE 'Grupo Geral'
END;