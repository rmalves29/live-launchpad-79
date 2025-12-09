# 📱 OrderZap v2 - Sistema Multi-Tenant com WhatsApp

Sistema completo de gestão de pedidos com integração WhatsApp gratuita (Baileys).

**Arquitetura:** Backend (Node.js + Express) + Frontend (Next.js 14)

---

## 🚀 INÍCIO RÁPIDO

### ⚡ Para Amadores (5 minutos)

```bash
# 1. Clone o repositório
git clone https://github.com/rmalves29/orderzap2.git
cd orderzap2

# 2. Siga o guia de deploy
# Abra: DEPLOY_RAILWAY_COMPLETO.md
```

### 🛠️ Para Desenvolvedores

```bash
# Backend
cd backend
npm install
cp .env.example .env
npm run dev  # Porta 3001

# Frontend (em outra janela)
cd frontend
npm install
cp .env.example .env.local
npm run dev  # Porta 3000
```

---

## 📁 ESTRUTURA DO PROJETO

```
orderzap-v2/
│
├── backend/                    # API Node.js + Express + Baileys
│   ├── src/
│   │   ├── server.js          # Servidor Express
│   │   ├── config/            # Configurações (Supabase, Logger)
│   │   ├── controllers/       # Controladores de rotas
│   │   ├── routes/            # Definição de rotas
│   │   └── services/          # Lógica de negócio (WhatsApp)
│   ├── Dockerfile             # Build para Railway
│   ├── package.json
│   └── README.md              # Documentação do Backend
│
├── frontend/                   # Interface Next.js 14
│   ├── app/
│   │   ├── page.tsx           # Landing page
│   │   ├── auth/              # Autenticação
│   │   ├── tenant/[slug]/     # Área multi-tenant
│   │   ├── admin/             # Administração
│   │   └── api/               # API Routes do Next.js
│   ├── lib/
│   │   └── api.ts             # Cliente HTTP para Backend
│   ├── Dockerfile             # Build para Railway
│   ├── package.json
│   └── README.md              # Documentação do Frontend
│
├── database.sql               # Schema do Supabase
│
├── docs/                      # Documentação
│   ├── DEPLOY_RAILWAY_COMPLETO.md
│   ├── ARQUITETURA.md
│   └── ... (outros guias)
│
└── README.md                  # Este arquivo
```

---

## 🎯 CARACTERÍSTICAS

### ✅ Backend (API + WhatsApp)

- 🔌 **Express.js** - Framework web rápido
- 📱 **Baileys** - Integração WhatsApp 100% gratuita
- 🔐 **Supabase Client** - Conexão com banco de dados
- 📊 **Pino Logger** - Logs estruturados
- 🎯 **Multi-Tenant** - Sessões isoladas por loja

**Endpoints:**
- `/api/whatsapp/*` - Gerenciamento WhatsApp
- `/api/orders/*` - CRUD de pedidos
- `/health` - Health check

### ✅ Frontend (Interface)

- ⚡ **Next.js 14** - App Router (SSR)
- 🎨 **Tailwind CSS** - Estilização moderna
- 🔐 **Supabase Auth** - Autenticação segura
- 📱 **Responsivo** - Mobile-first
- 🌍 **Multi-Tenant** - `/tenant/[slug]/`

**Páginas:**
- `/` - Landing page
- `/auth/login` - Login
- `/tenant/[slug]` - Dashboard
- `/tenant/[slug]/whatsapp` - Config WhatsApp
- `/admin` - Administração

---

## 🏗️ ARQUITETURA

```
┌──────────────┐         ┌──────────────┐         ┌──────────┐
│   FRONTEND   │  HTTP   │   BACKEND    │  SQL    │ SUPABASE │
│  (Next.js)   │ ◄────► │  (Express)   │ ◄────► │   (PG)   │
│   Port 3000  │  REST   │  Port 3001   │         │          │
└──────────────┘         └──────────────┘         └──────────┘
                               │
                               │ WebSocket
                               ▼
                         ┌──────────┐
                         │ WHATSAPP │
                         │ (Baileys)│
                         └──────────┘
```

