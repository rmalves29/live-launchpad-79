# Migração: Adicionar tenant_id às tabelas gifts e coupons

Execute o SQL abaixo no Supabase SQL Editor para corrigir o isolamento de dados por tenant:

```sql
-- =====================================================
-- MIGRAÇÃO: Adicionar tenant_id às tabelas gifts e coupons
-- Isso corrige o problema de dados aparecerem para todas as tenants
-- =====================================================

-- 1. Adicionar coluna tenant_id à tabela gifts
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

-- 2. Adicionar coluna tenant_id à tabela coupons  
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

-- 3. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_gifts_tenant_id ON gifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_coupons_tenant_id ON coupons(tenant_id);

-- 4. Atualizar RLS policies para gifts
DROP POLICY IF EXISTS "Anyone can view active gifts" ON gifts;
DROP POLICY IF EXISTS "Authenticated users can manage gifts" ON gifts;

CREATE POLICY "Tenant users can view their gifts" ON gifts
  FOR SELECT USING (
    tenant_id = get_current_tenant_id() OR is_super_admin()
  );

CREATE POLICY "Tenant users can manage their gifts" ON gifts
  FOR ALL USING (
    tenant_id = get_current_tenant_id() OR is_super_admin()
  );

CREATE POLICY "Public can view active tenant gifts" ON gifts
  FOR SELECT USING (is_active = true);

-- 5. Atualizar RLS policies para coupons
DROP POLICY IF EXISTS "Anyone can view active coupons" ON coupons;
DROP POLICY IF EXISTS "Authenticated users can manage coupons" ON coupons;

CREATE POLICY "Tenant users can view their coupons" ON coupons
  FOR SELECT USING (
    tenant_id = get_current_tenant_id() OR is_super_admin()
  );

CREATE POLICY "Tenant users can manage their coupons" ON coupons
  FOR ALL USING (
    tenant_id = get_current_tenant_id() OR is_super_admin()
  );

CREATE POLICY "Public can view active tenant coupons" ON coupons
  FOR SELECT USING (is_active = true);

-- 6. (OPCIONAL) Associar registros existentes a um tenant específico
-- Substitua 'SEU_TENANT_ID' pelo UUID do tenant que deve receber os registros existentes
-- UPDATE gifts SET tenant_id = 'SEU_TENANT_ID' WHERE tenant_id IS NULL;
-- UPDATE coupons SET tenant_id = 'SEU_TENANT_ID' WHERE tenant_id IS NULL;
```

## Após executar o SQL

1. Execute o SQL acima no Supabase SQL Editor
2. Associe os registros existentes ao tenant correto (passo 6)
3. O sistema passará a isolar automaticamente gifts e coupons por tenant
