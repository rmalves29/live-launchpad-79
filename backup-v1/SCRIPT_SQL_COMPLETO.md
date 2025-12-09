# 📊 Script SQL Completo - Setup Supabase

Execute este script no **SQL Editor** do Supabase:  
👉 https://supabase.com/dashboard/project/seu-projeto/sql

---

## ✅ PARTE 1: Adicionar Controle de Acesso

```sql
-- Adicionar campos de controle de acesso na tabela tenants
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'trial' CHECK (plan_type IN ('trial', 'basic', 'premium', 'enterprise', 'free')),
ADD COLUMN IF NOT EXISTS max_products INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS max_orders INTEGER DEFAULT 100;
```

**✅ Resultado esperado:** `ALTER TABLE`

---

## ✅ PARTE 2: Criar Função de Verificação de Acesso

```sql
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
```

**✅ Resultado esperado:** `CREATE FUNCTION`

---

## ✅ PARTE 3: Criar View de Status

```sql
-- View para status dos tenants
CREATE OR REPLACE VIEW tenant_status AS
SELECT 
  t.id,
  t.name,
  t.subdomain,
  t.email,
  t.phone,
  t.plan_type,
  t.is_blocked,
  t.trial_ends_at,
  t.subscription_ends_at,
  t.max_products,
  t.max_orders,
  t.created_at,
  CASE
    WHEN t.is_blocked THEN 'blocked'
    WHEN t.plan_type = 'enterprise' THEN 'active'
    WHEN t.plan_type = 'free' THEN 'active'
    WHEN t.trial_ends_at > NOW() THEN 'trial'
    WHEN t.subscription_ends_at > NOW() THEN 'active'
    ELSE 'expired'
  END as status,
  tenant_has_access(t.id) as has_access,
  (SELECT COUNT(*) FROM products WHERE tenant_id = t.id) as current_products,
  (SELECT COUNT(*) FROM orders WHERE tenant_id = t.id) as current_orders
FROM tenants t;
```

**✅ Resultado esperado:** `CREATE VIEW`

---

## ✅ PARTE 4: Criar Tenant APP (Admin Master)

```sql
-- Criar tenant APP (admin master)
INSERT INTO tenants (
  name,
  subdomain,
  email,
  phone,
  address,
  plan_type,
  is_blocked,
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

**✅ Resultado esperado:** Um UUID será mostrado, algo como:
```
┌──────────────────────────────────────┐
│                  id                  │
├──────────────────────────────────────┤
│ a1b2c3d4-e5f6-7890-abcd-ef1234567890 │
└──────────────────────────────────────┘
```

**🚨 IMPORTANTE:** Copie esse UUID! Você vai precisar dele no próximo passo.

---

## ✅ PARTE 5: Associar Super Admin ao Tenant APP

**⚠️ ANTES DE EXECUTAR:** Cole o UUID que você copiou acima no lugar de `'COLE-O-UUID-AQUI'`

```sql
-- Associar super admin ao tenant APP
UPDATE profiles
SET 
  tenant_id = 'COLE-O-UUID-AQUI',
  role = 'super_admin'
WHERE email = 'rmalves21@hotmail.com';
```

**✅ Resultado esperado:** `UPDATE 1`

---

## ✅ PARTE 6: Verificar Setup

```sql
-- Verificar tenant APP criado
SELECT id, name, subdomain, plan_type, is_blocked, email
FROM tenants
WHERE subdomain = 'app-admin';

-- Verificar super admin associado
SELECT id, email, tenant_id, role
FROM profiles
WHERE email = 'rmalves21@hotmail.com';

-- Verificar status de todos os tenants
SELECT * FROM tenant_status;
```

**✅ Resultado esperado:**
- Tenant APP com plan_type = 'enterprise'
- Profile com tenant_id preenchido e role = 'super_admin'
- View tenant_status funcionando

---

## 🎯 OPCIONAL: Criar Tenant de Teste

```sql
-- Criar tenant de teste com 7 dias de trial
INSERT INTO tenants (
  name,
  subdomain,
  email,
  phone,
  address,
  plan_type,
  is_blocked,
  trial_ends_at,
  max_products,
  max_orders
)
VALUES (
  'Loja Teste',
  'loja-teste',
  'contato@lojateste.com',
  '11999999999',
  'Rua Teste, 123',
  'trial',
  false,
  NOW() + INTERVAL '7 days',
  50,
  100
)
ON CONFLICT (subdomain) DO NOTHING
RETURNING id;
```

**🚨 IMPORTANTE:** Copie o UUID retornado.

```sql
-- Criar usuário teste e associar ao tenant
-- ANTES: Substitua 'UUID-DO-TENANT-TESTE' pelo UUID copiado acima
UPDATE profiles
SET tenant_id = 'UUID-DO-TENANT-TESTE'
WHERE email = 'usuario@lojateste.com';

-- OU se o usuário não existe, você precisa criar ele primeiro via:
-- 1. Authentication > Users > Invite User
-- 2. Depois executar o UPDATE acima
```

---

## ✅ Checklist Final

Após executar todos os scripts acima:

- [ ] Tabela `tenants` tem os novos campos (trial_ends_at, subscription_ends_at, etc)
- [ ] Função `tenant_has_access()` foi criada
- [ ] View `tenant_status` foi criada
- [ ] Tenant APP foi criado (verifique com SELECT)
- [ ] Super admin foi associado ao tenant APP (verifique com SELECT)
- [ ] (Opcional) Tenant teste foi criado
- [ ] (Opcional) Usuário teste foi associado ao tenant teste

---

## 🚀 Próximos Passos

1. **✅ Fazer redeploy no Railway:**
   - Acesse: https://railway.app/dashboard
   - Entre no projeto **orderzaps**
   - Clique em **"Deploy"** → **"Redeploy"**
   - Aguarde ficar verde ✅

2. **✅ Testar login:**
   ```
   URL: https://orderzaps.com/auth
   Email: rmalves21@hotmail.com
   Senha: [sua senha]
   ```

3. **✅ Verificar menus:**
   - Menu "Integrações" deve aparecer
   - Menu "⚙️ Gerenciar Empresas" deve aparecer

4. **✅ Criar nova empresa:**
   - Acesse: https://orderzaps.com/admin/tenants
   - Clique em "Nova Empresa"
   - Preencha os dados
   - Salve

---

## 🐛 Troubleshooting

### ❌ Erro: "relation 'products' does not exist"
**Solução:** Se a tabela `products` não existe, remova a view `tenant_status` por enquanto:
```sql
DROP VIEW IF EXISTS tenant_status;
```

### ❌ Erro: "relation 'orders' does not exist"
**Solução:** Mesma solução acima.

### ❌ Erro: "duplicate key value violates unique constraint"
**Solução:** O tenant APP já existe. Execute:
```sql
SELECT id FROM tenants WHERE subdomain = 'app-admin';
```
Use o UUID retornado na Parte 5.

---

## 📞 Suporte

Se tiver qualquer erro, me envie:
1. A mensagem de erro completa
2. Qual PARTE você estava executando
3. Print da tela (se possível)

---

**🎉 Boa sorte com o setup!**