**Vantagens da Separação:**
- ✅ WhatsApp isolado (mais estável)
- ✅ Escalabilidade independente
- ✅ Deploy sem afetar sessões ativas
- ✅ Manutenção simplificada

---

## 🐳 DEPLOY NO RAILWAY

### Opção 1: Deploy Automático (Recomendado)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

### Opção 2: Manual (Passo a Passo Completo)

**📖 Siga o guia detalhado:**
```
Abra: DEPLOY_RAILWAY_COMPLETO.md
```

**Resumo:**
1. Criar 2 serviços no Railway
2. Serviço 1: Backend (root dir: `backend`)
3. Serviço 2: Frontend (root dir: `frontend`)
4. Configurar variáveis de ambiente
5. Deploy!

**Tempo estimado:** 15 minutos

---

## 📋 VARIÁVEIS DE AMBIENTE

### Backend (`.env`)
```env
PORT=3001
NODE_ENV=production
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
FRONTEND_URL=https://seu-frontend.railway.app
WHATSAPP_SESSIONS_PATH=/app/whatsapp-sessions
LOG_LEVEL=info
```

### Frontend (`.env.local`)
```env
NEXT_PUBLIC_API_URL=https://seu-backend.railway.app
NEXT_PUBLIC_APP_URL=https://seu-frontend.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
NODE_ENV=production
```

---

## 🗄️ BANCO DE DADOS

### Setup Supabase

1. **Criar projeto:**
   - Acesse https://supabase.com
   - Crie novo projeto

2. **Executar SQL:**
   - Copie conteúdo de `database.sql`
   - Cole no SQL Editor do Supabase
   - Execute

3. **Copiar credenciais:**
   - Settings → API
   - Copie URL, anon key, service_role key

**Tabelas criadas:**
- `tenants` - Lojas/Tenants
- `tenant_users` - Usuários
- `products` - Produtos
- `customers` - Clientes
- `orders` - Pedidos
- `whatsapp_sessions` - Sessões WhatsApp
- `whatsapp_messages` - Mensagens

---

## 📱 COMO CONECTAR WHATSAPP

### Passo a Passo:

1. **Acesse o sistema**
   ```
   https://seu-frontend.railway.app
   ```

2. **Faça login**

3. **Vá em Configurações → WhatsApp**

4. **Clique em "Conectar WhatsApp"**

5. **Escaneie o QR Code com seu WhatsApp**

6. **Aguarde confirmação "✅ Conectado"**

7. **Pronto! Agora pode enviar mensagens via sistema**

### API WhatsApp:

```javascript
// Conectar
POST /api/whatsapp/start
{
  "tenantId": "minha-loja"
}

// Obter QR Code
GET /api/whatsapp/qrcode/:tenantId

// Verificar status
GET /api/whatsapp/status/:tenantId

// Enviar mensagem
POST /api/whatsapp/send-message
{
  "tenantId": "minha-loja",
  "to": "5511999999999",
  "message": "Seu pedido está pronto!"
}
```

---

## 🎓 DOCUMENTAÇÃO

### Para Iniciantes:
- 📖 **`DEPLOY_RAILWAY_COMPLETO.md`** - Guia passo a passo com screenshots
- 📖 **`GUIA_5_MINUTOS.md`** - Quick start
- 📖 **`GUIA_RESOLVER_ERROS.md`** - Troubleshooting

### Para Desenvolvedores:
- 📖 **`ARQUITETURA.md`** - Arquitetura detalhada
- 📖 **`backend/README.md`** - Documentação do Backend
- 📖 **`frontend/README.md`** - Documentação do Frontend
- 📖 **`COMOFUNCIONA.md`** - Como o sistema funciona

---

## 🛠️ DESENVOLVIMENTO

### Backend

```bash
cd backend

# Instalar
npm install

# Configurar
cp .env.example .env
# Edite .env com suas credenciais

# Desenvolver
npm run dev  # Com watch mode

# Testar
curl http://localhost:3001/health
```

### Frontend

```bash
cd frontend

# Instalar
npm install

# Configurar
cp .env.example .env.local
# Edite .env.local

# Desenvolver
npm run dev

# Build
npm run build
npm start
```

---

