# 🏢 Sistema Multi-Tenant Completo - Guia de Implementação

## 📋 Visão Geral

Este sistema implementa **multi-tenancy com tabelas compartilhadas**, onde:
- ✅ Todos os tenants usam o mesmo banco de dados
- ✅ Cada tabela tem coluna `tenant_id`
- ✅ Isolamento automático via RLS (Row Level Security)
- ✅ **SEM subdomínios** - todos acessam `https://orderzaps.com`
- ✅ Sistema identifica tenant pelo login do usuário

---

## 🎯 Como Funciona

```
┌─────────────────────────────────────────────────────┐
│ 1. Usuário acessa https://orderzaps.com/auth        │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│ 2. Faz login com email/senha                        │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│ 3. Sistema busca tenant_id na tabela profiles       │
│    SELECT tenant_id FROM profiles WHERE id = uid    │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│ 4. RLS filtra TODAS as queries automaticamente:     │
│    WHERE tenant_id = 'uuid-do-tenant-logado'        │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│ 5. Usuário vê APENAS os dados da sua empresa        │
└─────────────────────────────────────────────────────┘
```

---

## 📦 Arquivos Criados

| Arquivo | Descrição |
|---------|-----------|
| `20251207_complete_multitenant_system.sql` | Migration principal (adiciona tenant_id, índices, RLS) |
| `20251207_create_all_rls_policies.sql` | Policies RLS para todas as tabelas |
| `20251207_setup_admin_tenant.sql` | Cria tenant APP e controle de acesso |

---

## 🚀 Passo a Passo de Implementação

### **PASSO 1: Executar Migrations no Supabase**

#### 1.1. Acesse o Supabase SQL Editor
👉 https://supabase.com/dashboard/project/YOUR-PROJECT/sql

#### 1.2. Execute a Migration Principal

Cole e execute:
```sql
-- Copie TODO o conteúdo de:
-- supabase/migrations/20251207_complete_multitenant_system.sql
```

**✅ Resultado esperado:**
- Tabela `tenants` atualizada com novos campos
- Coluna `tenant_id` adicionada em TODAS as tabelas
- Índices compostos criados
- RLS habilitado em todas as tabelas
- Função `get_user_tenant_id()` criada
- Triggers para auto-preencher `tenant_id`

#### 1.3. Execute as RLS Policies

Cole e execute:
```sql
-- Copie TODO o conteúdo de:
-- supabase/migrations/20251207_create_all_rls_policies.sql
```

**✅ Resultado esperado:**
- Policies criadas para isolamento automático
- Cada tenant vê apenas seus dados

#### 1.4. Execute o Setup do Tenant Admin

Cole e execute:
```sql
-- Copie TODO o conteúdo de:
-- supabase/migrations/20251207_setup_admin_tenant.sql
```

**✅ Resultado esperado:**
- Tenant APP criado (retorna um UUID - **ANOTE ELE!**)
- Controle de acesso configurado
- Função `tenant_has_access()` criada

---

### **PASSO 2: Criar Tenants e Associar Usuários**

#### 2.1. Criar Tenant APP (Admin Master)

Se ainda não foi criado na migration anterior:

```sql
-- Criar tenant APP (admin do sistema)
INSERT INTO tenants (
  name,
  subdomain,
  email,
  phone,
  plan_type,
  is_active,
  is_blocked
)
VALUES (
  'APP - Administração OrderZap',
  'app-admin',
  'admin@orderzaps.com',
  '00000000000',
  'enterprise',
  true,
  false
)
RETURNING id;
```

**🚨 COPIE O UUID RETORNADO!**

#### 2.2. Associar Super Admin ao Tenant APP

```sql
-- Substitua 'UUID-DO-TENANT-APP' pelo UUID copiado acima
UPDATE profiles
SET 
  tenant_id = 'UUID-DO-TENANT-APP',
  role = 'super_admin'
WHERE email = 'rmalves21@hotmail.com';
```

**✅ Verificar:**
```sql
SELECT id, email, tenant_id, role FROM profiles WHERE email = 'rmalves21@hotmail.com';
```

#### 2.3. Criar Tenants de Teste

```sql
-- Criar Loja Teste 1
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
  'Loja da Maria',
  'loja-da-maria',
  'maria@lojateste.com',
  '11999999999',
  'Rua Teste, 123',
  'trial',
  NOW() + INTERVAL '7 days',
  true
)
RETURNING id;
```

**🚨 COPIE O UUID RETORNADO!**

```sql
-- Criar usuário para Loja da Maria
-- Primeiro, crie o usuário no Supabase Authentication > Users > Invite User
-- Depois execute:
UPDATE profiles
SET tenant_id = 'UUID-DA-LOJA-DA-MARIA'
WHERE email = 'maria@lojateste.com';
```

#### 2.4. Criar Mais um Tenant de Teste

