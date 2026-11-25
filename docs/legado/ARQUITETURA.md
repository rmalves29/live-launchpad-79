# 🏗️ Arquitetura OrderZap v2 - Backend + Frontend

Documentação completa da arquitetura separada para facilitar integração WhatsApp.

---

## 📐 VISÃO GERAL

```
┌─────────────────────────────────────────────────────────────┐
│                      ORDERZAP V2                            │
│                   Sistema Multi-Tenant                      │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────┐
│              │  HTTP   │              │  SQL    │          │
│   FRONTEND   │ ◄────► │   BACKEND    │ ◄────► │ SUPABASE │
│  (Next.js)   │  REST   │ (Express)    │         │  (PG)    │
│              │         │              │         │          │
└──────────────┘         └──────────────┘         └──────────┘
                               │
                               │ WebSocket
                               ▼
                         ┌──────────┐
                         │          │
                         │ WHATSAPP │
                         │ (Baileys)│
                         │          │
                         └──────────┘
```

---

## 🎯 COMPONENTES

### 1. **FRONTEND** (Next.js 14 + TypeScript)

**Responsabilidades:**
- ✅ Interface do usuário (UI/UX)
- ✅ Autenticação (Supabase Auth)
- ✅ Roteamento multi-tenant (`/tenant/[slug]`)
- ✅ Consumo da API Backend
- ✅ Server-Side Rendering (SSR)
- ✅ Estilização (Tailwind CSS)

**Tecnologias:**
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS + Shadcn UI
- Supabase Auth Helpers

**Estrutura:**
```
frontend/
├── app/
│   ├── page.tsx              # Landing page
│   ├── layout.tsx            # Layout raiz
│   ├── auth/                 # Autenticação
│   │   ├── login/
│   │   └── register/
│   ├── tenant/[slug]/        # Área multi-tenant
│   │   ├── page.tsx          # Dashboard
│   │   ├── orders/           # Gestão de pedidos
│   │   ├── whatsapp/         # Config WhatsApp
│   │   ├── products/         # Produtos
│   │   └── customers/        # Clientes
│   ├── admin/                # Administração
│   └── api/
│       └── health/           # Health check
├── lib/
│   ├── api.ts                # Cliente HTTP (Backend)
│   └── utils/
├── Dockerfile
├── next.config.js
└── package.json
```

**Deploy:**
- Railway (Dockerfile)
- Porta: 3000
- Health: `/api/health`

---

### 2. **BACKEND** (Node.js + Express + Baileys)

**Responsabilidades:**
- ✅ API REST para Frontend
- ✅ Integração WhatsApp (Baileys)
- ✅ Gerenciamento de sessões multi-tenant
- ✅ Envio de mensagens
- ✅ CRUD de pedidos
- ✅ Comunicação com Supabase

**Tecnologias:**
- Node.js 18+
- Express.js
- Baileys (WhatsApp)
- Supabase Client
- QRCode
- Pino (Logger)

**Estrutura:**
```
backend/
├── src/
│   ├── server.js             # Servidor Express
│   ├── config/
│   │   ├── supabase.js       # Cliente Supabase
│   │   └── logger.js         # Configuração Pino
│   ├── controllers/
│   │   └── whatsapp.controller.js  # Lógica WhatsApp
│   ├── services/
│   │   └── whatsapp.service.js     # Baileys
│   ├── routes/
│   │   ├── whatsapp.routes.js      # Rotas WhatsApp
│   │   └── order.routes.js         # Rotas Pedidos
│   └── middleware/           # (Futuro: auth, rate-limit)
├── whatsapp-sessions/        # Sessões (não comitar!)
├── Dockerfile
├── package.json
└── .env.example
```

**Deploy:**
- Railway (Dockerfile)
- Porta: 3001
- Health: `/health`

---

### 3. **SUPABASE** (PostgreSQL + Auth)

**Responsabilidades:**
- ✅ Banco de dados PostgreSQL
- ✅ Autenticação de usuários
- ✅ Row Level Security (RLS)
- ✅ APIs geradas automaticamente

