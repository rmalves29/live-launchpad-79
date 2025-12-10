# 🚂 CONFIGURAR RAILWAY - Guia Completo

## 🚨 PROBLEMA IDENTIFICADO

O Railway estava tentando rodar `server-stable.js` mas o erro indica:
```
npm error command sh -c node server-stable.js
```

**Causa:** Configuração conflitante ou cache antigo.

---

## ✅ SOLUÇÃO APLICADA

### 1. **Removido railway.toml da raiz**
Havia 2 arquivos conflitantes:
- ❌ `/railway.toml` (deletado)
- ✅ `/backend/railway.toml` (mantido)

### 2. **Configuração Correta**

**Arquivo:** `backend/railway.toml`
```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

**Arquivo:** `backend/package.json`
```json
{
  "scripts": {
    "start": "node src/index.js"
  }
}
```

**Arquivo:** `backend/Dockerfile`
```dockerfile
CMD ["npm", "start"]
```

**Fluxo:**
```
Railway → Dockerfile → npm start → node src/index.js ✅
```

---

## 🔧 CONFIGURAÇÃO DO RAILWAY (Dashboard)

### Passo 1: Acessar Configurações
1. Acesse: https://railway.app
2. Entre no projeto **backend**
3. Vá em **Settings**

### Passo 2: Configurar Root Directory
- **Root Directory:** `backend`
- **Builder:** Dockerfile (automaticamente detectado)

### Passo 3: Variáveis de Ambiente

Adicione no Railway Dashboard → Variables:

```env
PORT=3001
NODE_ENV=production
AUTH_DIR=/tmp/auth_sessions
```

**Opcional (se usar Supabase):**
```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=seu-service-role-key
```

### Passo 4: Limpar Cache e Redesenhar

**Opção A - Via Dashboard:**
1. Vá em **Deployments**
2. Clique nos **3 pontinhos**
3. Selecione **"Redeploy"**
4. ✅ Marque **"Clear Build Cache"** (IMPORTANTE!)
5. Clique em **Redeploy**

**Opção B - Via CLI:**
```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link projeto
railway link

# Deploy com cache limpo
railway up --detach
```

---

## 🧪 TESTAR APÓS DEPLOY

### 1. Aguardar Deploy (2-4 minutos)

Acompanhe os logs no Railway:
```
Building Docker image...
Installing dependencies...
Starting application...
✅ WhatsApp Baileys Backend v1.0.0
✅ Rodando na porta 3001
```

### 2. Testar Health Check

```bash
curl https://backend-production-2599.up.railway.app/health
```

**Resposta esperada:**
```json
{
  "ok": true,
  "status": "healthy",
  "version": "1.0.0",
  "activeSessions": 0
}
```

### 3. Testar Geração de QR Code

```bash
curl -X POST https://backend-production-2599.up.railway.app/start/teste123
```

**Resposta esperada (após ~2 segundos):**
```json
{
  "ok": true,
  "message": "Sessão iniciada, aguardando QR scan",
  "sessionId": "teste123",
  "status": "waiting_qr",
  "hasQR": true,
  "qr": "data:image/png;base64,iVBORw0KGgo..."
}
```

### 4. Verificar QR Code no Browser

Copie o valor do campo `qr` e cole em:
```
data:image/png;base64,iVBORw0KGgo...
```

Abra no navegador - deve mostrar um QR code válido do WhatsApp! 📱

---

## 🐛 TROUBLESHOOTING

### ❌ Erro: "npm error command failed"

**Causa:** Cache antigo ou configuração errada.

**Solução:**
1. Vá em Railway Dashboard
2. Settings → **Danger Zone**
3. **Remove Build Cache**
4. Force redeploy

### ❌ Erro: "Cannot find module 'src/index.js'"

**Causa:** Dockerfile não está copiando arquivos corretamente.

**Solução:**
Verificar se `backend/Dockerfile` tem:
```dockerfile
COPY . .
```

### ❌ Erro: "SIGTERM" no log

**Causa:** 
1. Aplicação travando durante inicialização
2. Healthcheck falhando
3. Timeout de build

**Solução:**
1. Aumentar timeout: `healthcheckTimeout = 60`
2. Verificar logs completos no Railway
3. Testar localmente com Docker:
   ```bash
   cd backend
   docker build -t backend-test .
   docker run -p 3001:3001 backend-test
   ```

### ❌ QR Code não aparece

**Causa:** Baileys pode demorar até 5 segundos para gerar QR.

**Solução:**
1. Aguardar pelo menos 5 segundos
2. Chamar `/status/:sessionId` para verificar
3. Chamar `/qr/:sessionId` para pegar QR code

---

## 📊 ESTRUTURA FINAL DO PROJETO

```
live-launchpad-79/
├── backend/
│   ├── src/
│   │   └── index.js          ← Servidor principal
│   ├── Dockerfile             ← Build Docker
│   ├── railway.toml           ← Config Railway
│   └── package.json           ← Scripts e deps
│       └── "start": "node src/index.js"
│
├── frontend/
│   └── railway.toml
│
└── supabase/
    └── functions/
        └── whatsapp-proxy/
            └── index.ts
```

---

## ✅ CHECKLIST DE DEPLOY

- [x] Remover railway.toml da raiz
- [x] Verificar backend/package.json aponta para src/index.js
- [x] Verificar backend/railway.toml usa Dockerfile
- [ ] **Limpar cache do Railway** (FAZER AGORA)
- [ ] **Force redeploy** (FAZER AGORA)
- [ ] Aguardar 3-4 minutos
- [ ] Testar /health
- [ ] Testar /start/:sessionId
- [ ] Verificar QR code gerado
- [ ] Testar no frontend

---

## 🎯 PRÓXIMA AÇÃO IMEDIATA

### **VOCÊ PRECISA FAZER AGORA:**

1. **Acesse Railway Dashboard:** https://railway.app
2. **Entre no projeto backend**
3. **Vá em Deployments**
4. **Clique nos 3 pontinhos do último deploy**
5. **Selecione "Redeploy"**
6. **✅ MARQUE "Clear Build Cache"** ← IMPORTANTE!
7. **Clique em Redeploy**
8. **Aguarde 3-4 minutos**

### **Depois do Deploy:**

Teste com:
```bash
curl https://backend-production-2599.up.railway.app/health
```

Se retornar `{"ok": true}` → **✅ FUNCIONOU!**

Então teste o QR code:
```bash
curl -X POST https://backend-production-2599.up.railway.app/start/teste123
```

Se retornar QR code base64 → **🎉 SISTEMA 100% FUNCIONAL!**

---

**Data:** 2025-12-10  
**Status:** ✅ Configuração correta aplicada  
**Ação pendente:** Limpar cache e redesenhar no Railway
