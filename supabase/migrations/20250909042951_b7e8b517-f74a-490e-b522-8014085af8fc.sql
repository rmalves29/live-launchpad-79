-- Vincular o usuário atual à empresa criada
UPDATE profiles 
SET tenant_id = (SELECT id FROM tenants LIMIT 1)
WHERE id = auth.uid();

-- Criar perfil se não existir
INSERT INTO profiles (id, email, role, tenant_id)
SELECT 
    auth.uid(), 
    auth.email(), 
    'staff'::user_role,
    (SELECT id FROM tenants LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid());