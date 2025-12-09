# 🗄️ SQL COMPLETO - Executar no Supabase (EM ORDEM)

Este documento contém **TODOS os SQLs** que você precisa executar no Supabase, **NA ORDEM CORRETA**.

⚠️ **IMPORTANTE:** Execute um bloco de cada vez e aguarde a conclusão antes de passar para o próximo!

---

## 📋 Checklist de Execução

- [ ] Bloco 1: Atualizar tabela tenants e adicionar tenant_id
- [ ] Bloco 2: Criar índices compostos
- [ ] Bloco 3: Habilitar RLS
- [ ] Bloco 4: Criar funções auxiliares
- [ ] Bloco 5: Criar triggers
- [ ] Bloco 6: Criar RLS policies
- [ ] Bloco 7: Criar tenant APP e controle de acesso
- [ ] Bloco 8: Associar super admin
- [ ] Bloco 9: Verificação final

---

## 🎯 Como Executar

1. Acesse: **https://supabase.com/dashboard/project/SEU-PROJETO/sql**
2. Copie um bloco de cada vez
3. Cole no SQL Editor
4. Clique em **RUN**
5. Aguarde o resultado
6. Marque o checkbox ✅
7. Passe para o próximo bloco

---

# BLOCO 1: ATUALIZAR TABELA TENANTS E ADICIONAR TENANT_ID

```sql
-- =====================================================
-- BLOCO 1: Estrutura Base do Multi-Tenant
-- =====================================================
-- Tempo estimado: 2-3 minutos
-- =====================================================

-- Adicionar campos na tabela tenants (se não existirem)
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS subdomain TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#3B82F6',
ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#10B981',
ADD COLUMN IF NOT EXISTS enable_live BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS enable_sendflow BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS slug TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS max_products INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS max_orders INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Adicionar tenant_id em TODAS as tabelas principais
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE customer_tags ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE customer_tag_assignments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE customer_whatsapp_groups ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE carts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE coupon_usage ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE frete_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE frete_cotacoes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE frete_envios ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE whatsapp_groups ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE sorteios ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sorteio_participantes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sorteio_ganhadores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE etiquetas ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE etiqueta_prints ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
```

**✅ Resultado esperado:** `ALTER TABLE` para cada comando

---

# BLOCO 2: CRIAR ÍNDICES COMPOSTOS

```sql
-- =====================================================
-- BLOCO 2: Índices para Performance
-- =====================================================
-- Tempo estimado: 1-2 minutos
-- =====================================================

-- Índices na tabela tenants
CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON tenants(is_active) WHERE is_active = true;

-- Índices compostos com tenant_id (CRITICAL para performance)
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_email ON customers(tenant_id, email);

CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_tenant_active ON products(tenant_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_customer ON orders(tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_carts_tenant ON carts(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cart_items_tenant ON cart_items(tenant_id, cart_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant ON whatsapp_messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_tenant ON whatsapp_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_tenant ON whatsapp_connections(tenant_id);

CREATE INDEX IF NOT EXISTS idx_coupons_tenant ON coupons(tenant_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_coupon_usage_tenant ON coupon_usage(tenant_id, coupon_id);

CREATE INDEX IF NOT EXISTS idx_sorteios_tenant ON sorteios(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sorteio_participantes_tenant ON sorteio_participantes(tenant_id, sorteio_id);
```

**✅ Resultado esperado:** `CREATE INDEX` para cada comando

---

# BLOCO 3: HABILITAR RLS EM TODAS AS TABELAS

```sql
-- =====================================================
-- BLOCO 3: Habilitar Row Level Security (RLS)
-- =====================================================
-- Tempo estimado: 30 segundos
-- =====================================================

-- Habilitar RLS em TODAS as tabelas
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_whatsapp_groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;

ALTER TABLE frete_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE frete_cotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE frete_envios ENABLE ROW LEVEL SECURITY;

ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE sorteios ENABLE ROW LEVEL SECURITY;
ALTER TABLE sorteio_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sorteio_ganhadores ENABLE ROW LEVEL SECURITY;

ALTER TABLE etiquetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE etiqueta_prints ENABLE ROW LEVEL SECURITY;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
```

**✅ Resultado esperado:** `ALTER TABLE` para cada comando

---

# BLOCO 4: CRIAR FUNÇÕES AUXILIARES

