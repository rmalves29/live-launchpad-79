# 🔄 GUIA DE MIGRAÇÃO - Banco de Dados Existente
## Como usar o OrderZap v2 com tabela `tenants` já existente

> **Situação:** Você já tem a tabela `tenants` no Supabase  
> **Objetivo:** Integrar com OrderZap v2 sem perder dados

---

## 🎯 OPÇÕES DISPONÍVEIS

### Opção 1: Executar SQL Completo (Recomendado) ⭐

**Por quê?** O `database.sql` usa `CREATE TABLE IF NOT EXISTS`, então:
- ✅ Não vai dar erro se a tabela já existe
- ✅ Vai criar apenas as tabelas que faltam
- ✅ Vai adicionar os índices e RLS policies

```sql
-- Execute o arquivo database.sql completo no Supabase SQL Editor
-- Ele vai:
-- 1. Pular a criação de `tenants` (já existe)
-- 2. Criar as outras tabelas: products, customers, orders, etc.
-- 3. Adicionar índices e RLS policies
```

**Passo a passo:**

1. Supabase Dashboard → SQL Editor
2. Copiar **TODO** o conteúdo de `database.sql`
3. Colar no editor
4. Clicar em **"Run"**
5. ✅ Resultado: "Success" (mesmo que tabela já exista)

---

### Opção 2: Executar Apenas Novas Tabelas

Se você quer mais controle, execute apenas as partes que faltam:

#### 2.1 Verificar estrutura da tabela `tenants` existente

```sql
-- Ver estrutura atual da tabela tenants
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'tenants';
```

#### 2.2 Comparar com o schema do OrderZap v2

**Schema esperado:**

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,           -- ⚠️ Campo obrigatório
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  settings JSONB DEFAULT '{}',
  whatsapp_connected BOOLEAN DEFAULT false,
  plan TEXT DEFAULT 'free',            -- 🆕 Novo campo
  status TEXT DEFAULT 'active',        -- 🆕 Novo campo
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2.3 Adicionar colunas que faltam

Se sua tabela não tem alguma coluna, adicione:

```sql
-- Adicionar slug (se não existir)
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Adicionar plan (se não existir)
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';

-- Adicionar status (se não existir)
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Adicionar whatsapp_connected (se não existir)
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS whatsapp_connected BOOLEAN DEFAULT false;

-- Adicionar settings (se não existir)
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
```

#### 2.4 Criar outras tabelas

Execute o resto do `database.sql` (sem a parte da tabela `tenants`):

```sql
-- Copiar do database.sql:
-- - tenant_users
-- - products
-- - customers
-- - orders
-- - whatsapp_sessions
-- - whatsapp_messages
-- - Índices
-- - RLS Policies
-- - Functions
-- - Triggers
```

---

### Opção 3: Criar Tenant de Teste

Se você quer testar sem mexer na tabela existente:

```sql
-- 1. Verificar se tem slug
SELECT id, name, slug FROM tenants LIMIT 5;

-- 2. Se não tiver slug, adicionar manualmente
UPDATE tenants 
SET slug = LOWER(REPLACE(name, ' ', '-'))
WHERE slug IS NULL;

-- 3. Criar tenant de teste
INSERT INTO tenants (slug, name, settings)
VALUES ('loja-teste', 'Loja Teste', '{}')
RETURNING *;
```

---

## 🔍 VERIFICAÇÃO DE COMPATIBILIDADE

### Checklist de Campos Obrigatórios

Execute esta query para verificar:

```sql
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'slug') 
    THEN '✅ slug existe'
    ELSE '❌ slug NÃO existe (obrigatório!)'
  END AS slug_status,
  
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'settings') 
    THEN '✅ settings existe'
    ELSE '⚠️ settings NÃO existe (recomendado)'
  END AS settings_status,
  
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'whatsapp_connected') 
    THEN '✅ whatsapp_connected existe'
    ELSE '⚠️ whatsapp_connected NÃO existe (recomendado)'
  END AS whatsapp_status;
```

**Resultado esperado:**

```
✅ slug existe
✅ settings existe
✅ whatsapp_connected existe
```

**Se algum campo faltar:**

```sql
-- Adicionar campos que faltam
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS whatsapp_connected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
```

---

## 🛡️ ROW LEVEL SECURITY (RLS)

