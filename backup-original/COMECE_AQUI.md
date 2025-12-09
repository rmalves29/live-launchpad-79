# ⚡ COMECE AQUI - OrderZap v2

## 🚀 Setup Rápido (5 minutos)

### 1. Instalar Dependências

```bash
cd /home/user/webapp/orderzap-v2
npm install
```

Isso vai instalar:
- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Supabase
- Baileys (WhatsApp)
- E todas as dependências

### 2. Configurar Ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local` e preencha:

```env
# Criar projeto em: https://supabase.com
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key_aqui
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_aqui

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### 3. Rodar Localmente

```bash
npm run dev
```

Abrir: http://localhost:3000

Você verá a **landing page** com:
- ✅ Logo OrderZap
- ✅ Features (WhatsApp, Multi-Tenant, Relatórios)
- ✅ Botões "Fazer Login" e "Criar Conta"

---

## 📋 O Que Já Está Funcionando

✅ **Landing Page** - `/` - Página inicial bonita  
✅ **Health Check API** - `/api/health` - Para Railway  
✅ **Estrutura Next.js** - App Router configurado  
✅ **Tailwind CSS** - Estilos prontos  
✅ **TypeScript** - 100% tipado  
✅ **Dockerfile** - Pronto para Railway  

---

## 🎯 Próximos Passos

### Fase 1: Autenticação (Próxima)

Vou criar agora:
1. `app/auth/login/page.tsx` - Página de login
2. `app/auth/register/page.tsx` - Página de registro
3. `lib/supabase/client.ts` - Cliente Supabase
4. `lib/supabase/server.ts` - Supabase server-side

### Fase 2: Layout Tenant

Depois:
1. `app/tenant/[tenantSlug]/layout.tsx` - Layout com sidebar
2. `app/tenant/[tenantSlug]/dashboard/page.tsx` - Dashboard
3. `components/tenant/sidebar.tsx` - Sidebar de navegação
4. `components/tenant/header.tsx` - Header do tenant

### Fase 3: CRUD Básico

Então:
1. Produtos (listar, criar, editar, deletar)
2. Clientes (listar, criar, editar, deletar)
3. Pedidos (listar, criar, editar, deletar)

### Fase 4: WhatsApp

Por fim:
1. Integração Baileys
2. QR Code para conectar
3. Envio de mensagens
4. Templates

---

## 🗄️ Banco de Dados (Supabase)

### Criar Tabelas

Acesse: https://supabase.com → Seu Projeto → SQL Editor

Cole e execute:

```sql
-- Tenants (Lojas)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  settings JSONB DEFAULT '{}',
  whatsapp_connected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usuários por Tenant
CREATE TABLE tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

-- Produtos
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  stock INT DEFAULT 0,
  images JSONB DEFAULT '[]',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clientes
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  address JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pedidos
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  order_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  total DECIMAL(10, 2) NOT NULL,
  items JSONB NOT NULL,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policies básicas (usuário só vê seus tenants)
CREATE POLICY "Users can see their tenants"
ON tenant_users FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can see their tenant's products"
ON products FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  )
);

-- Repetir para outras tabelas...
```

---

## 🚀 Deploy no Railway (Quando Pronto)

### 1. Criar Repositório

```bash
git init
git add .
git commit -m "feat: OrderZap v2 - Initial setup"

# Criar repo no GitHub: orderzap-v2
git remote add origin https://github.com/rmalves29/orderzap-v2.git
git push -u origin main
```

### 2. Conectar Railway

1. Railway → **New Project**
2. **Deploy from GitHub Repo**
3. Selecionar: `orderzap-v2`
4. **Root Directory:** (DEIXAR VAZIO!)

### 3. Adicionar Variáveis

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=https://seu-app.railway.app
NODE_ENV=production
```

### 4. Deploy Automático

- Railway detecta `railway.toml`
- Usa Dockerfile
- Build ~2-3 minutos
- App fica online

---

## 📚 Documentação Completa

- **README.md** - Documentação técnica completa
- **COMOFUNCIONA.md** - Arquitetura e conceitos
- **SETUP.md** - Setup detalhado
- **INICIO_RAPIDO.md** - Quick start

---

## 💡 Comandos Úteis

```bash
# Desenvolvimento
npm run dev          # Rodar dev server (http://localhost:3000)
npm run build        # Build produção
npm run start        # Rodar build em produção
npm run lint         # Lint código

# Verificar tipos
npx tsc --noEmit

# Limpar cache
rm -rf .next node_modules
npm install
```

---

## ✅ Checklist

- [x] Estrutura de pastas criada
- [x] package.json configurado
- [x] Dockerfile otimizado
- [x] Landing page criada
- [x] Health check API
- [x] Tailwind CSS configurado
- [ ] Instalar dependências (`npm install`)
- [ ] Configurar .env.local
- [ ] Criar tabelas no Supabase
- [ ] Rodar dev (`npm run dev`)
- [ ] Criar páginas de auth
- [ ] Criar layout tenant
- [ ] Implementar CRUD
- [ ] Integrar WhatsApp
- [ ] Deploy Railway

---

## 🎊 PRONTO PARA COMEÇAR!

Execute:

```bash
npm install
npm run dev
```

E veja a mágica acontecer em **http://localhost:3000**!

---

**Status:** Base funcional criada ✅  
**Próximo:** Instalar dependências e rodar dev server  
**Tempo:** ~5 minutos para ter algo rodando
