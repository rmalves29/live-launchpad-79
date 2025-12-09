# 🚂 Railway Setup Visual - Passo a Passo com Imagens

## 🎯 Objetivo

Conectar WhatsApp no Railway **SEM erro 405** usando proxy.

---

## 📋 O Que Você Precisa

1. ✅ Conta no Railway (https://railway.app)
2. ✅ Conta no Webshare (https://www.webshare.io) - **OPCIONAL mas RECOMENDADO**
3. ✅ Seu projeto já no GitHub
4. ✅ Credenciais do Supabase

---

## 🔧 ETAPA 1: Configurar Proxy (Recomendado)

### Passo 1.1: Criar Conta no Webshare

1. Acesse: https://www.webshare.io/register
2. Preencha email e senha
3. Confirme email
4. Faça login

### Passo 1.2: Obter Credenciais do Proxy

1. No dashboard Webshare, clique em **"Proxy List"**
2. Você verá uma lista de proxies
3. Clique em **"Copy"** ao lado de um proxy SOCKS5
4. Anote:

```
Host: proxy.webshare.io
Port: 80
Username: [seu_username]
Password: [sua_senha]
```

**💡 Dica:** Guarde essas credenciais, vamos usar na ETAPA 3!

---

## 🚂 ETAPA 2: Configurar Railway

### Passo 2.1: Conectar GitHub ao Railway

1. Acesse: https://railway.app/dashboard
2. Clique em **"New Project"**
3. Escolha **"Deploy from GitHub repo"**
4. Selecione seu repositório: `rmalves29/orderzap`
5. Clique em **"Deploy Now"**

### Passo 2.2: Aguardar Primeiro Deploy

- Railway vai detectar automaticamente o projeto
- Aguarde 2-3 minutos
- Você verá logs de build na tela

### Passo 2.3: Configurar Start Command

1. Clique no seu projeto no dashboard
2. Clique em **"Settings"** (engrenagem)
3. Role até **"Deploy"**
4. Em **"Start Command"**, cole:

```bash
node backend/server-whatsapp-railway.js
```

5. Clique em **"Save"**

---

## 🔐 ETAPA 3: Adicionar Variáveis de Ambiente

### Passo 3.1: Abrir Painel de Variáveis

1. No seu projeto Railway, clique em **"Variables"** (ícone de cadeado)
2. Você verá uma lista de variáveis

### Passo 3.2: Adicionar Variáveis OBRIGATÓRIAS

Clique em **"New Variable"** e adicione uma por vez:

#### 1️⃣ Supabase URL
```
Variable Name: VITE_SUPABASE_URL
Value: https://seu-projeto.supabase.co
```

#### 2️⃣ Supabase Service Key
```
Variable Name: SUPABASE_SERVICE_KEY
Value: [sua_service_key_completa]
```
**⚠️ Importante:** Esta é a **Service Key**, não a Anon Key!

#### 3️⃣ Porta
```
Variable Name: PORT
Value: 3333
```

### Passo 3.3: Adicionar Variáveis de PROTEÇÃO (Recomendado)

Continue adicionando:

#### 4️⃣ Max Tentativas
```
Variable Name: WHATSAPP_MAX_RETRIES
Value: 2
```

#### 5️⃣ Delay entre Tentativas
```
Variable Name: WHATSAPP_RETRY_DELAY
Value: 300000
```
*Significa 5 minutos em milissegundos*

#### 6️⃣ Timeout de Conexão
```
Variable Name: WHATSAPP_TIMEOUT
Value: 120000
```
*Significa 2 minutos em milissegundos*

#### 7️⃣ Cooldown após Erro 405
```
Variable Name: WHATSAPP_COOLDOWN_ON_405
Value: 1800000
```
*Significa 30 minutos em milissegundos*

### Passo 3.4: Adicionar Variáveis de PROXY (Muito Recomendado!)

Se você configurou o Webshare na ETAPA 1:

#### 8️⃣ Proxy Host
```
Variable Name: PROXY_HOST
Value: proxy.webshare.io
```

#### 9️⃣ Proxy Port
```
Variable Name: PROXY_PORT
Value: 80
```

#### 🔟 Proxy Username
```
Variable Name: PROXY_USER
Value: [seu_username_webshare]
```

#### 1️⃣1️⃣ Proxy Password
```
Variable Name: PROXY_PASSWORD
Value: [sua_senha_webshare]
```

### Passo 3.5: Salvar

Depois de adicionar todas, clique em **"Update Variables"**

Railway vai reiniciar automaticamente o serviço.

---

## 🚀 ETAPA 4: Fazer Deploy

### Passo 4.1: Commit e Push

No seu terminal:

```bash
cd /home/user/webapp/backend
./install-railway-deps.sh
cd ..
git add .
git commit -m "feat: Configurado para Railway"
git push origin main
```

### Passo 4.2: Aguardar Deploy

1. Volte ao dashboard Railway
2. Vá em **"Deployments"**
3. Você verá um novo deployment rodando
4. Aguarde até ver **"SUCCESS"** (2-3 minutos)

### Passo 4.3: ⏰ AGUARDAR COOLDOWN (Se teve 405 antes)

**MUITO IMPORTANTE:**

Se você teve erro 405 recentemente, **aguarde 20 minutos** antes de tentar conectar!

Use um timer:
```bash
sleep 1200
```

---

## 🧪 ETAPA 5: Testar Conexão

### Passo 5.1: Obter URL do Projeto

1. No Railway dashboard, clique no seu projeto
2. Vá em **"Settings"**
3. Em **"Domains"**, clique em **"Generate Domain"**
4. Copie a URL gerada, algo como:
   ```
   https://orderzap-production.up.railway.app
   ```

### Passo 5.2: Testar Status do Servidor

Abra um navegador ou use curl:

```bash
curl https://orderzap-production.up.railway.app/
```

**Você DEVE ver:**
```json
{
  "server": "WhatsApp Multi-Tenant Railway Edition",
  "proxy": true,  ← IMPORTANTE: deve ser true!
  "proxyConfig": "proxy.webshare.io:80",
  "clients": 0
}
```

✅ Se `"proxy": true` → Proxy configurado corretamente!
❌ Se `"proxy": false` → Volte e verifique variáveis do proxy

### Passo 5.3: Gerar QR Code

```bash
curl https://orderzap-production.up.railway.app/qr/SEU_TENANT_ID
```

Substitua `SEU_TENANT_ID` pelo ID do seu tenant (ex: `abc123`)

**Resposta esperada:**
```json
{
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "tenantId": "abc123"
}
```

### Passo 5.4: Ver QR Code

1. Copie o valor do campo `qr` (tudo depois de `data:image/png;base64,`)
2. Acesse: https://base64.guru/converter/decode/image
3. Cole o código
4. Clique em **"Decode"**
5. Escaneie o QR com WhatsApp

---

## 📊 ETAPA 6: Monitorar Logs

### Passo 6.1: Abrir Logs no Railway

1. No dashboard Railway, clique no seu projeto
2. Clique no deployment ativo (será verde)
3. Veja a aba **"Logs"**

### Passo 6.2: Logs que Indicam SUCESSO

Procure por estas linhas:

```
[PROXY] Proxy configurado: proxy.webshare.io:80
[✓] Proxy funcionando! IP externo: 123.45.67.89
[INFO] Criando cliente WhatsApp para tenant: abc123
[QR] QR Code gerado para tenant: abc123
[✓] WhatsApp conectado para tenant: abc123
```

### Passo 6.3: Logs que Indicam PROBLEMA

Se ver estas linhas, há problema:

```
[⚠] Proxy NÃO configurado
```
→ **Solução:** Volte à ETAPA 3 e adicione variáveis de proxy

```
[✗] ERRO 405 DETECTADO - IP BLOQUEADO!
```
→ **Solução:** Aguarde o cooldown de 30 minutos

```
Error: ECONNREFUSED
```
→ **Solução:** Proxy offline ou credenciais erradas

---

## 🎯 Checklist Final

Antes de considerar concluído, verifique:

- [ ] Railway deploy com status **SUCCESS**
- [ ] Variáveis de ambiente todas configuradas (11 variáveis)
- [ ] Start Command: `node backend/server-whatsapp-railway.js`
- [ ] Endpoint `/` retorna `"proxy": true`
- [ ] Logs mostram "Proxy funcionando!"
- [ ] Aguardou 20 minutos se teve erro 405 antes
- [ ] Conseguiu gerar QR Code
- [ ] QR Code foi escaneado no WhatsApp
- [ ] WhatsApp conectou (log mostra "WhatsApp conectado")

---

## 🚨 Troubleshooting Rápido

### Problema: Railway não inicia

**Causa:** Dependências faltando

**Solução:**
```bash
cd /home/user/webapp/backend
./install-railway-deps.sh
git add package.json package-lock.json
git commit -m "fix: Adicionar dependências"
git push
```

---

### Problema: "proxy": false nos logs

**Causa:** Variáveis de proxy não configuradas

**Solução:**
1. Railway > Variables
2. Adicione as 4 variáveis de proxy:
   - `PROXY_HOST`
   - `PROXY_PORT`
   - `PROXY_USER`
   - `PROXY_PASSWORD`
3. Railway vai reiniciar automaticamente

---

### Problema: Erro 405 continua

**Causa:** IP ainda bloqueado ou proxy não funciona

**Solução 1 - Aguardar:**
```bash
# Limpar cooldown (use com cautela!)
curl -X POST https://seu-projeto.railway.app/clear-cooldown/SEU_TENANT_ID

# Aguardar 20 minutos
sleep 1200

# Tentar novamente
curl -X POST https://seu-projeto.railway.app/generate-qr/SEU_TENANT_ID
```

**Solução 2 - Testar proxy:**
```bash
# Testar se proxy funciona
curl --socks5 usuario:senha@proxy.webshare.io:80 https://api.ipify.org
```

Se der erro, o proxy está offline ou credenciais erradas.

**Solução 3 - Mudar região Railway:**
1. Railway > Settings > Deploy
2. Em "Region", mude para:
   - `us-west1` (Oregon)
   - `eu-west1` (Bélgica)
   - `ap-southeast1` (Singapura)
3. Aguarde 20 minutos
4. Tente conectar

---

### Problema: QR Code não aparece

**Causa:** Cliente não foi criado ou está em cooldown

**Solução:**
```bash
# 1. Verificar status
curl https://seu-projeto.railway.app/status/SEU_TENANT_ID

# 2. Se in405Cooldown: true, aguarde o tempo indicado

# 3. Forçar nova geração
curl -X POST https://seu-projeto.railway.app/generate-qr/SEU_TENANT_ID

# 4. Aguardar 60 segundos
sleep 60

# 5. Buscar QR
curl https://seu-projeto.railway.app/qr/SEU_TENANT_ID
```

---

## 💰 Custos Estimados

| Serviço | Custo/mês | Necessário? |
|---------|-----------|-------------|
| Railway Hobby | $5 | ✅ Sim |
| Webshare Proxy | $3 | ⭐ Muito Recomendado |
| **TOTAL** | **$8** | |

---

## 📞 Precisa de Ajuda?

**Documentação Completa:**
- `RAILWAY_WHATSAPP_SOLUCAO.md` - Guia técnico detalhado
- `DEPLOY_RAILWAY_GUIA_RAPIDO.md` - Guia rápido em 5 passos

**Logs para Verificar:**
- Railway > Seu Projeto > Deployment > Logs

**Endpoints Úteis:**
- Status: `GET /`
- Health: `GET /health`
- QR Code: `GET /qr/:tenantId`
- Status Tenant: `GET /status/:tenantId`
- Gerar QR: `POST /generate-qr/:tenantId`
- Reset: `POST /reset/:tenantId`

---

## ✅ Resultado Final

Com tudo configurado corretamente, você terá:

✅ WhatsApp conectando em 10-30 segundos  
✅ Sem erro 405 (IP bloqueado)  
✅ QR Code gerado automaticamente  
✅ Reconexão automática em caso de queda  
✅ Logs detalhados no Railway  
✅ Sistema multi-tenant funcionando  
✅ Proxy rotativo protegendo seu IP  

---

**🎉 Parabéns! Seu WhatsApp está pronto para rodar no Railway sem bloqueios! 🚂**
