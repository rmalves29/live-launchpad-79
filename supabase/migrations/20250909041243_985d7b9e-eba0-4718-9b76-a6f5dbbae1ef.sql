-- Permitir que usuários autenticados possam criar empresas (tenants)
DROP POLICY IF EXISTS "Super admin can manage all tenants" ON public.tenants;
DROP POLICY IF EXISTS "Users can view their own tenant" ON public.tenants;

-- Super admin pode gerenciar todas as empresas
CREATE POLICY "Super admin can manage all tenants" 
ON public.tenants 
FOR ALL 
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Usuários podem visualizar sua própria empresa
CREATE POLICY "Users can view their own tenant" 
ON public.tenants 
FOR SELECT 
TO authenticated
USING (id = get_current_tenant_id());

-- Usuários autenticados podem criar empresas
CREATE POLICY "Authenticated users can create tenants" 
ON public.tenants 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Usuários podem atualizar sua própria empresa
CREATE POLICY "Users can update their own tenant" 
ON public.tenants 
FOR UPDATE 
TO authenticated
USING (id = get_current_tenant_id())
WITH CHECK (id = get_current_tenant_id());