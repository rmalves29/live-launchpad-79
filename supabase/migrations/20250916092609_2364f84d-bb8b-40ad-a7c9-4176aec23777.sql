-- Verificar e criar triggers necessários para processar pedidos pagos
DROP TRIGGER IF EXISTS process_paid_order_trigger ON orders;

-- Criar trigger para processar pedidos pagos (Melhor Envio e Bling)
CREATE TRIGGER process_paid_order_trigger
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION process_paid_order();

-- Criar trigger para adicionar tags APP em mensagens bulk
DROP TRIGGER IF EXISTS add_app_tag_on_bulk_message_trigger ON whatsapp_messages;

CREATE TRIGGER add_app_tag_on_bulk_message_trigger
  AFTER INSERT ON whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION add_app_tag_on_bulk_message();