**Tabelas Principais:**
- `tenants` - Lojas/Tenants
- `tenant_users` - Usuários por tenant
- `products` - Produtos
- `customers` - Clientes
- `orders` - Pedidos
- `whatsapp_sessions` - Sessões WhatsApp
- `whatsapp_messages` - Mensagens enviadas

---

## 🔄 FLUXO DE COMUNICAÇÃO

### 1. **Autenticação**

```
Usuario → Frontend → Supabase Auth
                ↓
         Recebe JWT Token
                ↓
         Armazena no Cookie
                ↓
    Todas as requests incluem token
```

### 2. **Conexão WhatsApp**

```
1. Usuario clica "Conectar WhatsApp" (Frontend)
   ↓
2. Frontend → POST /api/whatsapp/start (Backend)
   {
     "tenantId": "minha-loja"
   }
   ↓
3. Backend (Baileys) gera QR Code
   ↓
4. Backend → Frontend (Retorna QR Code Base64)
   {
     "status": "qr_generated",
     "qrCode": "data:image/png;base64,..."
   }
   ↓
5. Frontend exibe QR Code
   ↓
6. Usuario escaneia com WhatsApp
   ↓
7. Baileys autentica e salva sessão
   ↓
8. Frontend faz polling: GET /api/whatsapp/status/:tenantId
   ↓
9. Backend retorna status "connected"
   ↓
10. Frontend atualiza UI: "✅ Conectado"
```

### 3. **Envio de Mensagem**

```
1. Usuario digita mensagem no Frontend
   ↓
2. Frontend → POST /api/whatsapp/send-message (Backend)
   {
     "tenantId": "minha-loja",
     "to": "5511999999999",
     "message": "Seu pedido está pronto!"
   }
   ↓
3. Backend valida sessão existente
   ↓
4. Baileys envia mensagem via WhatsApp
   ↓
5. Backend salva no Supabase (whatsapp_messages)
   ↓
6. Backend → Frontend (Retorna confirmação)
   {
     "status": "sent",
     "messageId": "abc123"
   }
   ↓
7. Frontend exibe "✅ Mensagem enviada"
```

### 4. **Gestão de Pedidos**

```
1. Usuario cria pedido no Frontend
   ↓
2. Frontend → POST /api/orders (Backend)
   ↓
3. Backend salva no Supabase (orders table)
   ↓
4. Backend → Frontend (Retorna pedido criado)
   ↓
5. Frontend atualiza lista de pedidos
   ↓
6. (Opcional) Backend envia WhatsApp automático
```

---

## 🔒 SEGURANÇA

### Frontend
- ✅ **Autenticação:** Supabase Auth (JWT)
- ✅ **HTTPS:** Automático no Railway
- ✅ **Environment Vars:** `NEXT_PUBLIC_*` são públicas

### Backend
- ✅ **CORS:** Apenas Frontend permitido
- ✅ **API Keys:** Service Role Key (privada)
- ✅ **Sessões WhatsApp:** Isoladas por tenant
- ✅ **Rate Limiting:** (Futuro)
- ✅ **Input Validation:** (Futuro)

### Supabase
- ✅ **RLS Policies:** Acesso baseado em tenant
- ✅ **Service Role:** Apenas Backend
- ✅ **Anon Key:** Apenas Frontend

---

## 📡 API ENDPOINTS

### Backend API (`https://backend-xxx.railway.app`)

#### Health Check
```http
GET /health
```

#### WhatsApp

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/whatsapp/start` | Iniciar conexão |
| GET | `/api/whatsapp/qrcode/:tenantId` | Obter QR Code |
| GET | `/api/whatsapp/status/:tenantId` | Status da conexão |
| POST | `/api/whatsapp/disconnect` | Desconectar |
| POST | `/api/whatsapp/send-message` | Enviar mensagem |
| POST | `/api/whatsapp/send-media` | Enviar mídia |
| GET | `/api/whatsapp/sessions` | Listar sessões |

#### Pedidos

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/orders/:tenantId` | Listar pedidos |
| POST | `/api/orders` | Criar pedido |
| PATCH | `/api/orders/:id` | Atualizar pedido |

---

## 🌍 VARIÁVEIS DE AMBIENTE

