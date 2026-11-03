-- Marca o pedido cujo estoque já foi devolvido na Bagy (cancelamento ou exclusão), para nunca devolver duas vezes.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bagy_stock_restored_at timestamptz;
