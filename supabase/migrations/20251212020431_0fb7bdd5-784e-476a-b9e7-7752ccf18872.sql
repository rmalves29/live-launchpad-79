-- Corrigir o profile do usuário ofbeautycosmeticos@gmail.com
-- Associar ao tenant OF Beauty
UPDATE profiles
SET
  role = 'tenant_admin',
  tenant_id = '4247aa21-4a46-4988-8845-fa15aa202310',
  updated_at = now()
WHERE id = 'dd7fef04-155e-439f-b4c5-2e4d7d7c2838';

-- Atualizar o tenant OF Beauty com o admin correto
UPDATE tenants
SET
  admin_email = 'ofbeautycosmeticos@gmail.com',
  admin_user_id = 'dd7fef04-155e-439f-b4c5-2e4d7d7c2838',
  updated_at = now()
WHERE id = '4247aa21-4a46-4988-8845-fa15aa202310';