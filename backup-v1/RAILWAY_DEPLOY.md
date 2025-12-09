# 🚂 Deploy no Railway - Guia Completo

## ✅ Problema Resolvido

O erro `npm: command not found` acontecia porque o Railway estava usando **Nixpacks** (detectando Deno) ao invés do **Dockerfile**.

### Solução Implementada:

1. ✅ Criado `railway.json` forçando uso do Dockerfile
2. ✅ Atualizado `nixpacks.toml` para desabilitar completamente
3. ✅ Otimizado `.dockerignore` para builds mais rápidos
4. ✅ Corrigido health check no Dockerfile para usar variável PORT do Railway

---

## 📋 Checklist de Deploy

### 1. Configuração no Railway (Web Interface)

Acesse: https://railway.app/project/seu-projeto/service

**Settings → Build:**
- ✅ Builder: **Dockerfile** (automático com railway.json)
- ✅ Dockerfile Path: `Dockerfile` (automático)
- ✅ Root Directory: **(deixar vazio)**

**Settings → Deploy:**
- ✅ Start Command: `node backend/server-main.js` (automático com railway.json)
- ✅ Healthcheck Path: `/health`
- ✅ Healthcheck Timeout: 100

**Settings → Environment:**

Adicione as seguintes variáveis:

```bash
# Porta (Railway define automaticamente)
PORT=3333

# Node Environment
NODE_ENV=production

# Supabase
VITE_SUPABASE_URL=sua_url_aqui
VITE_SUPABASE_ANON_KEY=sua_key_aqui

# Evolution API (opcional)
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=sua_api_key
```

### 2. Deploy via Git

```bash
# Commitar as mudanças
git add .
git commit -m "fix: Configurar Railway para usar Dockerfile"
git push origin main
```

O Railway vai detectar o push e iniciar o deploy automaticamente.

---

## 🔍 Verificar Build

### Durante o Build

Você deve ver no log:

```
Using Dockerfile
==============

internal
load build definition from Dockerfile

STAGE 1: BUILD FRONTEND
[frontend-builder] ✅ Frontend buildado com sucesso!

STAGE 2: PRODUCTION
✅ Successfully Built!
```

### Se ainda aparecer "Using Nixpacks":

1. Vá em **Settings → General → Delete Service**
2. Crie um novo serviço conectando o mesmo repositório
3. Railway vai detectar o `railway.json` e usar Dockerfile automaticamente

---

## 🚀 Após Deploy

### 1. Verificar Health

Acesse: `https://seu-app.railway.app/health`

Deve retornar:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-08T..."
}
```

### 2. Verificar Status Completo

Acesse: `https://seu-app.railway.app/`

Deve retornar:
```json
{
  "server": "OrderZap Multi-Tenant Server",
  "version": "3.0.0",
  "uptime": 123,
  "whatsapp": {
    "evolutionApiStatus": "online",
    ...
  }
}
```

---

## 🐛 Troubleshooting

### Erro: "npm: command not found"

**Causa:** Railway ainda está usando Nixpacks

**Solução:**
1. Delete o serviço no Railway
2. Crie novo serviço (vai detectar railway.json)
3. Ou force rebuild: `railway up --dockerfile Dockerfile`

### Erro: "Cannot find module 'express'"

**Causa:** Dependências não foram instaladas no backend

**Solução:** 
- Verifique se o Dockerfile está instalando: `npm ci --omit=dev` na pasta backend
- Logs devem mostrar: `Step 6: RUN npm ci --omit=dev`

### Build muito lento

**Causa:** Muitos arquivos sendo copiados

**Solução:**
- O `.dockerignore` já está otimizado
- Arquivos `.md`, `.bat`, `.sh`, `supabase/` são ignorados
- Build deve levar ~2-3 minutos

### Health check falhando

**Causa:** Porta incorreta ou servidor não iniciou

**Solução:**
1. Verifique logs: `railway logs`
2. Confirme que o servidor iniciou: `Server rodando na porta 3333`
3. Teste endpoint: `curl https://seu-app.railway.app/health`

---

## 📊 Estrutura do Build

### Stage 1: Frontend Build
```
1. Instala dependências (npm ci --include=dev)
2. Roda build do Vite (npm run build)
3. Gera pasta dist/ com React buildado
```

### Stage 2: Production
```
1. Copia dist/ do stage 1
2. Copia backend/
3. Instala dependências do backend (npm ci --omit=dev)
4. Inicia: node backend/server-main.js
```

---

## 🎯 Próximos Passos

Após deploy bem-sucedido:

1. ✅ Configurar domínio customizado (se necessário)
2. ✅ Configurar variáveis de ambiente de produção
3. ✅ Testar endpoints de integração
4. ✅ Configurar Evolution API (WhatsApp)
5. ✅ Testar QR Code para conectar WhatsApp

---

## 📞 Suporte

Se ainda tiver problemas:

1. Verifique logs completos: `railway logs --tail 100`
2. Confira variáveis de ambiente: `railway variables`
3. Teste build local: `docker build -t test .`
4. Teste run local: `docker run -p 3333:3333 test`

---

## ✨ Resultado Esperado

Com esta configuração, o Railway deve:

- ✅ Detectar `railway.json` automaticamente
- ✅ Usar Dockerfile (não Nixpacks)
- ✅ Buildar frontend com Vite
- ✅ Instalar dependências do backend
- ✅ Iniciar servidor em ~40-60 segundos
- ✅ Health check passar em /health
- ✅ App acessível via URL do Railway

**Build time esperado:** 2-4 minutos  
**Deploy time esperado:** 30-60 segundos  
**Total:** ~5 minutos do push até app online

---

🎉 **Bom deploy!**