### Frontend
```env
NEXT_PUBLIC_API_URL=https://backend-xxx.railway.app
NEXT_PUBLIC_APP_URL=https://frontend-xxx.railway.app
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
NODE_ENV=production
```

### Backend
```env
PORT=3001
NODE_ENV=production
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
FRONTEND_URL=https://frontend-xxx.railway.app
WHATSAPP_SESSIONS_PATH=/app/whatsapp-sessions
LOG_LEVEL=info
```

---

## 🚀 DEPLOY NO RAILWAY

### Estrutura no Railway:
```
Projeto: orderzap-v2
├── Serviço 1: Backend
│   ├── Root Directory: backend
│   ├── Builder: Dockerfile
│   └── Port: 3001
│
└── Serviço 2: Frontend
    ├── Root Directory: frontend
    ├── Builder: Dockerfile
    └── Port: 3000
```

### Ordem de Deploy:
1. ✅ Deploy Backend primeiro
2. ✅ Copie URL do Backend
3. ✅ Configure Frontend com `NEXT_PUBLIC_API_URL`
4. ✅ Deploy Frontend
5. ✅ Copie URL do Frontend
6. ✅ Atualize Backend com `FRONTEND_URL`
7. ✅ Redeploy ambos

---

## 🔧 DESENVOLVIMENTO LOCAL

### 1. Backend
```bash
cd backend
npm install
cp .env.example .env
# Edite .env
npm run dev  # Porta 3001
```

### 2. Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
# Edite .env.local
npm run dev  # Porta 3000
```

### 3. Acessar
- Frontend: http://localhost:3000
- Backend: http://localhost:3001/health

---

## 📊 MONITORAMENTO

### Railway Dashboard
- **Logs:** Deployments → Logs
- **Metrics:** CPU, RAM, Network
- **Health Checks:** Automático

### Health Checks
```bash
# Backend
curl https://backend-xxx.railway.app/health

# Frontend
curl https://frontend-xxx.railway.app/api/health
```

---

## 🆚 VANTAGENS DESTA ARQUITETURA

### ✅ Backend + Frontend Separados

**Vantagens:**
1. **Isolamento:** WhatsApp roda separado do frontend
2. **Escalabilidade:** Backend pode escalar independente
3. **Manutenção:** Mais fácil debugar e atualizar
4. **Deploy:** Mudanças no frontend não afetam WhatsApp
5. **Performance:** Backend otimizado para I/O
6. **Segurança:** API Keys isoladas no backend

### 🔄 Comparação com Arquitetura Única

| Aspecto | Único | Separado |
|---------|-------|----------|
| Deploy | 1 serviço | 2 serviços |
| Complexidade | Menor | Maior |
| Manutenção | Difícil | Fácil |
| Escalabilidade | Limitada | Flexível |
| WhatsApp | Instável | Estável |
| Custo Railway | Menor | Maior |

**Recomendação:** Arquitetura separada é **essencial** para WhatsApp funcionar bem.

---

## 🐛 TROUBLESHOOTING

### Backend não conecta WhatsApp
1. Verifique `WHATSAPP_SESSIONS_PATH`
2. Cheque logs: `docker logs <container>`
3. Teste sessão manual: `GET /api/whatsapp/status/:tenantId`

### Frontend não acha Backend
1. Verifique `NEXT_PUBLIC_API_URL`
2. Teste: `curl https://backend-xxx.railway.app/health`
3. Verifique CORS no backend

### CORS Error
1. Configure `FRONTEND_URL` no backend
2. URL exata (sem barra no final)
3. Redeploy backend

---

## 📚 PRÓXIMOS PASSOS

1. **Implementar Autenticação:** Middleware no backend
2. **Rate Limiting:** Proteger API de abuse
3. **WebSockets:** Notificações em tempo real
4. **Testes:** Jest + Supertest
5. **CI/CD:** GitHub Actions
6. **Domínio Customizado:** `app.seusite.com`

---

**Versão:** 2.0.0  
**Data:** 09/12/2025  
**Autor:** OrderZap Team  
**Licença:** MIT

🎯 **Arquitetura otimizada para produção!**
