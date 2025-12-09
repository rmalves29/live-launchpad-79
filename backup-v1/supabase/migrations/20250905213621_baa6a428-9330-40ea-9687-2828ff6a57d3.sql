-- Atualizar função para definir novo email master
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, tenant_role)
  VALUES (
    NEW.id, 
    NEW.email,
    CASE 
      WHEN NEW.email = 'rmalves21@hotmail.com' THEN 'master'::user_tenant_role
      ELSE 'user'::user_tenant_role
    END
  );
  RETURN NEW;
END;
$$;