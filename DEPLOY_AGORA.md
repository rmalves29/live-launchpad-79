# 🚀 DEPLOY AGORA - OrderZap v2
## Corrigir o erro e fazer deploy do projeto correto

> **Situação:** Railway está tentando buildar o v1 (antigo) em vez do v2 (novo)  
> **Solução:** Criar repositório separado para o v2 e fazer deploy correto

---

## 🎯 O QUE VOCÊ PRECISA FAZER (2 OPÇÕES)

---

## ✅ OPÇÃO 1: Repositório Separado (Recomendado)

### Passo 1: Criar repositório no GitHub

1. Ir para https://github.com/new
2. Nome do repositório: `orderzap-v2`
3. Descrição: `OrderZap v2 - Sistema Multi-Tenant com Next.js 14`
4. Público ou Privado (sua escolha)
5. **NÃO** marcar "Add README" (já temos)
6. Clicar em **"Create repository"**

### Passo 2: Conectar o repositório local

O git já está iniciado em `/home/user/webapp/orderzap-v2`. Execute:

```bash
cd /home/user/webapp/orderzap-v2

# Conectar com o repositório GitHub que você acabou de criar
git remote add origin https://github.com/rmalves29/orderzap-v2.git

# Push
git push -u origin main
```

**Se pedir autenticação:**
- Username: `rmalves29`
- Password: Usar Personal Access Token (criar em https://github.com/settings/tokens)

### Passo 3: Configurar Railway

1. **Railway Dashboard** → Clicar em **"New Project"**

2. **Deploy from GitHub repo** → Selecionar `rmalves29/orderzap-v2`

3. **Settings → Build:**
   ```
   Builder: Dockerfile
   Dockerfile Path: Dockerfile
   Root Directory: (DEIXAR VAZIO!)
   ```

4. **Settings → Variables** → Adicionar:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   NODE_ENV=production
   NEXT_PUBLIC_APP_URL=https://seu-app.railway.app
   ```

5. **Settings → Networking** → **Generate Domain**

6. **Deployments** → **Redeploy**

7. ✅ **Aguardar 3-5 minutos** → App no ar!

---

## ✅ OPÇÃO 2: Configurar Root Directory no Railway (Rápido)

Se você quer usar o repositório `orderzap` existente:

### Passo 1: Verificar estrutura atual

```bash
cd /home/user/webapp
ls -la
```

Deve ter:
- `backend/` (v1)
- `frontend/` (v1)
- `orderzap-v2/` (novo)

### Passo 2: Configurar Railway para usar a pasta orderzap-v2

1. **Railway Dashboard** → Seu serviço → **Settings → Build**

2. **Configurar:**
   ```
   Builder: Dockerfile
   Dockerfile Path: Dockerfile
   Root Directory: orderzap-v2  ← IMPORTANTE!
   ```

3. **Settings → Deployments** → **Redeploy**

4. ✅ Railway vai buildar a partir de `orderzap-v2/`

---

## 🔧 VERIFICAR SE DEU CERTO

Nos logs de build, você deve ver:

✅ **CORRETO:**
```
Using Detected Dockerfile
context: orderzap-v2/
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build
✓ Built in X.Xs
Successfully Built!
```

❌ **ERRADO (o que você viu antes):**
```
Could not load /app/frontend/src/lib/supabase
error during build
```

---

## 📊 RESUMO DAS OPÇÕES

| Opção | Prós | Contras | Tempo |
|-------|------|---------|-------|
| **1: Repo Separado** | ✅ Limpo<br>✅ Organizado<br>✅ v1 intacto | GitHub novo repo | 10 min |
| **2: Root Directory** | ✅ Rápido<br>✅ Sem novo repo | Estrutura mista | 5 min |

---

## 🆘 SE DER ERRO

### Erro: "Could not load /app/frontend/src/lib/supabase"

**Causa:** Railway ainda está tentando buildar o v1

**Solução:**
1. Settings → Build → Root Directory = `orderzap-v2`
2. Redeploy

### Erro: "Authentication failed" ao fazer git push

**Solução:**
```bash
# Configurar credenciais
git config user.name "rmalves29"
git config user.email "seu-email@exemplo.com"

# Usar Personal Access Token como senha
# Criar em: https://github.com/settings/tokens
git push -u origin main
# Username: rmalves29
# Password: (colar o token)
```

### Erro: "fatal: remote origin already exists"

**Solução:**
```bash
cd /home/user/webapp/orderzap-v2
git remote remove origin
git remote add origin https://github.com/rmalves29/orderzap-v2.git
git push -u origin main
```

---

## ✨ APÓS O DEPLOY BEM-SUCEDIDO

1. **Testar a aplicação:**
   ```
   https://seu-app.railway.app
   ```

2. **Testar health check:**
   ```
   https://seu-app.railway.app/api/health
   ```

3. **Criar tenant de teste** no Supabase:
   ```sql
   INSERT INTO tenants (slug, name, settings)
   VALUES ('loja-teste', 'Loja Teste', '{}');
   ```

4. **Acessar tenant:**
   ```
   https://seu-app.railway.app/tenant/loja-teste
   ```

---

## 🎯 RECOMENDAÇÃO FINAL

Use **OPÇÃO 1** (repositório separado) porque:

✅ Projeto v2 tem sua própria URL do GitHub  
✅ Mais limpo e organizado  
✅ Mantém v1 intacto caso precise  
✅ Railway detecta tudo automaticamente  

**Tempo total:** ~10-15 minutos

---

## 📞 PRÓXIMOS PASSOS

Depois do deploy bem-sucedido:

1. **Ler documentação:**
   - [README.md](./README.md) - Visão geral
   - [COMOFUNCIONA.md](./COMOFUNCIONA.md) - Arquitetura
   - [STATUS.md](./STATUS.md) - Próximas features

2. **Desenvolver:**
   - [COMECE_AQUI.md](./COMECE_AQUI.md) - Setup local
   - Escolher feature do roadmap
   - Implementar e fazer push

3. **Customizar:**
   - Alterar cores em `app/globals.css`
   - Adicionar logo em `public/`
   - Configurar domínio próprio

---

**Criado para resolver o erro de build do Railway**  
**Versão:** 2.0  
**Data:** 09/12/2025  
**Status:** ✅ Pronto para deploy correto
