-- A limpeza de seguranca removeu a policy aberta "Service role full access to sendflow_tasks", que sem querer deixava o
-- super admin (perfil sem tenant_id) gravar e ler a fila. Agora ele tem uma policy propria, restrita a super admin.
DROP POLICY IF EXISTS "Super admin can manage all sendflow_tasks" ON public.sendflow_tasks;
CREATE POLICY "Super admin can manage all sendflow_tasks" ON public.sendflow_tasks
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
