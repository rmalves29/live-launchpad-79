-- Criar trigger para enviar mensagem quando item for adicionado ao carrinho
CREATE TRIGGER trigger_send_item_added_message
  AFTER INSERT ON cart_items
  FOR EACH ROW
  EXECUTE FUNCTION send_item_added_message();

-- Criar trigger para enviar mensagem quando item for deletado (produto cancelado)
CREATE TRIGGER trigger_send_product_canceled_message
  AFTER DELETE ON cart_items
  FOR EACH ROW
  EXECUTE FUNCTION send_product_canceled_message();