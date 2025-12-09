-- Adicionar políticas RLS para permitir acesso público aos cart_items e products do checkout

-- Permitir que qualquer um veja cart_items (já que o acesso é controlado pelo cart_id do pedido)
CREATE POLICY "Public can view cart items"
ON cart_items
FOR SELECT
USING (true);

-- Permitir que qualquer um veja products (já que são dados públicos de catálogo)
CREATE POLICY "Public can view products"
ON products
FOR SELECT
USING (true);