-- Criar perfis para usuários existentes que não têm perfil
INSERT INTO public.profiles (id, email, tenant_role)
SELECT 
  au.id,
  au.email,
  CASE 
    WHEN au.email = 'rafael@maniadmulher.com' THEN 'master'::user_tenant_role
    ELSE 'user'::user_tenant_role
  END as tenant_role
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL;

-- Garantir que a função handle_new_user está funcionando corretamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, tenant_role)
  VALUES (
    NEW.id, 
    NEW.email,
    CASE 
      WHEN NEW.email = 'rafael@maniadmulher.com' THEN 'master'::user_tenant_role
      ELSE 'user'::user_tenant_role
    END
  );
  RETURN NEW;
END;
$$;