```sql
-- =====================================================
-- BLOCO 4: Funções Auxiliares
-- =====================================================
-- Tempo estimado: 30 segundos
-- =====================================================

-- Função para obter tenant_id do usuário logado
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id 
    FROM profiles 
    WHERE id = auth.uid()
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para verificar se tenant tem acesso ativo
CREATE OR REPLACE FUNCTION tenant_has_access(tenant_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  tenant_record RECORD;
BEGIN
  SELECT * INTO tenant_record FROM tenants WHERE id = tenant_uuid;
  
  IF NOT FOUND OR tenant_record.is_blocked THEN
    RETURN FALSE;
  END IF;
  
  IF tenant_record.plan_type IN ('free', 'enterprise') THEN
    RETURN TRUE;
  END IF;
  
  IF tenant_record.trial_ends_at IS NOT NULL AND tenant_record.trial_ends_at > NOW() THEN
    RETURN TRUE;
  END IF;
  
  IF tenant_record.subscription_ends_at IS NOT NULL AND tenant_record.subscription_ends_at > NOW() THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Função para auto-preencher tenant_id
CREATE OR REPLACE FUNCTION auto_set_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := get_user_tenant_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**✅ Resultado esperado:** `CREATE FUNCTION` para cada comando

---

# BLOCO 5: CRIAR TRIGGERS

```sql
-- =====================================================
-- BLOCO 5: Triggers para Auto-Preenchimento
-- =====================================================
-- Tempo estimado: 30 segundos
-- =====================================================

-- Triggers para auto-preencher tenant_id nas tabelas principais
DROP TRIGGER IF EXISTS set_tenant_id_customers ON customers;
CREATE TRIGGER set_tenant_id_customers
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

DROP TRIGGER IF EXISTS set_tenant_id_products ON products;
CREATE TRIGGER set_tenant_id_products
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

DROP TRIGGER IF EXISTS set_tenant_id_orders ON orders;
CREATE TRIGGER set_tenant_id_orders
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

DROP TRIGGER IF EXISTS set_tenant_id_carts ON carts;
CREATE TRIGGER set_tenant_id_carts
  BEFORE INSERT ON carts
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();

DROP TRIGGER IF EXISTS set_tenant_id_coupons ON coupons;
CREATE TRIGGER set_tenant_id_coupons
  BEFORE INSERT ON coupons
  FOR EACH ROW EXECUTE FUNCTION auto_set_tenant_id();
```

**✅ Resultado esperado:** `CREATE TRIGGER` para cada comando

---

# BLOCO 6: CRIAR RLS POLICIES (ISOLAMENTO)

```sql
-- =====================================================
-- BLOCO 6: RLS Policies para Isolamento de Dados
-- =====================================================
-- Tempo estimado: 2-3 minutos
-- =====================================================

-- ===== CUSTOMERS =====
DROP POLICY IF EXISTS "tenant_isolation_customers_select" ON customers;
DROP POLICY IF EXISTS "tenant_isolation_customers_insert" ON customers;
DROP POLICY IF EXISTS "tenant_isolation_customers_update" ON customers;
DROP POLICY IF EXISTS "tenant_isolation_customers_delete" ON customers;

CREATE POLICY "tenant_isolation_customers_select" ON customers FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customers_insert" ON customers FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customers_update" ON customers FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_customers_delete" ON customers FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ===== PRODUCTS =====
DROP POLICY IF EXISTS "tenant_isolation_products_select" ON products;
DROP POLICY IF EXISTS "tenant_isolation_products_insert" ON products;
DROP POLICY IF EXISTS "tenant_isolation_products_update" ON products;
DROP POLICY IF EXISTS "tenant_isolation_products_delete" ON products;

CREATE POLICY "tenant_isolation_products_select" ON products FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_products_insert" ON products FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_products_update" ON products FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_products_delete" ON products FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ===== ORDERS =====
DROP POLICY IF EXISTS "tenant_isolation_orders_select" ON orders;
DROP POLICY IF EXISTS "tenant_isolation_orders_insert" ON orders;
DROP POLICY IF EXISTS "tenant_isolation_orders_update" ON orders;
DROP POLICY IF EXISTS "tenant_isolation_orders_delete" ON orders;

CREATE POLICY "tenant_isolation_orders_select" ON orders FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_orders_insert" ON orders FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_orders_update" ON orders FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_orders_delete" ON orders FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ===== CARTS =====
DROP POLICY IF EXISTS "tenant_isolation_carts_select" ON carts;
DROP POLICY IF EXISTS "tenant_isolation_carts_insert" ON carts;
DROP POLICY IF EXISTS "tenant_isolation_carts_update" ON carts;
DROP POLICY IF EXISTS "tenant_isolation_carts_delete" ON carts;

