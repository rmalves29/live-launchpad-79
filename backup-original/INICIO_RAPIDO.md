# ⚡ OrderZap v2 - Início Rápido

## 🎯 O Que É

Sistema **Multi-Tenant** de gestão de pedidos com:
- ✅ WhatsApp integrado (Baileys - 100% gratuito)
- ✅ Sem subdomínios (usa paths: `/tenant/minha-loja`)
- ✅ Next.js 14 + TypeScript
- ✅ Deploy único no Railway
- ✅ Supabase (PostgreSQL)

---

## 🚀 Começar AGORA (5 minutos)

### 1. Instalar Dependências
```bash
cd /home/user/webapp/orderzap-v2
npm install
```

### 2. Configurar Supabase
```bash
# Criar projeto em: https://supabase.com
# Copiar credenciais

# Criar .env.local
cp .env.example .env.local

# Editar e preencher:
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_key
```

### 3. Rodar Localmente
```bash
npm run dev
```

Abrir: http://localhost:3000

---

## 📁 Estrutura Criada

```
orderzap-v2/
├── app/                    # Next.js App Router
│   ├── api/                # API Routes
│   ├── auth/               # Autenticação
│   ├── tenant/             # Área dos tenants
│   └── admin/              # Admin global
├── lib/                    # Bibliotecas
│   ├── supabase/           # Cliente Supabase
│   ├── whatsapp/           # Baileys WhatsApp
│   └── utils/              # Utilitários
├── components/             # Componentes React
├── public/                 # Assets estáticos
├── Dockerfile              # Para Railway
├── railway.toml            # Config Railway
├── package.json
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

---

## 📚 Documentação

- **README.md** - Documentação completa
- **COMOFUNCIONA.md** - Como o sistema funciona
- **SETUP.md** - Setup detalhado passo a passo
- **INICIO_RAPIDO.md** - Este arquivo

---

## 🎯 Arquitetura

### URLs:
```
/                              ← Landing page
/auth/login                    ← Login
/auth/register                 ← Registro

/tenant/minha-loja/dashboard   ← Dashboard do tenant
/tenant/minha-loja/pedidos     ← Pedidos
/tenant/minha-loja/produtos    ← Produtos
/tenant/minha-loja/clientes    ← Clientes
/tenant/minha-loja/whatsapp    ← WhatsApp

/admin/tenants                 ← Admin: gerenciar tenants
```

### Multi-Tenant:
- **Sem subdomínios** - Tudo em um único domínio
- **Isolamento por path** - Cada tenant tem `/tenant/seu-slug`
- **Segurança RLS** - Supabase garante isolamento de dados

---

## 🚀 Deploy Railway (10 minutos)

### 1. Push para GitHub
```bash
git init
git add .
git commit -m "feat: OrderZap v2 initial setup"
git remote add origin https://github.com/rmalves29/orderzap-v2.git
git push -u origin main
```

### 2. Conectar no Railway
- Railway → New Project
- Deploy from GitHub
- Selecionar: orderzap-v2
- **Root Directory:** (VAZIO)

### 3. Adicionar Variáveis
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=https://seu-app.railway.app
NODE_ENV=production
```

### 4. Deploy Automático
- Railway faz build e deploy
- ~2-3 minutos
- App fica online

---

## ✅ Status Atual

**Criado (15%):**
- ✅ Estrutura de pastas
- ✅ Configurações base
- ✅ Dockerfile otimizado
- ✅ Documentação completa

**Próximo (85%):**
- [ ] Páginas de autenticação
- [ ] Layout do tenant
- [ ] CRUD de recursos
- [ ] Integração WhatsApp
- [ ] Deploy

---

## 🎯 Próximos Passos

### Desenvolvimento Local:
1. Criar `app/layout.tsx` e `app/page.tsx` (landing)
2. Criar `app/auth/login/page.tsx` (login)
3. Criar `app/auth/register/page.tsx` (registro)
4. Criar `app/tenant/[tenantSlug]/layout.tsx` (layout tenant)
5. Criar `app/tenant/[tenantSlug]/dashboard/page.tsx`

### Banco de Dados:
1. Executar SQL no Supabase (ver README.md)
2. Configurar RLS policies
3. Testar queries

### Deploy:
1. Push para GitHub
2. Conectar Railway
3. Configurar variáveis
4. Deploy automático

---

## 💡 Comandos Úteis

```bash
# Desenvolvimento
npm run dev          # Rodar localmente
npm run build        # Build produção
npm run start        # Rodar produção local
npm run lint         # Lint código
npm run type-check   # Verificar TypeScript

# Git
git status           # Ver mudanças
git add .            # Adicionar tudo
git commit -m "msg"  # Commit
git push             # Push para GitHub

# Railway (via CLI - opcional)
railway login        # Login Railway
railway up           # Deploy manual
railway logs         # Ver logs
```

---

## 🎊 Pronto para Usar!

Você tem agora:
- ✅ Projeto configurado
- ✅ Dockerfile otimizado
- ✅ Documentação completa
- ✅ Pronto para desenvolvimento

**Começe pelo SETUP.md para instruções detalhadas!**

---

**Stack:** Next.js 14 + TypeScript + Supabase + Baileys  
**Deploy:** Railway (single service)  
**Multi-tenant:** Path-based (sem subdomínio)  
**Status:** Base criada - pronto para desenvolvimento