```sql
-- Criar Loja Teste 2
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
  'Loja do João',
  'loja-do-joao',
  'joao@lojateste.com',
  '11988888888',
  'Av Teste, 456',
  'trial',
  NOW() + INTERVAL '7 days',
  true
)
RETURNING id;
```

**🚨 COPIE O UUID RETORNADO!**

```sql
-- Criar usuário para Loja do João
UPDATE profiles
SET tenant_id = 'UUID-DA-LOJA-DO-JOAO'
WHERE email = 'joao@lojateste.com';
```

---

### **PASSO 3: Migrar Dados Existentes (se houver)**

Se você já tem dados no sistema SEM `tenant_id`, precisa associá-los:

```sql
-- Listar tenants
SELECT id, name FROM tenants ORDER BY created_at;

-- Escolha um tenant master para os dados antigos
-- Substitua 'UUID-TENANT-MASTER' pelo UUID escolhido

-- Migrar customers
UPDATE customers 
SET tenant_id = 'UUID-TENANT-MASTER' 
WHERE tenant_id IS NULL;

-- Migrar products
UPDATE products 
SET tenant_id = 'UUID-TENANT-MASTER' 
WHERE tenant_id IS NULL;

-- Migrar orders
UPDATE orders 
SET tenant_id = 'UUID-TENANT-MASTER' 
WHERE tenant_id IS NULL;

-- Migrar carts
UPDATE carts 
SET tenant_id = 'UUID-TENANT-MASTER' 
WHERE tenant_id IS NULL;

-- Migrar whatsapp
UPDATE whatsapp_messages 
SET tenant_id = 'UUID-TENANT-MASTER' 
WHERE tenant_id IS NULL;

UPDATE whatsapp_templates 
SET tenant_id = 'UUID-TENANT-MASTER' 
WHERE tenant_id IS NULL;

-- Continue para outras tabelas...
```

---

### **PASSO 4: Tornar tenant_id Obrigatório (OPCIONAL - só depois de migrar)**

⚠️ **CUIDADO:** Só execute isso DEPOIS de garantir que TODOS os registros têm `tenant_id`!

```sql
-- Verificar se há registros sem tenant_id
SELECT 'customers' as table_name, COUNT(*) as missing FROM customers WHERE tenant_id IS NULL
UNION ALL
SELECT 'products', COUNT(*) FROM products WHERE tenant_id IS NULL
UNION ALL
SELECT 'orders', COUNT(*) FROM orders WHERE tenant_id IS NULL;

-- Se o resultado acima for ZERO para todas, pode tornar obrigatório:
ALTER TABLE customers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE products ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE orders ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE carts ALTER COLUMN tenant_id SET NOT NULL;
-- Continue para outras tabelas...
```

---

### **PASSO 5: Redeploy no Railway**

1. Acesse: https://railway.app/dashboard
2. Entre no projeto **orderzaps**
3. Vá em **"Deploy"** → **"Redeploy"**
4. Aguarde 2-3 minutos até ficar verde ✅

---

### **PASSO 6: Testar Isolamento de Dados**

#### 6.1. Teste com Super Admin

```
URL: https://orderzaps.com/auth
Email: rmalves21@hotmail.com
Senha: [sua senha]
```

**✅ Deve aparecer:**
- Menu "⚙️ Gerenciar Empresas"
- Menu "Integrações"
- Acesso a TODOS os recursos

#### 6.2. Criar Dados de Teste para Loja da Maria

```sql
-- Conecte como Super Admin ou use o SQL Editor

-- Criar produtos para Loja da Maria
INSERT INTO products (name, price, tenant_id)
VALUES 
  ('Produto Maria 1', 50.00, 'UUID-DA-LOJA-DA-MARIA'),
  ('Produto Maria 2', 75.00, 'UUID-DA-LOJA-DA-MARIA');

-- Criar cliente para Loja da Maria
INSERT INTO customers (name, phone, email, tenant_id)
VALUES 
  ('Cliente Maria 1', '11999999999', 'cliente1@maria.com', 'UUID-DA-LOJA-DA-MARIA');
```

#### 6.3. Criar Dados de Teste para Loja do João

```sql
-- Criar produtos para Loja do João
INSERT INTO products (name, price, tenant_id)
VALUES 
  ('Produto João 1', 100.00, 'UUID-DA-LOJA-DO-JOAO'),
  ('Produto João 2', 150.00, 'UUID-DA-LOJA-DO-JOAO');

-- Criar cliente para Loja do João
INSERT INTO customers (name, phone, email, tenant_id)
VALUES 
  ('Cliente João 1', '11988888888', 'cliente1@joao.com', 'UUID-DA-LOJA-DO-JOAO');
```

#### 6.4. Teste com Usuário Loja da Maria

