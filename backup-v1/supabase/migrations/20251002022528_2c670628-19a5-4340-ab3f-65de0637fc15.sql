-- Criar trigger para enviar mensagem quando produto for cancelado (deletado do carrinho)
DROP TRIGGER IF EXISTS trigger_send_product_canceled ON cart_items;

CREATE TRIGGER trigger_send_product_canceled
  AFTER DELETE ON cart_items
  FOR EACH ROW
  EXECUTE FUNCTION send_product_canceled_message();