### Verificar se RLS está habilitado

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'tenants';
```

**Resultado esperado:**
```
tablename | rowsecurity
----------|------------
tenants   | t (true)
```

**Se RLS não estiver habilitado:**

```sql
-- Habilitar RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Adicionar policies do database.sql
CREATE POLICY "Users can view their tenants"
ON tenants FOR SELECT
USING (
  id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update their tenants"
ON tenants FOR UPDATE
USING (
  id IN (
    SELECT tenant_id FROM tenant_users 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);
```

---

## 📊 MIGRAÇÃO DE DADOS (Se necessário)

### Adicionar `slug` para tenants existentes

Se seus tenants não têm `slug`, gere automaticamente:

```sql
-- Gerar slug baseado no nome
UPDATE tenants 
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(name, '[^a-zA-Z0-9 ]', '', 'g'),
    '\s+', '-', 'g'
  )
)
WHERE slug IS NULL;

-- Verificar duplicatas
SELECT slug, COUNT(*) 
FROM tenants 
GROUP BY slug 
HAVING COUNT(*) > 1;

-- Se tiver duplicatas, adicionar número
UPDATE tenants t1
SET slug = t1.slug || '-' || t1.id::TEXT
WHERE slug IN (
  SELECT slug FROM tenants GROUP BY slug HAVING COUNT(*) > 1
);
```

---

## ✅ VALIDAÇÃO FINAL

Execute esta query para confirmar que está tudo certo:

```sql
-- 1. Verificar estrutura da tabela tenants
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'tenants'
ORDER BY ordinal_position;

-- 2. Verificar se tem dados
SELECT COUNT(*) AS total_tenants FROM tenants;

-- 3. Verificar se slug está preenchido
SELECT COUNT(*) AS tenants_sem_slug 
FROM tenants 
WHERE slug IS NULL;

-- 4. Verificar outras tabelas foram criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('products', 'customers', 'orders', 'whatsapp_sessions')
ORDER BY table_name;
```

**Resultado esperado:**

```
✅ Tabela tenants tem todos os campos
✅ total_tenants: X (seus dados existentes)
✅ tenants_sem_slug: 0
✅ Tabelas criadas: products, customers, orders, whatsapp_sessions
```

---

## 🚀 PRÓXIMOS PASSOS

Depois de ajustar o banco de dados:

1. **Testar localmente:**
   ```bash
   cd /home/user/webapp/orderzap-v2
   npm run dev
   # Abrir: http://localhost:3000
   ```

2. **Fazer deploy no Railway:**
   - Seguir [GUIA_5_MINUTOS.md](./GUIA_5_MINUTOS.md)
   - Ou [GUIA_COMPLETO_AMADOR.md](./GUIA_COMPLETO_AMADOR.md)

3. **Testar a integração:**
   ```
   https://seu-app.railway.app/tenant/seu-slug/dashboard
   ```

---

## 🆘 PROBLEMAS COMUNS

### ❌ Erro: "column 'slug' does not exist"

**Solução:**
```sql
ALTER TABLE tenants ADD COLUMN slug TEXT UNIQUE;
UPDATE tenants SET slug = LOWER(REPLACE(name, ' ', '-'));
```

### ❌ Erro: "duplicate key value violates unique constraint"

**Causa:** Dois tenants com o mesmo `slug`

**Solução:**
```sql
-- Ver duplicatas
SELECT slug, COUNT(*) FROM tenants GROUP BY slug HAVING COUNT(*) > 1;

-- Adicionar ID ao slug duplicado
UPDATE tenants t1
SET slug = t1.slug || '-' || SUBSTRING(t1.id::TEXT, 1, 8)
WHERE slug IN (SELECT slug FROM tenants GROUP BY slug HAVING COUNT(*) > 1);
```

### ❌ Erro: "permission denied for table tenants"

**Causa:** RLS está habilitado mas sem policies

**Solução:**
```sql
-- Executar as policies do database.sql
-- Ou temporariamente desabilitar RLS para testes:
ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;
```

---

## 📝 RESUMO

### ✅ Opção Recomendada (Mais Simples)

```sql
-- 1. Executar database.sql completo
-- (Vai pular a criação de tenants e criar o resto)

-- 2. Adicionar slug se não existir
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
UPDATE tenants SET slug = LOWER(REPLACE(name, ' ', '-')) WHERE slug IS NULL;

-- 3. Pronto! Fazer deploy no Railway
```

**Tempo:** ~5 minutos

---

## 🔗 LINKS ÚTEIS

- **database.sql completo:** [Ver arquivo](./database.sql)
- **Guia de deploy:** [GUIA_5_MINUTOS.md](./GUIA_5_MINUTOS.md)
- **Resolução de erros:** [GUIA_RESOLVER_ERROS.md](./GUIA_RESOLVER_ERROS.md)

---

**Criado para facilitar a migração de bancos existentes**  
**Versão:** 2.0  
**Data:** 08/12/2025  
**Compatibilidade:** Supabase PostgreSQL 15+
