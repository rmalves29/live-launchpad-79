# 🚀 GUIA COMPLETO PARA AMADORES - OrderZap v2
## Deploy no Railway do ZERO (Passo a Passo Visual)

> **Para quem?** Para você que **NUNCA** mexeu com deploy, Railway ou Docker  
> **Tempo total:** ~30 minutos  
> **Dificuldade:** ⭐⭐ (Fácil, só seguir)

---

## 📋 SUMÁRIO

1. [Pré-requisitos (O que você precisa)](#1-pré-requisitos)
2. [Criar conta no Supabase](#2-criar-conta-no-supabase)
3. [Criar conta no Railway](#3-criar-conta-no-railway)
4. [Preparar seu computador](#4-preparar-seu-computador)
5. [Subir código para o GitHub](#5-subir-código-para-o-github)
6. [Fazer Deploy no Railway](#6-fazer-deploy-no-railway)
7. [Testar se funcionou](#7-testar-se-funcionou)
8. [Problemas? Veja aqui](#8-problemas-comuns)

---

## 1. PRÉ-REQUISITOS

### O que você precisa ter instalado:

- [ ] **Git** - Para subir código  
  → Windows: Baixar em https://git-scm.com/download/win  
  → Mac: `brew install git` (ou baixar em https://git-scm.com/)  
  → Linux: `sudo apt install git` (Ubuntu/Debian)

- [ ] **Node.js** - Para rodar o código  
  → Baixar em https://nodejs.org/ (versão LTS recomendada - 20.x)

- [ ] **Conta GitHub** - Para guardar o código  
  → Criar grátis em https://github.com/signup

- [ ] **Conta Railway** - Para fazer o deploy  
  → Criar grátis em https://railway.app/

- [ ] **Conta Supabase** - Para o banco de dados  
  → Criar grátis em https://supabase.com/

### Verificar se está tudo instalado:

Abra o **Terminal** (Mac/Linux) ou **CMD/PowerShell** (Windows) e digite:

```bash
# Verificar Git
git --version
# ✅ Deve mostrar: git version 2.x.x

# Verificar Node.js
node --version
# ✅ Deve mostrar: v20.x.x

# Verificar npm
npm --version
# ✅ Deve mostrar: 10.x.x
```

Se algum comando não funcionar, instale o que está faltando.

---

## 2. CRIAR CONTA NO SUPABASE

### Passo 1: Criar conta

1. Acesse https://supabase.com/
2. Clique em **"Start your project"**
3. Use sua conta Google/GitHub ou crie com email
4. Confirme seu email

### Passo 2: Criar projeto

1. No Dashboard, clique em **"New Project"**
2. Preencha:
   - **Name:** `orderzap` (ou qualquer nome)
   - **Database Password:** Crie uma senha FORTE (anote ela!)
   - **Region:** South America (São Paulo) - mais rápido para Brasil
3. Clique em **"Create new project"**
4. Aguarde 2-3 minutos (café ☕)

### Passo 3: Pegar as credenciais (IMPORTANTE!)

Depois que o projeto for criado:

1. No menu lateral, clique em **"Settings"** (ícone de engrenagem ⚙️)
2. Clique em **"API"**
3. Você verá:

```
📝 ANOTE ESSAS 3 COISAS:

URL do Projeto:
https://abcdefghijklmnop.supabase.co

anon public (chave pública):
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

service_role (chave privada):
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**⚠️ GUARDAR BEM:** Copie essas 3 informações para um arquivo de texto. Vamos usar daqui a pouco!

### Passo 4: Criar o banco de dados

1. No menu lateral, clique em **"SQL Editor"**
2. Copie TODO o conteúdo do arquivo `database.sql` do projeto
3. Cole no editor SQL
4. Clique em **"Run"** (canto inferior direito)
5. ✅ Deve mostrar: **"Success. No rows returned"**

Pronto! Seu banco está criado com 2 tabelas: `tenants` e `products`.

---

## 3. CRIAR CONTA NO RAILWAY

### Passo 1: Criar conta

1. Acesse https://railway.app/
2. Clique em **"Login"** (canto superior direito)
3. Escolha **"Login with GitHub"**
4. Autorize o Railway no GitHub
5. Confirme seu email

### Passo 2: Adicionar método de pagamento (obrigatório)

> **Por quê?** Railway exige cartão, mas tem $5 grátis/mês (suficiente para testes)

1. No Dashboard, clique no seu avatar (canto superior direito)
2. Clique em **"Account Settings"**
3. Clique em **"Usage"**
4. Clique em **"Add Payment Method"**
5. Adicione um cartão de crédito válido

**💰 Custos:**
- $5/mês grátis (sempre)
- Depois disso: ~$5-10/mês (para projetos pequenos)
- Você pode cancelar a qualquer momento

---

## 4. PREPARAR SEU COMPUTADOR

### Passo 1: Baixar o código

Abra o Terminal e digite:

```bash
# Ir para a pasta onde você guarda projetos
cd ~/Documents  # Mac/Linux
# ou
cd C:\Users\SeuNome\Documents  # Windows

# Clonar o projeto
git clone https://github.com/rmalves29/orderzap.git

# Entrar na pasta do projeto v2
cd orderzap/orderzap-v2

# Verificar se está tudo lá
ls -la  # Mac/Linux
dir     # Windows
```

**✅ Deve aparecer:**
```
app/
public/
.env.example
package.json
Dockerfile
railway.toml
... (outros arquivos)
```

### Passo 2: Instalar dependências

```bash
# Instalar tudo que o projeto precisa
npm install

# Aguarde 1-2 minutos...
# ✅ Deve terminar sem erros
```

### Passo 3: Configurar variáveis de ambiente (LOCAL)

```bash
# Copiar o arquivo de exemplo
cp .env.example .env.local  # Mac/Linux
copy .env.example .env.local  # Windows
```

Agora abra o arquivo `.env.local` com um editor de texto:

```bash
# Mac
open -e .env.local

# Windows
notepad .env.local

# Linux
nano .env.local
```

Cole as credenciais do Supabase que você anotou antes:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# URL do app (para testar local)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Salve e feche o arquivo.

### Passo 4: Testar localmente (opcional mas recomendado)

```bash
# Rodar o servidor local
npm run dev

# ✅ Deve mostrar:
# ▲ Next.js 14.2.15
# - Local:        http://localhost:3000
# ✓ Ready in 2.3s
```

Abra seu navegador em: http://localhost:3000

**✅ Se aparecer a landing page do OrderZap → SUCESSO!**

Aperte `Ctrl+C` para parar o servidor.

---

## 5. SUBIR CÓDIGO PARA O GITHUB

### Opção A: Se você já tem o repositório (rmalves29/orderzap)

```bash
# Certificar que está na pasta certa
cd ~/Documents/orderzap/orderzap-v2

# Adicionar os arquivos
git add .

# Fazer commit
git commit -m "feat: OrderZap v2 completo para deploy"

# Subir para o GitHub
git push origin main
```

Se pedir usuário/senha:
- **Username:** seu_usuario_github
- **Password:** seu_token_github (não a senha! Criar em https://github.com/settings/tokens)

### Opção B: Se é um novo repositório

```bash
# Iniciar git
git init

# Adicionar tudo
git add .

# Primeiro commit
git commit -m "feat: OrderZap v2 inicial"

# Conectar com GitHub
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git

# Subir
git branch -M main
git push -u origin main
```

**✅ Verifique no GitHub:** Acesse `https://github.com/SEU_USUARIO/SEU_REPO` e veja se os arquivos estão lá.

---

## 6. FAZER DEPLOY NO RAILWAY

### Passo 1: Conectar repositório

1. Entre em https://railway.app/dashboard
2. Clique em **"New Project"** (botão roxo)
3. Escolha **"Deploy from GitHub repo"**
4. Selecione o repositório: `rmalves29/orderzap` (ou seu repositório)
5. Clique em **"Deploy Now"**

### Passo 2: Configurar o serviço

Após conectar, você verá a tela de configuração:

1. **Clique no serviço criado** (vai ter o nome do repositório)
2. Clique em **"Settings"** (menu lateral)
3. Clique em **"Build"**

Configurar assim:

```
🏗️ CONFIGURAÇÕES DE BUILD:

Builder: ✅ Dockerfile (deve estar selecionado)

Dockerfile Path: Dockerfile

Root Directory: (DEIXAR VAZIO! Não digitar nada aqui)
                ⚠️ IMPORTANTE: Se tiver "frontend" ou "backend", APAGUE!

Build Command: (deixar vazio)

Install Command: (deixar vazio)
```

### Passo 3: Adicionar variáveis de ambiente

1. No menu lateral, clique em **"Variables"**
2. Clique em **"+ New Variable"**
3. Adicione **CADA UMA** dessas variáveis:

```
NEXT_PUBLIC_SUPABASE_URL
Valor: https://abcdefghijklmnop.supabase.co
(colar sua URL do Supabase)

NEXT_PUBLIC_SUPABASE_ANON_KEY
Valor: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
(colar sua chave pública do Supabase)

SUPABASE_SERVICE_ROLE_KEY
Valor: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
(colar sua chave privada do Supabase)

NODE_ENV
Valor: production

NEXT_PUBLIC_APP_URL
Valor: https://SEU_APP.railway.app
(Railway vai criar essa URL - você edita depois)
```

**Importante:**
- Clicar em **"+ New Variable"** para CADA uma
- Copiar e colar com CUIDADO (sem espaços extras)
- NÃO adicionar variáveis `NIXPACKS_*`

### Passo 4: Pegar a URL do Railway

1. Volte para **"Settings"**
2. Clique em **"Networking"**
3. Clique em **"Generate Domain"**
4. Copie a URL gerada (ex: `https://orderzap-production.railway.app`)

### Passo 5: Atualizar NEXT_PUBLIC_APP_URL

1. Volte em **"Variables"**
2. Clique em `NEXT_PUBLIC_APP_URL`
3. Cole a URL do Railway que você copiou
4. Clique em **"Update"**

### Passo 6: Forçar novo deploy

1. Clique em **"Deployments"** (menu lateral)
2. Clique nos 3 pontinhos `⋮` do último deploy
3. Clique em **"Redeploy"**

---

## 7. TESTAR SE FUNCIONOU

### Passo 1: Acompanhar o build

1. Clique em **"Deployments"**
2. Clique no deploy que está rodando (vai ter um ícone girando 🔄)
3. Clique em **"View Logs"**

**✅ LOGS ESPERADOS:**

```bash
# ✅ BOM - Usando Dockerfile
root directory: (empty)
found 'Dockerfile' at 'Dockerfile'
found 'railway.toml' at 'railway.toml'
Using Dockerfile

# ✅ BOM - Build do frontend
[frontend-builder] FROM node:20-alpine
[frontend-builder] RUN npm ci --include=dev
[frontend-builder] RUN npm run build
✅ Frontend buildado com sucesso!

# ✅ BOM - Build do backend
[stage-1] COPY backend ./backend
[stage-1] COPY --from=frontend-builder /app/dist ./dist
[stage-1] RUN npm ci --only=production

# ✅ BOM - Deploy concluído
Successfully Built!
Deployment successful
```

**❌ RUIM - Se aparecer:**

```bash
Using Nixpacks  ← ❌ ERRADO!
npm: command not found  ← ❌ ERRO!
```

Se aparecer isso, volte no **Passo 6.2** e confirme que **Root Directory está VAZIO**.

### Passo 2: Acessar a aplicação

Aguarde o deploy terminar (~3-5 minutos). Depois:

1. Copie a URL do Railway (ex: `https://orderzap-production.railway.app`)
2. Abra no navegador
3. ✅ Deve aparecer a landing page do OrderZap

### Passo 3: Testar endpoints

Teste se a API está funcionando:

```bash
# Testar health check
curl https://SEU_APP.railway.app/api/health

# ✅ Deve retornar:
{"status":"ok","timestamp":"2025-12-08T..."}

# Testar página inicial
curl https://SEU_APP.railway.app/

# ✅ Deve retornar HTML da página
```

---

## 8. PROBLEMAS COMUNS

### 🔴 Problema: Railway usa Nixpacks em vez de Dockerfile

**Sintoma:**
```
Using Nixpacks
npm: command not found
```

**Solução:**
1. Settings → Build
2. Confirmar que **Root Directory está VAZIO**
3. Confirmar que **Builder = Dockerfile**
4. Deletar o serviço e criar novo (última opção)

---

### 🔴 Problema: Build falha com "backend not found"

**Sintoma:**
```
failed to compute cache key: "/backend": not found
```

**Solução:**
1. Settings → Build → **Root Directory DEVE ESTAR VAZIO**
2. Se tiver "frontend" ou "backend", **APAGUE**
3. Redeploy

---

### 🔴 Problema: Variáveis de ambiente não funcionam

**Sintoma:**
- Supabase não conecta
- Erros de "undefined"

**Solução:**
1. Settings → Variables
2. Conferir se TODAS as 5 variáveis estão lá:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NODE_ENV`
   - `NEXT_PUBLIC_APP_URL`
3. Copiar e colar novamente (cuidado com espaços)
4. Redeploy

---

### 🔴 Problema: Deploy demora muito (>10 minutos)

**Solução:**
- Aguarde até 15 minutos
- Se passar de 15 minutos:
  1. Cancelar deploy (X vermelho)
  2. Redeploy
- Se persistir:
  1. Deletar o serviço
  2. Criar novo

---

### 🔴 Problema: "Invalid username or token" ao fazer push

**Sintoma:**
```bash
git push origin main
# ❌ Authentication failed
```

**Solução:**
1. Criar Personal Access Token no GitHub:
   - https://github.com/settings/tokens
   - Clicar em "Generate new token (classic)"
   - Selecionar scope: `repo`
   - Copiar o token gerado
2. Usar o token como senha ao fazer push:
   ```bash
   git push origin main
   # Username: seu_usuario
   # Password: ghp_1234567890abcdef... (colar o token)
   ```

---

## 🎯 CHECKLIST FINAL

Use este checklist para confirmar que está tudo certo:

### Antes do Deploy:
- [ ] Git instalado e funcionando
- [ ] Node.js 20.x instalado
- [ ] Conta Supabase criada
- [ ] Banco de dados criado (executou `database.sql`)
- [ ] Credenciais do Supabase anotadas (URL + 2 chaves)
- [ ] Conta Railway criada
- [ ] Cartão de crédito adicionado no Railway
- [ ] Código no GitHub

### Configuração Railway:
- [ ] Repositório conectado no Railway
- [ ] **Root Directory: (VAZIO)**
- [ ] Builder: Dockerfile
- [ ] 5 variáveis de ambiente adicionadas
- [ ] URL do Railway gerada
- [ ] `NEXT_PUBLIC_APP_URL` atualizada com a URL do Railway

### Após Deploy:
- [ ] Build terminou sem erros
- [ ] Logs mostram "Using Dockerfile"
- [ ] Logs mostram "Successfully Built!"
- [ ] Site abre no navegador
- [ ] `/api/health` retorna `{"status":"ok"}`

---

## 📞 PRECISA DE AJUDA?

### Documentação adicional:
- **Setup detalhado:** `SETUP.md`
- **Como funciona:** `COMOFUNCIONA.md`
- **Progresso:** `STATUS.md`
- **Início rápido:** `INICIO_RAPIDO.md`

### Logs úteis:

```bash
# Ver logs do Railway via CLI
railway logs

# Ver últimos 100 logs
railway logs --tail 100

# Ver logs em tempo real
railway logs --follow
```

### Comandos úteis:

```bash
# Verificar se o código está sincronizado
git status

# Subir novas alterações
git add .
git commit -m "fix: descrição do que mudou"
git push origin main

# Railway faz deploy automático após push
```

---

## 🎉 PARABÉNS!

Se você chegou até aqui e o site está no ar, **PARABÉNS!** 🎊

Você acabou de fazer o deploy de uma aplicação Next.js 14 com:
- ✅ Frontend React moderno
- ✅ Backend API integrado
- ✅ Banco de dados PostgreSQL (Supabase)
- ✅ Sistema Multi-Tenant
- ✅ Deploy automatizado (Railway)

### Próximos passos:

1. **Ler a documentação:**
   - `COMECE_AQUI.md` - Desenvolvimento local
   - `COMOFUNCIONA.md` - Arquitetura
   - `STATUS.md` - Próximas features

2. **Customizar:**
   - Alterar cores (editar `app/globals.css`)
   - Adicionar logo (colocar em `public/`)
   - Configurar domínio próprio (Railway Settings → Networking)

3. **Desenvolver novas features:**
   - Seguir o plano em `STATUS.md`
   - Fazer commits frequentes
   - Railway faz deploy automático

---

**Criado com ❤️ para iniciantes**  
**Versão:** 2.0  
**Data:** 08/12/2025  
**Tempo de leitura:** ~45 minutos  
**Tempo de execução:** ~30 minutos
