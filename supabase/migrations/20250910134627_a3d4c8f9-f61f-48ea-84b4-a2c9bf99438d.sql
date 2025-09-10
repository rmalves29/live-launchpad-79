-- Criar usuários para todos os tenants ativos
-- Só inserir se não existirem ainda

-- Usuário para MANIA DE MULHER (app)
INSERT INTO profiles (id, email, role, tenant_id)
SELECT gen_random_uuid(), 'admin@maniademulher.com', 'admin'::user_role, '08f2b1b9-3988-489e-8186-c60f0c0b0622'
WHERE NOT EXISTS (
  SELECT 1 FROM profiles WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622' AND role = 'admin'
);

-- Usuário para BIQUINI DA TAHY (thaybiquini) 
INSERT INTO profiles (id, email, role, tenant_id)
SELECT gen_random_uuid(), 'admin@thaybiquini.com', 'admin'::user_role, 'a5bda88f-11ec-4043-85b7-6ba242821119'
WHERE NOT EXISTS (
  SELECT 1 FROM profiles WHERE tenant_id = 'a5bda88f-11ec-4043-85b7-6ba242821119' AND role = 'admin'
);

-- Atualizar função para melhor suporte a multi-tenant
CREATE OR REPLACE FUNCTION public.get_effective_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
    user_tenant_id uuid;
    user_role user_role;
BEGIN
    -- Obter informações do usuário atual
    SELECT tenant_id, role INTO user_tenant_id, user_role
    FROM profiles 
    WHERE id = auth.uid();
    
    -- Se for super_admin, pode acessar qualquer tenant (será definido via contexto da aplicação)
    -- Se for admin ou staff, usar o tenant_id do perfil
    RETURN user_tenant_id;
END;
$$;