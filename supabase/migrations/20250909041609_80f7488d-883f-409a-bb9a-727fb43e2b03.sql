-- Primeiro, vamos verificar se existem tenants e criar o perfil do usuário atual se necessário
DO $$ 
DECLARE
    user_email text;
    user_id uuid;
BEGIN
    -- Pegar email do usuário atual se autenticado
    SELECT auth.email() INTO user_email;
    SELECT auth.uid() INTO user_id;
    
    -- Se temos um usuário autenticado, criar o perfil se não existir
    IF user_id IS NOT NULL AND user_email IS NOT NULL THEN
        INSERT INTO profiles (id, email, role, tenant_id)
        VALUES (user_id, user_email, 'staff'::user_role, NULL)
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- Limpar tenants existentes que podem estar causando conflito de slug
DELETE FROM tenants;