CREATE POLICY "tenant_isolation_carts_select" ON carts FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_carts_insert" ON carts FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_carts_update" ON carts FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_carts_delete" ON carts FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ===== COUPONS =====
DROP POLICY IF EXISTS "tenant_isolation_coupons_select" ON coupons;
DROP POLICY IF EXISTS "tenant_isolation_coupons_insert" ON coupons;
DROP POLICY IF EXISTS "tenant_isolation_coupons_update" ON coupons;
DROP POLICY IF EXISTS "tenant_isolation_coupons_delete" ON coupons;

CREATE POLICY "tenant_isolation_coupons_select" ON coupons FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_coupons_insert" ON coupons FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_coupons_update" ON coupons FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_coupons_delete" ON coupons FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ===== WHATSAPP_MESSAGES =====
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_messages_select" ON whatsapp_messages;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_messages_insert" ON whatsapp_messages;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_messages_update" ON whatsapp_messages;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_messages_delete" ON whatsapp_messages;

CREATE POLICY "tenant_isolation_whatsapp_messages_select" ON whatsapp_messages FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_messages_insert" ON whatsapp_messages FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_messages_update" ON whatsapp_messages FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_messages_delete" ON whatsapp_messages FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ===== WHATSAPP_TEMPLATES =====
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_templates_select" ON whatsapp_templates;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_templates_insert" ON whatsapp_templates;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_templates_update" ON whatsapp_templates;
DROP POLICY IF EXISTS "tenant_isolation_whatsapp_templates_delete" ON whatsapp_templates;

CREATE POLICY "tenant_isolation_whatsapp_templates_select" ON whatsapp_templates FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_templates_insert" ON whatsapp_templates FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_templates_update" ON whatsapp_templates FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_whatsapp_templates_delete" ON whatsapp_templates FOR DELETE USING (tenant_id = get_user_tenant_id());

-- ===== SORTEIOS =====
DROP POLICY IF EXISTS "tenant_isolation_sorteios_select" ON sorteios;
DROP POLICY IF EXISTS "tenant_isolation_sorteios_insert" ON sorteios;
DROP POLICY IF EXISTS "tenant_isolation_sorteios_update" ON sorteios;
DROP POLICY IF EXISTS "tenant_isolation_sorteios_delete" ON sorteios;

CREATE POLICY "tenant_isolation_sorteios_select" ON sorteios FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_sorteios_insert" ON sorteios FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_sorteios_update" ON sorteios FOR UPDATE USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_isolation_sorteios_delete" ON sorteios FOR DELETE USING (tenant_id = get_user_tenant_id());
```

**✅ Resultado esperado:** `CREATE POLICY` para cada comando

---

# BLOCO 7: CRIAR TENANT APP E CONTROLE DE ACESSO

```sql
-- =====================================================
-- BLOCO 7: Criar Tenant APP (Admin Master)
-- =====================================================
-- Tempo estimado: 10 segundos
-- =====================================================

-- Criar tenant APP (administração master)
INSERT INTO tenants (
  name,
  subdomain,
  email,
  phone,
  address,
  plan_type,
  is_blocked,
  is_active,
  max_products,
  max_orders
)
VALUES (
  'APP - Administração OrderZap',
  'app-admin',
  'admin@orderzaps.com',
  '00000000000',
  'Sistema',
  'enterprise',
  false,
  true,
  999999,
  999999
)
ON CONFLICT (subdomain) DO UPDATE
SET 
  plan_type = 'enterprise',
  is_blocked = false,
  max_products = 999999,
  max_orders = 999999
RETURNING id;
```

**🚨 IMPORTANTE:** 
1. Copie o UUID que apareceu na tela!
2. Vai ser algo como: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
3. Você vai usar no próximo bloco!

**✅ Resultado esperado:** Um UUID como `┌──────────────────────────────────────┐`

---

# BLOCO 8: ASSOCIAR SUPER ADMIN AO TENANT APP

⚠️ **ANTES DE EXECUTAR:** Substitua `'UUID-DO-TENANT-APP'` pelo UUID que você copiou no bloco anterior!

```sql
-- =====================================================
-- BLOCO 8: Associar Super Admin
-- =====================================================
-- Tempo estimado: 5 segundos
-- =====================================================

