# 🚀 OrderZap v2 - Setup Completo

## ✅ O Que Já Foi Criado

```
✓ Estrutura de pastas Next.js 14
✓ Configurações (next.config.js, tsconfig.json, tailwind.config.ts)
✓ package.json com dependências
✓ Dockerfile otimizado para Railway
✓ railway.toml para configuração
✓ .dockerignore
✓ .env.example
✓ README.md completo
✓ COMOFUNCIONA.md (explicação detalhada)
✓ globals.css com Tailwind
```

---

## 📋 Próximos Passos para Completar

### 1. Instalar Dependências

```bash
cd /home/user/webapp/orderzap-v2
npm install
```

### 2. Criar Arquivos Base do Next.js

#### app/layout.tsx (Root Layout)
```bash
cat > app/layout.tsx << 'EOF'
import './globals.css'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'OrderZap - Sistema Multi-Tenant',
  description: 'Gestão de pedidos com WhatsApp integrado',
}

export default function RootLayout({
  children,
}: {
  children: React.Node
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
EOF
```

#### app/page.tsx (Landing Page)
```bash
cat > app/page.tsx << 'EOF'
import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">OrderZap v2</h1>
        <p className="text-xl text-gray-600 mb-8">
          Sistema Multi-Tenant de Gestão de Pedidos
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/auth/login"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Login
          </Link>
          <Link
            href="/auth/register"
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Criar Conta
          </Link>
        </div>
      </div>
    </main>
  )
}
EOF
```

#### app/api/health/route.ts (Health Check)
```bash
mkdir -p app/api/health
cat > app/api/health/route.ts << 'EOF'
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  })
}
EOF
```

### 3. Criar Lib do Supabase

```bash
mkdir -p lib/supabase

cat > lib/supabase/client.ts << 'EOF'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export const supabase = createClientComponentClient()
EOF

cat > lib/supabase/server.ts << 'EOF'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const createClient = () => {
  return createServerComponentClient({ cookies })
}
EOF
```

### 4. Criar Utils

```bash
mkdir -p lib/utils

cat > lib/utils/cn.ts << 'EOF'
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
EOF
```

### 5. Ajustar next.config.js para Standalone

```bash
cat > next.config.js << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  output: 'standalone',  // ← Importante para Dockerfile
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
}

module.exports = nextConfig
EOF
```

### 6. Adicionar Scripts ao package.json

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  }
}
```

---

## 🗄️ Setup Supabase

### 1. Criar Projeto no Supabase

- Acesse: https://supabase.com
- Crie novo projeto
- Copie as credenciais

### 2. Executar SQL para Criar Tabelas

```sql
-- Ver arquivo SQL_SCHEMA.sql que será criado
```

### 3. Configurar RLS (Row Level Security)

```sql
-- Habilitar RLS em todas as tabelas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Policies básicas (ver SQL_SCHEMA.sql para completo)
```

---

## 🚀 Deploy no Railway

### 1. Preparar Repositório

```bash
cd /home/user/webapp/orderzap-v2

# Inicializar git
git init

# Criar .gitignore
cat > .gitignore << 'EOF'
# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Next.js
.next/
out/
build/
dist/

# Environment
.env*
!.env.example

# WhatsApp sessions
whatsapp-sessions/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Testing
coverage/
.nyc_output/

# Misc
*.log
.DS_Store
EOF

# Add e commit
git add .
git commit -m "feat: Initial commit OrderZap v2 - Next.js 14 Multi-Tenant System"
```

### 2. Criar Repositório no GitHub

```bash
# Criar repo no GitHub: orderzap-v2
# Depois:
git remote add origin https://github.com/rmalves29/orderzap-v2.git
git branch -M main
git push -u origin main
```

### 3. Conectar no Railway

1. Railway Dashboard → New Project
2. Deploy from GitHub Repo
3. Selecionar: `rmalves29/orderzap-v2`
4. **NÃO configurar Root Directory** (deixar vazio)
5. Railway detecta `railway.toml` automaticamente

### 4. Adicionar Variáveis de Ambiente

```
Settings → Variables → Add Variable:

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=https://seu-app.railway.app
NODE_ENV=production
```

### 5. Deploy

- Railway faz deploy automaticamente
- Build leva ~2-3 minutos
- App fica online

---

## ✅ Verificar Se Está Funcionando

### 1. Local:

```bash
# Instalar dependências
npm install

