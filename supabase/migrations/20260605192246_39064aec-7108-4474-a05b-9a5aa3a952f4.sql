
-- Funções security definer para evitar recursão na policy de UPDATE de profiles
CREATE OR REPLACE FUNCTION public.get_own_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.get_own_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tenant_id FROM public.profiles WHERE id = auth.uid() $$;

-- Recriar a policy sem subqueries diretas na própria tabela
DROP POLICY IF EXISTS "Users can update own profile (no role escalation)" ON public.profiles;

CREATE POLICY "Users can update own profile (no role escalation)"
ON public.profiles
FOR UPDATE
USING (id = (SELECT auth.uid()))
WITH CHECK (
  id = (SELECT auth.uid())
  AND role = public.get_own_role()
  AND tenant_id IS NOT DISTINCT FROM public.get_own_tenant_id()
);
