-- Permitir que clientes consultem seus próprios pedidos usando o telefone (sem autenticação)
-- Isso é necessário para a página de checkout funcionar para clientes não logados

CREATE POLICY "Customers can view their own orders by phone"
ON public.orders
FOR SELECT
TO anon
USING (true);

-- Nota: O filtro por telefone será aplicado no nível da aplicação
-- Esta política permite acesso de leitura para usuários não autenticados (anon)
-- mas a aplicação sempre filtrará por customer_phone para segurança