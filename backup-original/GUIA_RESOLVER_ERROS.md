# 🔧 GUIA DE RESOLUÇÃO DE ERROS - OrderZap v2
## O que fazer quando algo dá errado (para iniciantes)

> **Para quem?** Para quando você seguiu o tutorial mas algo não funcionou  
> **Objetivo:** Resolver os erros mais comuns passo a passo

---

## 📋 ÍNDICE DE ERROS

1. [Erros de Instalação (npm install)](#1-erros-de-instalação)
2. [Erros do Supabase](#2-erros-do-supabase)
3. [Erros do Railway](#3-erros-do-railway)
4. [Erros de Build](#4-erros-de-build)
5. [Erros de Deploy](#5-erros-de-deploy)
6. [Erros de Variáveis de Ambiente](#6-erros-de-variáveis)
7. [Erros de Conexão](#7-erros-de-conexão)

---

## 1. ERROS DE INSTALAÇÃO

### ❌ Erro: "npm: command not found"

**Quando acontece:** Ao rodar `npm install`

**Causa:** Node.js não está instalado ou não está no PATH

**Solução passo a passo:**

```bash
# 1. Verificar se Node.js está instalado
node --version

# Se der erro "command not found":
# 2. Instalar Node.js

# Mac (usando Homebrew):
brew install node

# Linux (Ubuntu/Debian):
sudo apt update
sudo apt install nodejs npm

# Windows:
# Baixar instalador em: https://nodejs.org/
# Executar o instalador
# Reiniciar o terminal

# 3. Verificar novamente
node --version  # Deve mostrar: v20.x.x
npm --version   # Deve mostrar: 10.x.x

# 4. Tentar npm install novamente
cd /home/user/webapp/orderzap-v2
npm install
```

---

### ❌ Erro: "EACCES: permission denied"

**Quando acontece:** Durante `npm install`

**Mensagem:**
```
npm ERR! code EACCES
npm ERR! syscall mkdir
npm ERR! path /usr/local/lib/node_modules
npm ERR! errno -13
```

**Solução:**

```bash
# Opção 1: Instalar sem sudo (recomendado)
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
npm install

# Opção 2: Corrigir permissões (Linux/Mac)
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules
npm install

# Opção 3: Usar sudo (não recomendado, mas funciona)
sudo npm install
```

---

### ❌ Erro: "Cannot find module"

**Quando acontece:** Ao rodar `npm run dev`

**Mensagem:**
```
Error: Cannot find module 'next'
```

**Solução:**

```bash
# 1. Limpar cache do npm
npm cache clean --force

# 2. Deletar node_modules e package-lock.json
rm -rf node_modules package-lock.json

# 3. Reinstalar tudo
npm install

# 4. Tentar rodar novamente
npm run dev
```

---

## 2. ERROS DO SUPABASE

### ❌ Erro: "Database not found"

**Quando acontece:** Ao tentar conectar ao Supabase

**Causa:** Projeto não foi criado ou deletado

**Solução:**

1. Entrar em https://supabase.com/dashboard
2. Verificar se o projeto existe na lista
3. Se não existe:
   - Criar novo projeto (botão "+ New Project")
   - Anotar as novas credenciais
   - Executar `database.sql` novamente

---

### ❌ Erro: "Invalid API key"

**Quando acontece:** Aplicação tenta se conectar ao Supabase

**Mensagem no console:**
```
SupabaseAuthError: Invalid API key
```

**Solução:**

```bash
# 1. Verificar se as chaves estão corretas no Supabase
# Supabase Dashboard → Settings → API

# 2. Copiar as chaves novamente
# - Project URL
# - anon public key
# - service_role key

# 3. Atualizar variáveis no Railway
# Railway → Settings → Variables

# 4. Clicar em cada variável e colar o valor correto:
NEXT_PUBLIC_SUPABASE_URL: https://novo-valor.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY: eyJ...
SUPABASE_SERVICE_ROLE_KEY: eyJ...

# 5. Redeploy
# Railway → Deployments → Redeploy
```

---

### ❌ Erro: "Failed to execute SQL"

**Quando acontece:** Ao executar `database.sql`

**Mensagem:**
```
ERROR: relation "tenants" already exists
```

**Solução:**

```sql
-- 1. Abrir SQL Editor no Supabase
-- 2. Deletar tabelas existentes:

drop table if exists public.products cascade;
drop table if exists public.tenants cascade;

-- 3. Executar database.sql novamente
-- Colar todo o conteúdo do arquivo database.sql
-- Clicar em "Run"
```

---

## 3. ERROS DO RAILWAY

### ❌ Erro: "Failed to connect GitHub"

**Quando acontece:** Ao tentar conectar repositório

**Solução:**

```
1. Railway → Settings → Integrations → GitHub
2. Clicar em "Connect GitHub"
3. Autorizar Railway no GitHub
4. Voltar para Railway
5. Tentar conectar o repositório novamente
```

---

### ❌ Erro: "Payment method required"

**Quando acontece:** Ao tentar fazer deploy

**Mensagem:**
```
⚠️ Payment method required to deploy
```

**Solução:**

```
1. Railway Dashboard → ícone do seu perfil
2. Account Settings
3. Usage
4. Add Payment Method
5. Adicionar cartão de crédito válido
6. Voltar ao projeto e tentar deploy novamente

Nota: Railway tem $5 grátis/mês, você não será cobrado
imediatamente, mas o cartão é obrigatório.
```

---

### ❌ Erro: "Repository not found"

**Quando acontece:** Railway não encontra seu repositório

**Solução:**

```
# Opção 1: Tornar repositório público
1. GitHub → Seu repositório → Settings
2. Scroll até "Danger Zone"
3. "Change visibility" → "Make public"
4. Tentar conectar novamente no Railway

# Opção 2: Reconectar integração
1. Railway → Settings → Integrations
2. GitHub → Disconnect
3. Connect novamente
4. Autorizar acesso aos repositórios privados
5. Tentar conectar o repositório
```

---

## 4. ERROS DE BUILD

### ❌ Erro: "Using Nixpacks" (Railway usa Nixpacks em vez de Dockerfile)

**Causa:** Railway detectou arquivos Deno (supabase) e está ignorando Dockerfile

**Solução DEFINITIVA:**

```bash
# ETAPA 1: Confirmar arquivos de proteção
cd /home/user/webapp/orderzap-v2

# Verificar se os arquivos existem:
ls -la railway.toml       # Deve existir
ls -la .railwayignore     # Deve existir
ls -la .dockerignore      # Deve existir

# ETAPA 2: Verificar conteúdo do railway.toml
cat railway.toml

# Deve ter:
# [build]
# builder = "dockerfile"
# dockerfilePath = "Dockerfile"

# ETAPA 3: No Railway Dashboard
# Settings → Build → LIMPAR "Root Directory"
# Deixar completamente VAZIO!

# ETAPA 4: Forçar novo build
git add .
git commit -m "fix: Forçar uso de Dockerfile"
git push origin main

# Railway vai fazer deploy automaticamente
```

**Se ainda não funcionar (Opção Nuclear 💣):**

```
1. Railway Dashboard → Selecionar o serviço
2. Settings → General
3. Scroll até "Danger Zone"
4. "Delete Service"
5. Confirmar deletação

6. Criar novo serviço:
   - New Service
   - Deploy from GitHub repo
   - Selecionar: rmalves29/orderzap
   - Deixar Root Directory VAZIO
   - Adicionar variáveis de ambiente
   - Deploy

Isso funciona 99% das vezes.
```

---

### ❌ Erro: "backend not found"

**Mensagem completa:**
```
failed to compute cache key:
failed to calculate checksum:
"/backend": not found
```

**Causa:** Root Directory está configurado como "frontend"

**Solução:**

```
1. Railway → Settings → Build
2. Encontrar campo "Root Directory"
3. Se tiver "frontend" ou "backend":
   - Clicar no campo
   - Apagar TODO o texto
   - Deixar VAZIO
4. Clicar fora do campo para salvar
5. Settings → Deployments → Redeploy
```

---

### ❌ Erro: "npm ci failed"

**Mensagem:**
```
npm ERR! code ELIFECYCLE
npm ERR! errno 1
npm ERR! [package] run build: failed
```

**Solução:**

```bash
# Testar localmente primeiro:
cd /home/user/webapp/orderzap-v2
rm -rf node_modules package-lock.json
npm install
npm run build

# Se funcionar localmente:
# O problema está nas variáveis do Railway

# Railway → Settings → Variables
# Verificar se está faltando alguma variável
# Adicionar se necessário:
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=sua_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_key
SUPABASE_SERVICE_ROLE_KEY=sua_key
NEXT_PUBLIC_APP_URL=https://seu-app.railway.app
```

---

## 5. ERROS DE DEPLOY

### ❌ Erro: "Deployment timeout"

**Quando acontece:** Deploy demora muito e cancela

**Mensagem:**
```
⏱️ Deployment timed out after 10 minutes
```

**Solução:**

```
# 1. Verificar se o build está travado
Railway → Deployments → View Logs

# 2. Se estiver travado em algum comando:
#    Cancelar e redeploy

# 3. Se acontecer novamente:
#    Problema pode ser no Dockerfile

# 4. Verificar Dockerfile:
cd /home/user/webapp/orderzap-v2
cat Dockerfile

# 5. Garantir que tem isso:
FROM node:20-alpine
# ... resto do arquivo

# 6. Push novamente:
git add Dockerfile
git commit -m "fix: Otimizar Dockerfile"
git push origin main
```

---

### ❌ Erro: "Health check failed"

**Quando acontece:** Deploy completa mas Railway marca como falha

**Solução:**

```
# Verificar se a aplicação está rodando:
# 1. Railway → Runtime Logs

# 2. Procurar por:
✓ Server running on port 3333  ← BOM
❌ EADDRINUSE: port already in use  ← RUIM

# 3. Se não está rodando:
#    Verificar variável PORT

# Railway → Settings → Variables
# Adicionar (se não existir):
PORT=3333

# 4. Redeploy
```

---

## 6. ERROS DE VARIÁVEIS

### ❌ Erro: "Environment variable not defined"

**Mensagem no console:**
```
Error: NEXT_PUBLIC_SUPABASE_URL is not defined
```

**Solução passo a passo:**

```
1. Railway → Settings → Variables

2. Clicar em "+ New Variable"

3. Adicionar CADA variável:

   Variable Name: NEXT_PUBLIC_SUPABASE_URL
   Variable Value: https://seu-projeto.supabase.co
   [Add]

   Variable Name: NEXT_PUBLIC_SUPABASE_ANON_KEY
   Variable Value: eyJ...sua_key_aqui
   [Add]

   Variable Name: SUPABASE_SERVICE_ROLE_KEY
   Variable Value: eyJ...sua_key_aqui
   [Add]

   Variable Name: NODE_ENV
   Variable Value: production
   [Add]

   Variable Name: NEXT_PUBLIC_APP_URL
   Variable Value: https://seu-app.railway.app
   [Add]

4. Deployments → Redeploy
```

---

### ❌ Erro: Variável com espaço extra

**Causa:** Copiou/colou com espaço no início ou fim

**Solução:**

```
# Sintomas:
# - "Invalid URL"
# - "Invalid API key"
# - Mesmo tendo copiado corretamente

# Solução:
1. Railway → Variables
2. Para CADA variável:
   - Clicar em "Edit"
   - Copiar o valor
   - Colar em um editor de texto
   - Remover QUALQUER espaço antes ou depois
   - Copiar novamente (sem espaços)
   - Colar de volta no Railway
   - Update

3. Redeploy
```

---

## 7. ERROS DE CONEXÃO

### ❌ Erro: "CORS error" no navegador

**Mensagem no console do navegador:**
```
Access to fetch at '...' from origin '...' has been
blocked by CORS policy
```

**Solução:**

```javascript
// Verificar se app/api/health/route.ts tem headers CORS:

export async function GET() {
  return Response.json(
    { status: 'ok', timestamp: new Date().toISOString() },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
    }
  );
}

// Se não tiver, adicionar os headers
```

---

### ❌ Erro: "Cannot connect to database"

**Mensagem:**
```
Error: Failed to connect to database
```

**Solução:**

```
# 1. Verificar se Supabase está online
https://status.supabase.com/

# 2. Verificar credenciais
Supabase Dashboard → Settings → API
Copiar URL e keys novamente

# 3. Testar conexão localmente:
cd /home/user/webapp/orderzap-v2
npm run dev

# Abrir: http://localhost:3000/api/health
# Deve retornar: {"status":"ok","database":"connected"}

# 4. Se funcionar localmente mas não no Railway:
#    Problema está nas variáveis de ambiente

# Railway → Variables → Verificar TODAS as 5 variáveis
```

---

### ❌ Erro: "504 Gateway Timeout"

**Quando acontece:** Página demora muito e dá timeout

**Solução:**

```
# 1. Verificar Runtime Logs
Railway → Runtime Logs

# 2. Procurar por erros ou travamentos

# 3. Verificar se o servidor iniciou:
✓ Server running on port 3333  ← Deve aparecer

# 4. Se não aparecer:
#    Verificar Dockerfile

# 5. Se aparecer mas ainda dá timeout:
#    Aumentar timeout do health check

Railway → Settings → Healthcheck
Timeout: 300 seconds (5 minutos)

# 6. Redeploy
```

---

## 8. COMANDOS ÚTEIS PARA DEBUG

### Verificar estrutura do projeto:

```bash
cd /home/user/webapp/orderzap-v2

# Ver todos os arquivos
ls -la

# Ver estrutura de pastas
find . -type d -maxdepth 3 | grep -v node_modules
```

### Verificar Git:

```bash
# Ver branch atual
git branch

# Ver último commit
git log --oneline -1

# Ver arquivos modificados
git status

# Ver diferenças
git diff
```

### Verificar variáveis de ambiente (local):

```bash
# Ver conteúdo do .env.local
cat .env.local

# Verificar se tem espaços extras
cat .env.local | sed 's/ /<ESPACO>/g'
```

### Testar build local:

```bash
# Build de produção
npm run build

# Se der erro, corrigir antes de fazer push
```

### Testar Docker local (avançado):

```bash
# Build da imagem
docker build -t orderzap-v2 .

# Rodar container
docker run -p 3333:3333 \
  -e NEXT_PUBLIC_SUPABASE_URL="https://..." \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..." \
  orderzap-v2

# Acessar: http://localhost:3333
```

---

## 9. CHECKLIST DE DEBUG

Use esta lista quando estiver com problema:

### [ ] Instalação
- [ ] Node.js 20.x instalado (`node --version`)
- [ ] npm instalado (`npm --version`)
- [ ] Git instalado (`git --version`)
- [ ] `npm install` rodou sem erros

### [ ] Supabase
- [ ] Projeto criado e ativo
- [ ] Credenciais copiadas (URL + 2 keys)
- [ ] `database.sql` executado
- [ ] Tabelas existem (tenants, products)

### [ ] GitHub
- [ ] Repositório existe
- [ ] Código foi commitado (`git status` limpo)
- [ ] Push foi feito (`git log` mostra commits)

### [ ] Railway
- [ ] Serviço conectado ao GitHub
- [ ] Builder = Dockerfile (NÃO Nixpacks)
- [ ] Root Directory = VAZIO
- [ ] 5 variáveis de ambiente adicionadas
- [ ] URL gerada

### [ ] Deploy
- [ ] Build terminou (Success)
- [ ] Logs mostram "Using Dockerfile"
- [ ] Logs mostram "Successfully Built!"
- [ ] Runtime Logs mostram "Server running"

### [ ] Testes
- [ ] URL abre no navegador
- [ ] `/api/health` retorna JSON ok
- [ ] Sem erros 500/404

---

## 🆘 ÚLTIMA OPÇÃO: RECOMEÇAR DO ZERO

Se nada funcionou, recomeçar é rápido:

```bash
# 1. Deletar serviço no Railway
Railway → Settings → General → Delete Service

# 2. Limpar pasta local
cd /home/user/webapp
rm -rf orderzap-v2

# 3. Clonar novamente
git clone https://github.com/rmalves29/orderzap.git
cd orderzap/orderzap-v2

# 4. Instalar dependências
npm install

# 5. Configurar .env.local
cp .env.example .env.local
# Editar .env.local com suas credenciais

# 6. Testar local
npm run dev
# Abrir: http://localhost:3000

# 7. Se funcionar local:
#    Criar novo serviço no Railway
#    Seguir GUIA_COMPLETO_AMADOR.md do início
```

---

## 📞 AINDA COM PROBLEMAS?

### Informações para relatar o erro:

Quando pedir ajuda, forneça:

1. **O que você estava tentando fazer:**
   ```
   Exemplo: "Estava tentando fazer deploy no Railway"
   ```

2. **Mensagem de erro completa:**
   ```
   Copiar e colar TODO o erro, não só parte
   ```

3. **Onde aconteceu:**
   ```
   Exemplo: "No terminal", "No Railway Dashboard", "No navegador"
   ```

4. **O que você já tentou:**
   ```
   Exemplo: "Já limpei node_modules e reinstalei"
   ```

5. **Screenshots:**
   - Tela do erro
   - Railway Build Logs
   - Railway Variables

6. **Versões:**
   ```bash
   node --version
   npm --version
   git --version
   ```

---

**Criado com ❤️ para resolver seus problemas**  
**Versão:** 2.0  
**Data:** 08/12/2025  
**Última atualização:** Resolução de erros comuns
