# ⚡ GUIA DE 5 MINUTOS - OrderZap v2
## Deploy ultrarrápido no Railway (só o essencial)

> **Para quem?** Para quem quer fazer funcionar AGORA e entender depois  
> **Tempo:** 5 minutos de leitura + 10 minutos de execução

---

## 🎯 OBJETIVO

Colocar o OrderZap v2 no ar o mais rápido possível.

---

## ✅ PRÉ-REQUISITOS (2 minutos)

Você precisa ter:

1. **Conta GitHub** - https://github.com/signup
2. **Conta Supabase** - https://supabase.com/
3. **Conta Railway** - https://railway.app/
4. **Cartão de crédito** - Para Railway (não vai cobrar, mas exige)

Todos são grátis para começar.

---

## 📝 PASSO 1: SUPABASE (3 minutos)

### 1.1 Criar projeto

```
1. Entrar em https://supabase.com/dashboard
2. Clicar em "+ New Project"
3. Preencher:
   Name: orderzap
   Database Password: criar senha forte (anotar!)
   Region: South America (São Paulo)
4. Clicar em "Create new project"
5. Aguardar 2 minutos ☕
```

### 1.2 Pegar credenciais

```
1. Settings (ícone engrenagem) → API
2. Copiar e colar em um arquivo de texto:

   Project URL:
   https://abcdefghijk.supabase.co

   anon public:
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

   service_role:
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 1.3 Criar banco de dados

```
1. SQL Editor (menu lateral)
2. Abrir arquivo database.sql do projeto
3. Copiar TODO o conteúdo
4. Colar no SQL Editor
5. Clicar em "Run"
6. ✅ "Success. No rows returned"
```

---

## 🚀 PASSO 2: RAILWAY (5 minutos)

### 2.1 Conectar GitHub

```
1. Entrar em https://railway.app/dashboard
2. Clicar em "New Project"
3. "Deploy from GitHub repo"
4. Selecionar: rmalves29/orderzap
5. Clicar em "Deploy Now"
```

### 2.2 Configurar Build (IMPORTANTE!)

```
1. Clicar no serviço criado
2. Settings → Build

3. CONFIGURAÇÃO CRÍTICA:
   Builder: Dockerfile ✅
   Root Directory: (DEIXAR VAZIO!) ⚠️
   
   ⚠️ Se tiver "frontend" ou "backend", APAGAR!
```

### 2.3 Adicionar Variáveis

```
Settings → Variables → + New Variable

Adicionar estas 5 variáveis (uma por vez):

1. NEXT_PUBLIC_SUPABASE_URL
   Valor: (colar URL do Supabase)

2. NEXT_PUBLIC_SUPABASE_ANON_KEY
   Valor: (colar anon key do Supabase)

3. SUPABASE_SERVICE_ROLE_KEY
   Valor: (colar service_role do Supabase)

4. NODE_ENV
   Valor: production

5. NEXT_PUBLIC_APP_URL
   Valor: https://seu-app.railway.app
   (você vai pegar isso no próximo passo)
```

### 2.4 Gerar URL

```
1. Settings → Networking
2. Clicar em "Generate Domain"
3. Copiar a URL gerada
   Exemplo: https://orderzap-production.railway.app
```

### 2.5 Atualizar NEXT_PUBLIC_APP_URL

```
1. Settings → Variables
2. Clicar em NEXT_PUBLIC_APP_URL
3. Colar a URL do Railway
4. Update
```

### 2.6 Redeploy

```
1. Deployments (menu lateral)
2. Clicar nos 3 pontinhos ⋮ do último deploy
3. Clicar em "Redeploy"
4. Aguardar 3-5 minutos ☕
```

---

## ✅ PASSO 3: VERIFICAR (1 minuto)

### 3.1 Ver logs

```
Deployments → Clicar no deploy rodando → View Logs

✅ Deve mostrar:
- "Using Dockerfile"
- "Successfully Built!"

