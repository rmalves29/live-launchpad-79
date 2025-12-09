# 🛒 OrderZap v2

> Sistema Multi-Tenant de gestão de pedidos com integração WhatsApp  
> **Next.js 14 • TypeScript • Supabase • Railway**

---

## 📚 COMEÇE AQUI - GUIAS COMPLETOS

### 🚀 Para Iniciantes (Recomendado!)

Escolha seu perfil:

| Perfil | Guia | Tempo | Objetivo |
|--------|------|-------|----------|
| 🏃 **Quero fazer funcionar AGORA** | [GUIA_5_MINUTOS.md](./GUIA_5_MINUTOS.md) | 15 min | Deploy ultrarrápido |
| 👶 **Nunca fiz deploy, explica tudo** | [GUIA_COMPLETO_AMADOR.md](./GUIA_COMPLETO_AMADOR.md) | 45 min | Passo a passo detalhado |
| 🎨 **Quero ver como as telas devem ficar** | [GUIA_VISUAL_TELAS.md](./GUIA_VISUAL_TELAS.md) | 20 min | Screenshots esperados |
| 🔧 **Deu erro, preciso de ajuda** | [GUIA_RESOLVER_ERROS.md](./GUIA_RESOLVER_ERROS.md) | Varia | Soluções para erros |

### 💻 Para Desenvolvedores

| Guia | Conteúdo |
|------|----------|
| [COMECE_AQUI.md](./COMECE_AQUI.md) | Setup local e desenvolvimento |
| [COMOFUNCIONA.md](./COMOFUNCIONA.md) | Arquitetura e explicações técnicas |
| [STATUS.md](./STATUS.md) | Progresso do projeto e roadmap |

---

## ⚡ INÍCIO ULTRARRÁPIDO

### Opção 1: Deploy Direto (Mais Rápido) ⭐

```
1. Criar conta gratuita no Supabase → https://supabase.com
2. Criar conta gratuita no Railway → https://railway.app
3. Seguir: GUIA_5_MINUTOS.md
```

**Resultado:** App no ar em ~15 minutos

### Opção 2: Desenvolvimento Local

```bash
git clone https://github.com/rmalves29/orderzap.git
cd orderzap/orderzap-v2
npm install
cp .env.example .env.local
# Editar .env.local com suas credenciais
npm run dev
# Abrir: http://localhost:3000
```

**Resultado:** App rodando local em ~10 minutos

---

## 🚀 STACK TECNOLÓGICA

```
Frontend:  Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS
Backend:   Next.js API Routes
Database:  Supabase (PostgreSQL)
Auth:      Supabase Auth
WhatsApp:  Baileys (open-source, gratuito)
Deploy:    Railway (Dockerfile otimizado)
```

**Por que essas tecnologias?**
- ✅ Modernas e amplamente usadas
- ✅ Documentação extensa
- ✅ Deploy simples (1 serviço)
- ✅ Custo baixo/gratuito
- ✅ Escalável

---

## 🏗️ ARQUITETURA MULTI-TENANT

Sistema baseado em **paths** (não subdomínios):

```
https://orderzap.railway.app/

├── /                          → Landing page
├── /auth/login                → Login
├── /auth/register             → Registro

├── /tenant/loja-abc/          → Área da "Loja ABC"
│   ├── dashboard              → Dashboard
│   ├── pedidos                → Gestão de pedidos
│   ├── produtos               → Catálogo
│   ├── clientes               → CRM
│   ├── whatsapp               → WhatsApp
│   └── config                 → Configurações

└── /admin/                    → Admin global
```

**Vantagens do path-based:**
- ✅ Sem configuração DNS
- ✅ Deploy em 1 único serviço
- ✅ URLs fáceis de compartilhar (ex: `orderzap.com/tenant/minha-loja`)
- ✅ Namespace único por tenant

**Exemplo prático:**
```
Usuário acessa:    https://orderzap.railway.app/tenant/loja-teste/dashboard
Sistema identifica: tenantSlug = "loja-teste"
Busca dados:       WHERE tenant.slug = "loja-teste"
Renderiza:         Dashboard da Loja Teste
```

---

## 📦 DOCUMENTAÇÃO COMPLETA

### Guias para Iniciantes (Passo a Passo)

| Arquivo | Conteúdo | Para Quem |
|---------|----------|-----------|
| **[GUIA_5_MINUTOS.md](./GUIA_5_MINUTOS.md)** | Deploy ultrarrápido no Railway | Quem quer testar rápido |
| **[GUIA_COMPLETO_AMADOR.md](./GUIA_COMPLETO_AMADOR.md)** | Tutorial detalhado do zero | Iniciantes sem experiência |
| **[GUIA_VISUAL_TELAS.md](./GUIA_VISUAL_TELAS.md)** | Como as telas devem aparecer | Confirmar se está certo |
| **[GUIA_RESOLVER_ERROS.md](./GUIA_RESOLVER_ERROS.md)** | Soluções para erros comuns | Quando algo dá errado |

