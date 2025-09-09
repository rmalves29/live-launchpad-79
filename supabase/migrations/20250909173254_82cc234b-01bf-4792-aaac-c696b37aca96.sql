-- Criar um usuário super admin inicial
-- Primeiro, vou inserir um registro na tabela profiles diretamente
-- com um ID fixo para o super admin

-- Inserir perfil do super admin
INSERT INTO public.profiles (id, email, role, tenant_id, created_at, updated_at) 
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'suporte.biquinidathay@gmail.com',
  'super_admin',
  null,
  now(),
  now()
) 
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  updated_at = now();

-- Criar função para configurar senha do super admin
CREATE OR REPLACE FUNCTION public.setup_super_admin_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_exists boolean;
BEGIN
  -- Verificar se o usuário já existe
  SELECT EXISTS(
    SELECT 1 FROM auth.users 
    WHERE email = 'suporte.biquinidathay@gmail.com'
  ) INTO user_exists;
  
  -- Se não existir, criar via Edge Function
  -- (não podemos criar usuários diretamente no SQL por limitações de segurança)
  IF NOT user_exists THEN
    RAISE NOTICE 'Super admin user needs to be created via Edge Function';
  END IF;
END;
$$;