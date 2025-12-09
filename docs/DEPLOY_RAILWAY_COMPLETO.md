# 🚀 Deploy Completo no Railway - Backend + Frontend

Guia passo a passo para fazer deploy do OrderZap v2 no Railway com arquitetura separada.

---

## 📋 ANTES DE COMEÇAR

### ✅ Checklist de Pré-requisitos

- [ ] Conta no Railway (https://railway.app)
- [ ] Projeto no Supabase configurado
- [ ] Repositório no GitHub com código atualizado
- [ ] 15 minutos disponíveis

### 📦 O que será criado:

```
Railway
├── Backend (Node.js + Express + Baileys)
│   └── URL: https://backend-xxx.railway.app
│
└── Frontend (Next.js 14)
    └── URL: https://frontend-xxx.railway.app
```

---

## 🎯 PASSO 1: PREPARAR CREDENCIAIS DO SUPABASE

1. **Acesse Supabase Dashboard:**
   - Vá em https://supabase.com/dashboard
   - Selecione seu projeto
   - Clique em ⚙️ **Settings** → **API**

2. **Copie as seguintes informações:**

   ✏️ **Project URL:**
   ```
   https://seu-projeto.supabase.co
   ```

   ✏️ **anon public key:**
   ```
   eyJhbGci...
   ```

   ✏️ **service_role key:** (⚠️ SECRETA - não compartilhe)
   ```
   eyJhbGci...
   ```

📋 **Salve essas 3 informações em um bloco de notas!**

---

## 🎯 PASSO 2: DEPLOY DO BACKEND (API + WhatsApp)

### 2.1. Criar Serviço no Railway

1. **Acesse:** https://railway.app/dashboard
2. Clique em **"New Project"**
3. Selecione **"Deploy from GitHub repo"**
4. Escolha o repositório: `rmalves29/orderzap2` (ou seu repositório)
5. Clique em **"Add variables later"** (vamos configurar depois)

### 2.2. Configurar Build do Backend

1. Na página do serviço, clique em **"Settings"**
2. Em **"Build"**, configure:
   - ✅ **Root Directory:** `backend`
   - ✅ **Builder:** Dockerfile
   - ✅ **Dockerfile Path:** `Dockerfile`

3. Clique em **"Save"**

### 2.3. Configurar Variáveis de Ambiente

1. Clique em **"Variables"** (no menu lateral)
2. Clique em **"New Variable"**
3. Adicione as seguintes variáveis **UMA POR UMA:**

   ```env
   # 1. Porta do servidor
   PORT=3001
   
   # 2. Ambiente
   NODE_ENV=production
   
   # 3. URL do Supabase (cole a URL que você copiou)
   SUPABASE_URL=https://seu-projeto.supabase.co
   
   # 4. Service Role Key do Supabase (cole a chave que você copiou)
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...sua-chave-service-role
   
   # 5. URL do Frontend (temporário, vamos atualizar depois)
   FRONTEND_URL=https://temporary.railway.app
   
   # 6. Caminho das sessões do WhatsApp
   WHATSAPP_SESSIONS_PATH=/app/whatsapp-sessions
   
   # 7. Nível de log
   LOG_LEVEL=info
   ```

4. Clique em **"Deploy"** (canto superior direito)

### 2.4. Obter URL do Backend

1. Aguarde o build (2-3 minutos)
2. Quando aparecer ✅ **"Success"**, clique em **"Settings"** → **"Networking"**
3. Clique em **"Generate Domain"**
4. **COPIE A URL GERADA:**
   ```
   https://backend-production-xxxx.railway.app
   ```

5. **Teste o backend:**
   - Abra em uma nova aba: `https://backend-production-xxxx.railway.app/health`
   - Deve retornar:
     ```json
     {
       "status": "healthy",
       "service": "OrderZap Backend API",
       "version": "2.0.0"
     }
     ```

✅ **Backend deploy completo!** Salve a URL do backend.

---

## 🎯 PASSO 3: DEPLOY DO FRONTEND (Next.js)

### 3.1. Criar Segundo Serviço

1. No Railway Dashboard, clique em **"New"** → **"GitHub Repo"**
2. Selecione **o mesmo repositório** (`rmalves29/orderzap2`)
3. Clique em **"Add variables later"**

### 3.2. Configurar Build do Frontend

1. Na página do serviço, clique em **"Settings"**
2. Em **"Build"**, configure:
   - ✅ **Root Directory:** `frontend`
   - ✅ **Builder:** Dockerfile
   - ✅ **Dockerfile Path:** `Dockerfile`

3. Clique em **"Save"**

### 3.3. Configurar Variáveis de Ambiente

1. Clique em **"Variables"**
2. Adicione as seguintes variáveis:

   ```env
   # 1. Ambiente
   NODE_ENV=production
   
   # 2. URL do Backend (cole a URL do backend que você salvou)
   NEXT_PUBLIC_API_URL=https://backend-production-xxxx.railway.app
   
   # 3. URL do Supabase
   NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
   
   # 4. Anon Key do Supabase
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...sua-anon-key
   
   # 5. URL do App (temporário, vamos atualizar)
   NEXT_PUBLIC_APP_URL=https://temporary.railway.app
   ```

4. Clique em **"Deploy"**

### 3.4. Obter URL do Frontend e Atualizar Variáveis

1. Aguarde o build (3-5 minutos)
2. Quando aparecer ✅ **"Success"**, clique em **"Settings"** → **"Networking"**
3. Clique em **"Generate Domain"**
4. **COPIE A URL GERADA:**
   ```
   https://frontend-production-xxxx.railway.app
   ```

5. **Atualize a variável `NEXT_PUBLIC_APP_URL`:**
   - Clique em **"Variables"**
   - Encontre `NEXT_PUBLIC_APP_URL`
   - Clique no lápis ✏️ para editar
   - Cole a URL do frontend: `https://frontend-production-xxxx.railway.app`
   - Salve

6. **Volte ao serviço do BACKEND e atualize `FRONTEND_URL`:**
   - Acesse o serviço do Backend
   - Clique em **"Variables"**
   - Encontre `FRONTEND_URL`
   - Cole a URL do frontend: `https://frontend-production-xxxx.railway.app`
   - Salve

7. **Faça redeploy de ambos os serviços:**
   - Backend: Clique em **"Deployments"** → **"Redeploy"**
   - Frontend: Clique em **"Deployments"** → **"Redeploy"**

---

## 🎯 PASSO 4: CONFIGURAR BANCO DE DADOS

### 4.1. Executar SQL no Supabase

1. **Acesse Supabase Dashboard:**
   - Vá em https://supabase.com/dashboard
   - Selecione seu projeto
   - Clique em **"SQL Editor"** (no menu lateral)

2. **Copie TODO o conteúdo do arquivo `database.sql` do repositório**
   - Abra: `https://github.com/rmalves29/orderzap2/blob/main/database.sql`
   - Copie todo o SQL

3. **Cole no SQL Editor do Supabase**

4. **Clique em "Run"** (canto inferior direito)

5. **Aguarde a mensagem "Success"**

✅ **Banco de dados configurado!**

---

## 🎯 PASSO 5: TESTAR A APLICAÇÃO

### 5.1. Teste o Frontend

1. **Acesse a URL do frontend:**
   ```
   https://frontend-production-xxxx.railway.app
   ```

2. **Você deve ver a landing page do OrderZap**

3. **Clique em "Criar Conta Grátis"**

4. **Registre uma conta de teste**

### 5.2. Teste a Conexão Backend ↔ Frontend

1. **Teste o health check do backend:**
   ```
   https://backend-production-xxxx.railway.app/health
   ```

2. **Teste o health check do frontend:**
   ```
   https://frontend-production-xxxx.railway.app/api/health
   ```

Ambos devem retornar `"status": "healthy"`

### 5.3. Teste a Integração WhatsApp

1. **Faça login no sistema**

2. **Acesse a área de configuração do WhatsApp**

3. **Clique em "Conectar WhatsApp"**

4. **Um QR Code deve aparecer**

5. **Escaneie com seu WhatsApp**

6. **Status deve mudar para "Conectado"**

---

## ✅ DEPLOY COMPLETO!

### 📊 Resumo dos Serviços:

| Serviço | URL | Status |
|---------|-----|--------|
| **Backend** | https://backend-xxx.railway.app | ✅ |
| **Frontend** | https://frontend-xxx.railway.app | ✅ |
| **Supabase** | https://seu-projeto.supabase.co | ✅ |

### 🔗 URLs Importantes:

- **Aplicação:** https://frontend-xxx.railway.app
- **API Backend:** https://backend-xxx.railway.app
- **Health Check Backend:** https://backend-xxx.railway.app/health
- **Health Check Frontend:** https://frontend-xxx.railway.app/api/health

---

## 🐛 RESOLUÇÃO DE PROBLEMAS

### ❌ Backend não inicia

**Sintoma:** Build falha ou serviço fica reiniciando

**Solução:**
1. Verifique logs: Railway Dashboard → Deployments → Clique no deploy → "Logs"
2. Certifique-se de que `Root Directory` está `backend`
3. Verifique se todas as 7 variáveis de ambiente estão configuradas

### ❌ Frontend mostra erro 500

**Sintoma:** Páginas retornam erro interno

**Solução:**
1. Verifique se `NEXT_PUBLIC_API_URL` aponta para o backend correto
2. Teste o backend diretamente: `https://backend-xxx.railway.app/health`
3. Verifique logs do frontend no Railway

### ❌ CORS Error

**Sintoma:** Console do navegador mostra "blocked by CORS"

**Solução:**
1. Certifique-se de que `FRONTEND_URL` no backend está configurada corretamente
2. A URL deve ser EXATAMENTE a URL do frontend (sem barra no final)
3. Faça redeploy do backend após alterar

### ❌ WhatsApp não conecta

**Sintoma:** QR Code não aparece ou erro ao conectar

**Solução:**
1. Verifique logs do backend: Railway → Backend → Deployments → Logs
2. Certifique-se de que a pasta `whatsapp-sessions` tem permissões
3. Tente desconectar e reconectar

### ❌ Build falha no Frontend

**Sintoma:** Erro durante `npm run build`

**Solução:**
1. Verifique se `output: 'standalone'` está no `next.config.js`
2. Certifique-se de que todas as dependências estão no `package.json`
3. Teste build localmente: `cd frontend && npm run build`

---

## 📚 PRÓXIMOS PASSOS

1. ✅ **Domínio Personalizado:**
   - Railway Settings → Networking → Custom Domain
   - Configure seu domínio (ex: `app.seusite.com`)

2. ✅ **Configurar Tenants:**
   - Acesse `/admin` no frontend
   - Crie seus tenants (lojas)

3. ✅ **Desenvolver Features:**
   - Backend: Adicione rotas em `backend/src/routes/`
   - Frontend: Adicione páginas em `frontend/app/`

4. ✅ **Monitoramento:**
   - Railway Dashboard → Metrics
   - Configure alertas de uptime

---

## 🆘 SUPORTE

**Documentação:**
- Backend: `backend/README.md`
- Frontend: `frontend/README.md`

**Logs:**
- Railway Dashboard → Deployments → Logs

**Precisa de ajuda?**
- Descreva o erro específico
- Copie os logs relevantes
- Informe qual passo está travado

---

**Versão:** 2.0.0  
**Data:** 09/12/2025  
**Autor:** OrderZap Team

✨ **Boa sorte com seu deploy!** ✨
