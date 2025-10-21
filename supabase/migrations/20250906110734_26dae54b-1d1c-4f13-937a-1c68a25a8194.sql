-- Atualizar perfil existente para master
UPDATE public.profiles 
SET tenant_role = 'master'::user_tenant_role
WHERE email = 'rmalves21@hotmail.com';