-- ⚠️ IMPORTANTE: Substitua 'UUID-DO-TENANT-APP' pelo UUID real!
UPDATE profiles
SET 
  tenant_id = 'UUID-DO-TENANT-APP',  -- ← COLE O UUID AQUI!
  role = 'super_admin'
WHERE email = 'rmalves21@hotmail.com';
```

**✅ Resultado esperado:** `UPDATE 1`

---

# BLOCO 9: VERIFICAÇÃO FINAL

```sql
-- =====================================================
-- BLOCO 9: Verificar Tudo Está OK
-- =====================================================

-- 1. Ver tenant APP criado
SELECT id, name, subdomain, plan_type, is_blocked, email
FROM tenants
WHERE subdomain = 'app-admin';

-- 2. Ver super admin associado
SELECT id, email, tenant_id, role
FROM profiles
WHERE email = 'rmalves21@hotmail.com';

-- 3. Ver quantas tabelas têm RLS habilitado
SELECT COUNT(*) as tabelas_com_rls
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true;

-- 4. Ver quantas policies foram criadas
SELECT COUNT(*) as total_policies
FROM pg_policies
WHERE schemaname = 'public';

-- 5. Ver quantos índices com tenant_id foram criados
SELECT COUNT(*) as indices_tenant
FROM pg_indexes
WHERE schemaname = 'public' AND indexname LIKE '%tenant%';
```

**✅ Resultado esperado:**
- Tenant APP aparece com plan_type = 'enterprise'
- Super admin tem tenant_id preenchido e role = 'super_admin'
- Pelo menos 20 tabelas com RLS
- Pelo menos 40 policies criadas
- Pelo menos 15 índices criados

---

## 🎯 PRÓXIMOS PASSOS APÓS EXECUTAR OS SQLs

### **1. Criar Tenants de Teste** (OPCIONAL)

```sql
-- Criar Loja Teste
INSERT INTO tenants (
  name,
  subdomain,
  email,
  phone,
  address,
  plan_type,
  trial_ends_at,
  is_active
)
VALUES (
  'Loja Teste',
  'loja-teste',
  'teste@lojateste.com',
  '11999999999',
  'Rua Teste, 123',
  'trial',
  NOW() + INTERVAL '7 days',
  true
)
RETURNING id;
```

**🚨 Copie o UUID retornado!**

```sql
-- Criar usuário teste (primeiro crie no Authentication > Users)
-- Depois execute:
UPDATE profiles
SET tenant_id = 'UUID-DA-LOJA-TESTE'  -- ← Cole o UUID aqui
WHERE email = 'teste@lojateste.com';
```

### **2. Redeploy no Railway**

1. Acesse: https://railway.app/dashboard
2. Entre no projeto **orderzaps**
3. Clique em **"Redeploy"**
4. Aguarde 2-3 minutos ✅

### **3. Testar Login**

```
URL: https://orderzaps.com/auth
Email: rmalves21@hotmail.com
Senha: [sua senha]
```

**✅ Deve ver:**
- Menu "⚙️ Gerenciar Empresas"
- Menu "Integrações"
- Todos os recursos

---

## 🐛 Troubleshooting

### ❌ Erro: "relation does not exist"

**Causa:** Alguma tabela mencionada não existe no seu banco

**Solução:** Comente as linhas da tabela que não existe (adicione `--` no início)

### ❌ Erro: "column already exists"

**Causa:** A coluna já foi adicionada antes

**Solução:** Tudo bem! O `IF NOT EXISTS` deve prevenir isso. Continue.

### ❌ Erro: "duplicate key value"

**Causa:** Tenant APP já existe

**Solução:** 
```sql
-- Apenas buscar o UUID existente:
SELECT id FROM tenants WHERE subdomain = 'app-admin';
```

---

## ✅ Checklist Final

Depois de executar TODOS os blocos:

- [ ] Tenant APP foi criado (verificado no Bloco 9)
- [ ] Super admin foi associado (verificado no Bloco 9)
- [ ] RLS está habilitado (verificado no Bloco 9)
- [ ] Policies foram criadas (verificado no Bloco 9)
- [ ] Índices foram criados (verificado no Bloco 9)
- [ ] Fiz redeploy no Railway
- [ ] Testei login e funciona ✅

---

## 📞 Dúvidas?

Se aparecer algum erro:
1. Me envie print da tela
2. Me diga qual BLOCO estava executando
3. Copie a mensagem de erro completa

---

**🎉 Pronto! Agora seu sistema está 100% multi-tenant!**

Execute os blocos com calma, um de cada vez, e marque os checkboxes! ✅