### Guias para Desenvolvedores

| Arquivo | Conteúdo |
|---------|----------|
| **[COMECE_AQUI.md](./COMECE_AQUI.md)** | Setup local, variáveis, comandos úteis |
| **[COMOFUNCIONA.md](./COMOFUNCIONA.md)** | Arquitetura técnica e decisões de design |
| **[STATUS.md](./STATUS.md)** | Progresso do projeto, próximas features |

### Guias Técnicos

| Arquivo | Conteúdo |
|---------|----------|
| **[database.sql](./database.sql)** | Schema completo do Supabase (tabelas, RLS) |
| **[Dockerfile](./Dockerfile)** | Build otimizado para Railway |
| **[railway.toml](./railway.toml)** | Configuração de deploy no Railway |
| **[.env.example](./.env.example)** | Template de variáveis de ambiente |

---

## 🔧 VARIÁVEIS DE AMBIENTE

```env
# Supabase (obter em: Dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://abc123.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Local
# ou
NEXT_PUBLIC_APP_URL=https://seu-app.railway.app  # Produção

# Ambiente
NODE_ENV=development  # ou production
```

**Onde pegar as credenciais?**
1. Entrar no [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecionar seu projeto
3. Settings → API
4. Copiar: Project URL, anon public key, service_role key

Ver `.env.example` para template completo.

---

## 📊 STATUS DO PROJETO

**Versão:** 2.0  
**Progresso:** 20% (Base completa)

### ✅ Completo (100%)

- ✅ Infraestrutura (Next.js 14, TypeScript, Tailwind CSS)
- ✅ Configuração de deploy (Dockerfile, railway.toml)
- ✅ Landing page responsiva
- ✅ Health check API (`/api/health`)
- ✅ Database schema (tabelas: tenants, products)
- ✅ Documentação completa (~55 páginas)

### 🚧 Em Desenvolvimento (0%)

- 🚧 Sistema de autenticação (Supabase Auth)
- 🚧 Dashboard do tenant
- 🚧 CRUD de produtos
- 🚧 CRUD de clientes
- 🚧 Gestão de pedidos
- 🚧 Integração WhatsApp (Baileys)

### 📅 Próximos Passos

Ver **[STATUS.md](./STATUS.md)** para roadmap completo e estimativas de tempo.

**Tempo estimado para conclusão:** ~30-38 horas de desenvolvimento

---

## 🆘 PRECISA DE AJUDA?

### Erros Mais Comuns

| Erro | Solução Rápida | Guia Detalhado |
|------|----------------|----------------|
| **"Using Nixpacks"** | Railway → Settings → Build → Root Directory = (vazio) | [Seção 4.1](./GUIA_RESOLVER_ERROS.md#erro-using-nixpacks) |
| **"backend not found"** | Mesmo problema acima | [Seção 4.2](./GUIA_RESOLVER_ERROS.md#erro-backend-not-found) |
| **"npm: command not found"** | Instalar Node.js 20.x | [Seção 1.1](./GUIA_RESOLVER_ERROS.md#erro-npm-command-not-found) |
| **"Invalid API key"** | Verificar variáveis no Railway | [Seção 2.2](./GUIA_RESOLVER_ERROS.md#erro-invalid-api-key) |

### Não Encontrou?

1. **Ler [GUIA_RESOLVER_ERROS.md](./GUIA_RESOLVER_ERROS.md)** completo
2. **Verificar [GUIA_VISUAL_TELAS.md](./GUIA_VISUAL_TELAS.md)** se suas telas estão corretas
3. **Seguir checklist de debug** em [GUIA_RESOLVER_ERROS.md seção 9](./GUIA_RESOLVER_ERROS.md#9-checklist-de-debug)

---

## 🗂️ ESTRUTURA DE ARQUIVOS

```
orderzap-v2/
├── app/                          # Next.js App Router
│   ├── page.tsx                 # Landing page
│   ├── layout.tsx               # Layout global
│   ├── globals.css              # Estilos globais
│   └── api/
│       └── health/              # Health check endpoint
│           └── route.ts
│
├── public/                       # Assets estáticos
│
├── database.sql                 # Schema do Supabase
├── Dockerfile                   # Build para Railway
├── railway.toml                 # Config Railway
├── .dockerignore                # Otimizar build Docker
├── .railwayignore               # Ocultar pasta supabase do Railway
├── .env.example                 # Template de variáveis
│
├── package.json                 # Dependências
├── next.config.js               # Config Next.js
├── tsconfig.json                # Config TypeScript
├── tailwind.config.ts           # Config Tailwind CSS
│
└── docs/                        # Documentação (você está aqui!)
    ├── GUIA_5_MINUTOS.md
    ├── GUIA_COMPLETO_AMADOR.md
    ├── GUIA_VISUAL_TELAS.md
    ├── GUIA_RESOLVER_ERROS.md
    ├── COMECE_AQUI.md
    ├── COMOFUNCIONA.md
    └── STATUS.md
```

---

## 🔥 COMANDOS ÚTEIS

### Desenvolvimento

```bash
npm run dev              # Servidor local (http://localhost:3000)
npm run build            # Build de produção
npm run start            # Rodar build de produção
npm run lint             # Verificar código
```

### Git

```bash
git status               # Ver arquivos modificados
git add .                # Adicionar tudo
git commit -m "msg"      # Criar commit
git push origin main     # Enviar para GitHub
                        # Railway faz deploy automático após push
```

### Railway CLI (Opcional)

```bash
railway login            # Login no Railway
railway link             # Conectar projeto local ao Railway
railway logs             # Ver logs em tempo real
railway up               # Deploy manual
```

---

## 🎯 FEATURES PRINCIPAIS

### ✅ Já Implementado

- ✅ Landing page responsiva
- ✅ Health check API (`/api/health`)
- ✅ Database schema (2 tabelas: tenants, products)
- ✅ Deploy automatizado (Railway + Dockerfile)
- ✅ Documentação completa (~55 páginas)

### 🚧 Próximas Features (Ver STATUS.md)

- 🚧 Sistema de autenticação (Supabase Auth)
- 🚧 Dashboard multi-tenant
- 🚧 CRUD de produtos
- 🚧 CRUD de clientes
- 🚧 Gestão de pedidos
- 🚧 Integração WhatsApp (Baileys gratuito)
- 🚧 Relatórios e analytics
- 🚧 Etiquetas de envio

---

## 📈 VANTAGENS SOBRE v1

| Aspecto | v1 (Atual) | v2 (Novo) ⭐ |
|---------|------------|-------------|
| **Framework** | Vite + React | Next.js 14 |
| **API** | Express separado | API Routes integrado |
| **Deploy** | 2 serviços | 1 serviço único |
| **Build Time** | ~3-4 min | ~2 min |
| **SSR** | ❌ Não | ✅ Sim |
| **SEO** | ❌ Limitado | ✅ Completo |
| **Multi-tenant** | Subdomínio | Path-based (mais simples) |
| **Type Safety** | Parcial | 100% TypeScript |
| **WhatsApp** | Evolution API (pago) | Baileys (gratuito) |
| **Documentação** | ~5 páginas | ~55 páginas |

---

## 🤝 CONTRIBUINDO

Contribuições são bem-vindas! Para contribuir:

1. Fork o projeto
2. Criar branch para feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'feat: Adicionar MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abrir Pull Request

---

## 📜 LICENÇA

MIT License - Ver arquivo `LICENSE` para detalhes.

---

## 🙏 AGRADECIMENTOS

- **Next.js Team** - Framework incrível
- **Supabase Team** - Backend simplificado
- **Railway Team** - Deploy sem complicação
- **Baileys Team** - WhatsApp gratuito
- **Shadcn** - Componentes UI lindos

---

## 🔗 LINKS ÚTEIS

- **Supabase Dashboard:** https://supabase.com/dashboard
- **Railway Dashboard:** https://railway.app/dashboard
- **Next.js Docs:** https://nextjs.org/docs
- **Shadcn UI:** https://ui.shadcn.com/
- **Baileys Docs:** https://github.com/WhiskeySockets/Baileys

---

## ✨ COMEÇAR AGORA

Escolha seu caminho:

### 🏃 Rápido (15 minutos)
```bash
# 1. Ler: GUIA_5_MINUTOS.md
# 2. Criar conta Supabase + Railway
# 3. Deploy!
```

### 👶 Detalhado (45 minutos)
```bash
# 1. Ler: GUIA_COMPLETO_AMADOR.md
# 2. Seguir passo a passo
# 3. Confirmar com GUIA_VISUAL_TELAS.md
```

### 💻 Desenvolvimento (10 minutos)
```bash
git clone https://github.com/rmalves29/orderzap.git
cd orderzap/orderzap-v2
npm install
cp .env.example .env.local
npm run dev
```

---

**Criado com ❤️ para facilitar gestão de pedidos**  
**Versão:** 2.0  
**Status:** 🟡 Beta (20% completo)  
**Data:** 08/12/2025  

---

## 📞 SUPORTE

**Dúvidas sobre deploy?** → Ler [GUIA_COMPLETO_AMADOR.md](./GUIA_COMPLETO_AMADOR.md)  
**Erro no build?** → Ler [GUIA_RESOLVER_ERROS.md](./GUIA_RESOLVER_ERROS.md)  
**Quer desenvolver?** → Ler [COMECE_AQUI.md](./COMECE_AQUI.md)  
**Entender arquitetura?** → Ler [COMOFUNCIONA.md](./COMOFUNCIONA.md)

---

**🎉 PARABÉNS POR CHEGAR ATÉ AQUI!**

Agora é só escolher o guia adequado e começar! 🚀