❌ Se mostrar:
- "Using Nixpacks" → Voltar no 2.2, limpar Root Directory
```

### 3.2 Testar aplicação

```
1. Copiar URL do Railway
2. Abrir no navegador
3. ✅ Deve aparecer a landing page

4. Testar API:
   https://seu-app.railway.app/api/health
   ✅ Deve retornar: {"status":"ok",...}
```

---

## 🎉 PRONTO!

Se tudo acima funcionou: **PARABÉNS! 🎊**

Seu OrderZap v2 está no ar!

---

## ❌ DEU ERRO?

### Erro mais comum: "Using Nixpacks"

**Solução:**
```
1. Railway → Settings → Build
2. Root Directory: LIMPAR (deixar vazio)
3. Confirmar que Builder = Dockerfile
4. Redeploy
```

### Erro: "backend not found"

**Solução:**
```
Mesmo problema acima:
Root Directory deve estar VAZIO
```

### Erro: "npm: command not found"

**Solução:**
```
Significa que está usando Nixpacks.
Voltar no "Erro mais comum" acima.
```

### Outros erros:

Leia o **GUIA_RESOLVER_ERROS.md** completo.

---

## 📚 PRÓXIMOS PASSOS

Agora que está funcionando:

1. **Entender melhor:** Ler `GUIA_COMPLETO_AMADOR.md`
2. **Ver como funciona:** Ler `COMOFUNCIONA.md`
3. **Desenvolver:** Ler `COMECE_AQUI.md`
4. **Resolver problemas:** Ter `GUIA_RESOLVER_ERROS.md` à mão

---

## 🔥 COMANDOS RÁPIDOS

```bash
# Clonar projeto
git clone https://github.com/rmalves29/orderzap.git
cd orderzap/orderzap-v2

# Instalar e rodar local
npm install
cp .env.example .env.local
# (editar .env.local com credenciais)
npm run dev
# Abrir: http://localhost:3000

# Push de mudanças
git add .
git commit -m "feat: minha mudança"
git push origin main
# Railway faz deploy automático
```

---

## 📊 CHECKLIST RÁPIDO

Use para confirmar que fez tudo:

### Supabase:
- [ ] Projeto criado
- [ ] 3 credenciais copiadas
- [ ] database.sql executado

### Railway:
- [ ] Serviço conectado ao GitHub
- [ ] **Root Directory = VAZIO**
- [ ] Builder = Dockerfile
- [ ] 5 variáveis adicionadas
- [ ] URL gerada
- [ ] NEXT_PUBLIC_APP_URL atualizada

### Verificação:
- [ ] Logs mostram "Using Dockerfile"
- [ ] Logs mostram "Successfully Built!"
- [ ] URL abre no navegador
- [ ] /api/health retorna ok

---

## 💡 DICAS

1. **Root Directory VAZIO é crucial** - 90% dos erros vêm daqui
2. **Copiar variáveis COM CUIDADO** - Sem espaços extras
3. **Aguardar build terminar** - Demora 3-5 minutos
4. **Se der erro** - Redeploy resolve na maioria das vezes
5. **Se não resolver** - Delete o serviço e crie novo

---

## 🆘 AJUDA RÁPIDA

**Erro no deploy?**
→ Ler `GUIA_RESOLVER_ERROS.md`

**Quer entender melhor?**
→ Ler `GUIA_COMPLETO_AMADOR.md`

**Ver telas esperadas?**
→ Ler `GUIA_VISUAL_TELAS.md`

**Desenvolver features?**
→ Ler `COMECE_AQUI.md`

---

**Tempo total estimado:**
- Leitura: 5 minutos
- Supabase: 3 minutos
- Railway: 5 minutos
- Build: 3-5 minutos
- **TOTAL: ~15 minutos**

---

**Criado com ⚡ para deploy ultrarrápido**  
**Versão:** 2.0  
**Data:** 08/12/2025
