-- Recriar o trigger para processar pedidos pagos
CREATE TRIGGER trigger_process_paid_order
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (NEW.is_paid = true AND (OLD.is_paid = false OR OLD.is_paid IS NULL))
  EXECUTE FUNCTION process_paid_order();