# Criar .env.local
cp .env.example .env.local
# Preencher com suas credenciais

# Rodar dev
npm run dev

# Abrir: http://localhost:3000
```

Deve aparecer a landing page com botões Login e Criar Conta.

### 2. Railway:

```bash
# Verificar health check
curl https://seu-app.railway.app/api/health

# Deve retornar:
{
  "status": "healthy",
  "timestamp": "2025-12-08T..."
}
```

---

## 📊 Status do Projeto

| Componente | Status | Próximo Passo |
|------------|--------|---------------|
| **Estrutura** | ✅ 100% | - |
| **Configuração** | ✅ 100% | - |
| **Dockerfile** | ✅ 100% | - |
| **Landing Page** | 🟡 Basic | Criar design |
| **Auth Pages** | ❌ 0% | Criar login/register |
| **Tenant Layout** | ❌ 0% | Criar sidebar/header |
| **Dashboard** | ❌ 0% | Criar métricas |
| **Pedidos** | ❌ 0% | Criar CRUD |
| **Produtos** | ❌ 0% | Criar CRUD |
| **WhatsApp** | ❌ 0% | Integrar Baileys |
| **API Routes** | 🟡 10% | Health check apenas |
| **Banco de Dados** | ❌ 0% | Executar SQL |

**Progresso Total:** ~15%

---

## 🎯 Roadmap de Desenvolvimento

### Semana 1: Fundação
- [x] Estrutura de pastas
- [x] Configurações base
- [x] Dockerfile
- [ ] Setup Supabase
- [ ] Autenticação básica
- [ ] Layout do tenant

### Semana 2: Core Features
- [ ] CRUD Produtos
- [ ] CRUD Clientes
- [ ] CRUD Pedidos
- [ ] Dashboard

### Semana 3: WhatsApp
- [ ] Integração Baileys
- [ ] QR Code Connection
- [ ] Send Messages
- [ ] Templates

### Semana 4: Polish
- [ ] Relatórios
- [ ] Etiquetas
- [ ] Testes
- [ ] Deploy final

---

## 💡 Próximos Arquivos a Criar

### Prioridade ALTA:
1. `app/auth/login/page.tsx` - Página de login
2. `app/auth/register/page.tsx` - Página de registro
3. `app/tenant/[tenantSlug]/layout.tsx` - Layout do tenant
4. `app/tenant/[tenantSlug]/dashboard/page.tsx` - Dashboard
5. `app/api/auth/callback/route.ts` - Callback Supabase

### Prioridade MÉDIA:
6. `app/tenant/[tenantSlug]/pedidos/page.tsx`
7. `app/tenant/[tenantSlug]/produtos/page.tsx`
8. `app/api/tenants/route.ts`
9. `app/api/orders/route.ts`
10. `lib/whatsapp/baileys.ts`

---

## 🎊 Conclusão

Você tem agora:

✅ Projeto Next.js 14 configurado  
✅ Dockerfile otimizado para Railway  
✅ Arquitetura multi-tenant planejada  
✅ Documentação completa  
✅ Pronto para desenvolvimento  

**Próximo passo:** Criar as páginas e API routes conforme necessidade!

---

**Tempo estimado para completar:** 3-4 semanas (trabalhando part-time)  
**Complexidade:** Média-Alta  
**Stack:** Moderna e escalável  
**Deploy:** Simples (Railway single service)
