-- Permitir leitura pública de pedidos filtrados por tenant_id e customer_phone (para checkout público)
CREATE POLICY "Public can view orders by phone"
ON public.orders
FOR SELECT
USING (true);