```
URL: https://orderzaps.com/auth
Email: maria@lojateste.com
Senha: [senha criada]
```

**✅ Deve ver APENAS:**
- Produto Maria 1
- Produto Maria 2
- Cliente Maria 1
- **NÃO deve ver** produtos/clientes do João

#### 6.5. Teste com Usuário Loja do João

```
URL: https://orderzaps.com/auth
Email: joao@lojateste.com
Senha: [senha criada]
```

**✅ Deve ver APENAS:**
- Produto João 1
- Produto João 2
- Cliente João 1
- **NÃO deve ver** produtos/clientes da Maria

---

## 🔍 Verificações de Segurança

### **Verificar RLS Ativo**

```sql
-- Verificar quais tabelas TÊM RLS habilitado
SELECT 
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = true
ORDER BY tablename;
```

**✅ Resultado esperado:** Todas as tabelas com tenant_id devem aparecer

### **Verificar Policies Criadas**

```sql
-- Verificar policies
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**✅ Resultado esperado:** Cada tabela deve ter 4 policies (SELECT, INSERT, UPDATE, DELETE)

### **Verificar Índices**

```sql
-- Verificar índices criados
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%tenant%'
ORDER BY tablename;
```

**✅ Resultado esperado:** Índices compostos com `tenant_id`

---

## 🐛 Troubleshooting

### ❌ Erro: "null value in column tenant_id violates not-null constraint"

**Causa:** Tentou criar registro sem `tenant_id`

**Solução:**
1. Verifique se o trigger `auto_set_tenant_id` está ativo:
```sql
SELECT * FROM pg_trigger WHERE tgname LIKE '%tenant%';
```

2. Verifique se o usuário tem `tenant_id` no profile:
```sql
SELECT id, email, tenant_id FROM profiles WHERE id = auth.uid();
```

### ❌ Erro: "permission denied for table"

**Causa:** RLS bloqueando acesso

**Solução:**
1. Verificar se as policies existem:
```sql
SELECT * FROM pg_policies WHERE tablename = 'nome_da_tabela';
```

2. Verificar se o usuário está logado:
```sql
SELECT auth.uid(), get_user_tenant_id();
```

### ❌ Erro: "Usuário vê dados de outros tenants"

**Causa:** RLS não está funcionando corretamente

**Solução:**
1. Verificar se RLS está habilitado:
```sql
ALTER TABLE nome_da_tabela ENABLE ROW LEVEL SECURITY;
```

2. Recriar policies:
```sql
-- Executar novamente o script de policies
```

3. Limpar cache do Supabase:
```sql
NOTIFY pgrst, 'reload schema';
```

### ❌ Erro: "Não consegue ver dados de nenhum tenant"

**Causa:** `tenant_id` não está definido no profile

**Solução:**
```sql
-- Verificar tenant_id do usuário
SELECT id, email, tenant_id FROM profiles WHERE email = 'seu-email@example.com';

-- Se estiver NULL, definir:
UPDATE profiles 
SET tenant_id = 'UUID-DO-TENANT'
WHERE email = 'seu-email@example.com';
```

---

## 📊 Monitoramento

### **Dashboard de Uso por Tenant**

```sql
-- Ver estatísticas de cada tenant
SELECT * FROM tenant_usage_stats ORDER BY total_revenue DESC;
```

### **Tenants Ativos**

```sql
-- Listar tenants ativos
SELECT 
  id,
  name,
  email,
  plan_type,
  trial_ends_at,
  subscription_ends_at,
  tenant_has_access(id) as has_access,
  is_blocked
FROM tenants
WHERE is_active = true
ORDER BY created_at DESC;
```

### **Usuários por Tenant**

```sql
-- Ver quantos usuários cada tenant tem
SELECT 
  t.name as tenant_name,
  COUNT(p.id) as total_users
FROM tenants t
LEFT JOIN profiles p ON p.tenant_id = t.id
GROUP BY t.id, t.name
ORDER BY total_users DESC;
```

---

## 🎯 Próximos Passos

1. ✅ **Executar migrations** no Supabase
2. ✅ **Criar tenants** de teste
3. ✅ **Associar usuários** aos tenants
4. ✅ **Fazer redeploy** no Railway
5. ✅ **Testar isolamento** (crucial!)
6. ✅ **Monitorar logs** de acesso
7. ✅ **Documentar** processo para equipe

---

## 📞 Suporte

Se encontrar algum problema:
1. Verifique os logs do Supabase
2. Execute as queries de verificação acima
3. Me envie print/erro para ajudar

---

## 🎉 Sistema Pronto!

Agora você tem um sistema multi-tenant COMPLETO com:
- ✅ Isolamento perfeito de dados
- ✅ Um único domínio para todos
- ✅ Segurança via RLS
- ✅ Performance com índices
- ✅ Fácil de escalar

**Parabéns!** 🚀