## 🧪 TESTES

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test
```

---

## 🐛 TROUBLESHOOTING

### ❌ Backend não inicia
```bash
# Verificar logs
docker logs <container-id>

# Verificar porta
lsof -i :3001

# Testar health
curl http://localhost:3001/health
```

### ❌ Frontend não conecta ao Backend
```bash
# Verificar variável
echo $NEXT_PUBLIC_API_URL

# Testar backend
curl https://seu-backend.railway.app/health
```

### ❌ WhatsApp não conecta
```bash
# Verificar logs do backend
# Railway → Backend → Deployments → Logs

# Procure por erros relacionados a Baileys
```

### ❌ CORS Error
```bash
# Certifique-se que FRONTEND_URL está correto no backend
# Deve ser: https://seu-frontend.railway.app (sem barra final)
```

**📖 Guia completo:** `GUIA_RESOLVER_ERROS.md`

---

## 📊 TECNOLOGIAS

### Backend
- Node.js 18+
- Express.js 4.x
- Baileys 6.x (WhatsApp)
- Supabase Client 2.x
- Pino (Logger)
- QRCode

### Frontend
- Next.js 14.x
- React 18.x
- TypeScript 5.x
- Tailwind CSS 3.x
- Supabase Auth Helpers

### Infraestrutura
- Railway (Deploy)
- Supabase (Database + Auth)
- Docker (Containerização)

---

## 🤝 CONTRIBUINDO

```bash
# 1. Fork o projeto
# 2. Crie uma branch
git checkout -b feature/minha-feature

# 3. Commit suas mudanças
git commit -m "feat: Minha nova feature"

# 4. Push para a branch
git push origin feature/minha-feature

# 5. Abra um Pull Request
```

---

## 📝 LICENÇA

MIT License - veja `LICENSE` para detalhes.

---

## 🆘 SUPORTE

### Documentação
- 📖 Backend: `backend/README.md`
- 📖 Frontend: `frontend/README.md`
- 📖 Arquitetura: `ARQUITETURA.md`
- 📖 Deploy: `DEPLOY_RAILWAY_COMPLETO.md`

### Issues
- 🐛 Bug Reports: [GitHub Issues](https://github.com/rmalves29/orderzap2/issues)
- 💡 Feature Requests: [GitHub Issues](https://github.com/rmalves29/orderzap2/issues)

### Logs
- Railway Dashboard → Deployments → Logs
- Backend: `/health`
- Frontend: `/api/health`

---

## 🎯 ROADMAP

### v2.0 (Atual)
- ✅ Backend separado com Express
- ✅ Frontend Next.js 14
- ✅ Integração Baileys
- ✅ Multi-tenant
- ✅ Deploy Railway

### v2.1 (Próximo)
- ⏳ Autenticação JWT no Backend
- ⏳ Rate Limiting
- ⏳ WebSockets (tempo real)
- ⏳ Testes automatizados
- ⏳ CI/CD GitHub Actions

### v2.2 (Futuro)
- ⏳ Webhooks
- ⏳ API GraphQL
- ⏳ Dashboard Analytics
- ⏳ App Mobile (React Native)

---

## 📈 STATUS

**Versão:** 2.0.0  
**Status:** 🟢 Produção  
**Última atualização:** 09/12/2025

### Componentes

| Componente | Status | Health |
|------------|--------|--------|
| Backend API | 🟢 Online | `/health` |
| Frontend | 🟢 Online | `/api/health` |
| WhatsApp | 🟢 Funcional | Baileys 6.x |
| Database | 🟢 Online | Supabase |

---

## ⭐ CRÉDITOS

**Desenvolvido por:** OrderZap Team  
**Powered by:**
- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp library
- [Next.js](https://nextjs.org/) - React framework
- [Express](https://expressjs.com/) - Web framework
- [Supabase](https://supabase.com/) - Backend as a Service
- [Railway](https://railway.app/) - Hosting

---

## 🌟 SHOW YOUR SUPPORT

Se este projeto te ajudou, dê uma ⭐ no GitHub!

```bash
⭐ Star no GitHub: https://github.com/rmalves29/orderzap2
```

---

**🚀 Pronto para começar? Abra `DEPLOY_RAILWAY_COMPLETO.md`!**
