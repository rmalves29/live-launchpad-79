-- Preparar para o usuário do tenant thaybiquini
-- Vamos verificar se já existe algum usuário com o email na tabela profiles

-- Se o usuário já existe no auth mas não tem profile, vamos criar
DO $$
DECLARE
    user_id_var uuid;
BEGIN
    -- Tentar encontrar o usuário no auth.users
    SELECT id INTO user_id_var 
    FROM auth.users 
    WHERE email = 'suporte.biquinidathay@gmail.com';
    
    -- Se encontrou o usuário mas ele não tem profile, criar
    IF user_id_var IS NOT NULL THEN
        INSERT INTO public.profiles (id, email, role, tenant_id, created_at, updated_at)
        VALUES (
            user_id_var,
            'suporte.biquinidathay@gmail.com',
            'tenant_admin'::user_role,
            '3c92bf57-a114-4690-b4cf-642078fc9df9'::uuid,
            now(),
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            tenant_id = '3c92bf57-a114-4690-b4cf-642078fc9df9'::uuid,
            role = 'tenant_admin'::user_role,
            updated_at = now();
            
        RAISE NOTICE 'Profile atualizado para usuário: %', user_id_var;
    ELSE
        RAISE NOTICE 'Usuário não encontrado no auth.users. Precisa ser criado manualmente no Supabase.';
    END IF;
END $$;