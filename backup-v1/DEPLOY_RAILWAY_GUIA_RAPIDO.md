# 🚂 Railway: Guia Rápido de Deploy - WhatsApp Anti-Bloqueio

## ⚡ Deploy em 5 Passos

### 1️⃣ Instalar Dependências

No seu terminal local:

```bash
cd /home/user/webapp/backend
./install-railway-deps.sh
```

Ou manualmente:
```bash
cd backend
npm install socks-proxy-agent @whiskeysockets/baileys @hapi/boom node-fetch qrcode fs-extra pino
```

---

### 2️⃣ Escolher Provedor de Proxy (MUITO RECOMENDADO)

#### 🏆 Opção Recomendada: Webshare.io

1. Acesse: https://www.webshare.io/register
2. Crie conta (tem trial grátis)
3. Vá em "Proxy List"
4. Anote:
   - **Host:** `proxy.webshare.io`
   - **Port:** `80`
   - **Username:** seu username
   - **Password:** sua senha

**Custo:** $2.99/mês ou grátis por 30 dias

---

### 3️⃣ Configurar Variáveis no Railway

No Railway Dashboard > Seu Projeto > **Variables**, adicione:

#### ✅ OBRIGATÓRIAS:
```bash
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=sua_service_key_aqui
PORT=3333
```

#### ⭐ PROTEÇÃO (Recomendadas):
```bash
WHATSAPP_MAX_RETRIES=2
WHATSAPP_RETRY_DELAY=300000
WHATSAPP_TIMEOUT=120000
WHATSAPP_COOLDOWN_ON_405=1800000
```

#### 🔐 PROXY (MUITO Recomendado):
```bash
PROXY_HOST=proxy.webshare.io
PROXY_PORT=80
PROXY_USER=seu_usuario_webshare
PROXY_PASSWORD=sua_senha_webshare
```

💡 **Dica:** Copie de `.railway-env.example`

---

### 4️⃣ Configurar Start Command

No Railway Dashboard > **Settings** > **Deploy**:

Em **Start Command**, coloque:
```bash
node backend/server-whatsapp-railway.js
```

---

### 5️⃣ Fazer Deploy

```bash
git add .
git commit -m "feat: Deploy Railway com anti-bloqueio WhatsApp"
git push origin main
```

Railway vai:
1. Detectar mudanças
2. Fazer build automático
3. Iniciar servidor em ~2 minutos

**⏰ IMPORTANTE:** Aguarde 20 minutos se teve erro 405 recentemente!

---

## 🧪 Testar Após Deploy

### 1. Obter URL do Projeto

No Railway Dashboard, copie a URL:
```
https://seu-projeto.railway.app
```

### 2. Verificar Status

```bash
curl https://seu-projeto.railway.app/
```

**Resposta esperada:**
```json
{
  "server": "WhatsApp Multi-Tenant Railway Edition",
  "proxy": true,  ← DEVE SER true!
  "proxyConfig": "proxy.webshare.io:80",
  "clients": 0
}
```

### 3. Gerar QR Code

```bash
curl https://seu-projeto.railway.app/qr/SEU_TENANT_ID
```

**Resposta esperada:**
```json
{
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "tenantId": "SEU_TENANT_ID"
}
```

### 4. Decodificar QR Code

Copie o valor do `qr` (depois de `data:image/png;base64,`) e cole em:
- https://base64.guru/converter/decode/image

Ou use ferramenta local:
```bash
echo "iVBORw0KGgoAAAANS..." | base64 -d > qrcode.png
```

---

## 📊 Monitorar Logs no Railway

1. Railway Dashboard > Seu Projeto
2. Clique no deployment ativo
3. Veja aba "**Logs**"

### Logs que você DEVE ver:

```
✅ Bons Sinais:
[PROXY] Proxy configurado: proxy.webshare.io:80
[✓] Proxy funcionando! IP externo: 123.45.67.89
[INFO] Criando cliente WhatsApp para tenant: abc123
[QR] QR Code gerado para tenant: abc123
[✓] WhatsApp conectado para tenant: abc123

⚠️ Sinais de Problema:
[⚠] Proxy NÃO configurado. WhatsApp pode bloquear IP do Railway.
[✗] ERRO 405 DETECTADO para abc123 - IP BLOQUEADO!
[⚠] Aguardando 30 minutos antes de reconectar...
```

---

## 🚨 Solução de Problemas

### ❌ Erro: "Cannot find module 'socks-proxy-agent'"

**Solução:**
```bash
cd backend
npm install socks-proxy-agent
git add package.json package-lock.json
git commit -m "fix: Adicionar socks-proxy-agent"
git push
```

---

### ❌ Erro 405 Mesmo com Proxy

**Causas possíveis:**
1. Proxy não está configurado (veja logs)
2. Credenciais do proxy incorretas
3. IP do Railway bloqueado no proxy

**Solução:**
```bash
# 1. Verificar se proxy está ativo
curl https://seu-projeto.railway.app/ | grep "proxy"

# 2. Testar proxy localmente
curl --socks5 usuario:senha@proxy.webshare.io:80 https://api.ipify.org

# 3. Limpar cooldown e tentar novamente
curl -X POST https://seu-projeto.railway.app/clear-cooldown/SEU_TENANT_ID

# 4. Aguardar 20 minutos e gerar novo QR
curl -X POST https://seu-projeto.railway.app/generate-qr/SEU_TENANT_ID
```

---

### ❌ Proxy Retorna "proxy": false

**Solução:**
1. Verifique se as variáveis estão corretas no Railway:
   - `PROXY_HOST`
   - `PROXY_PORT`
   - `PROXY_USER`
   - `PROXY_PASSWORD`

2. Reinicie o serviço no Railway:
   - Settings > Deploy > Restart

3. Veja os logs para mensagens de erro do proxy

---

### ❌ QR Code Não Aparece

**Solução:**
```bash
# 1. Verificar status do tenant
curl https://seu-projeto.railway.app/status/SEU_TENANT_ID

# 2. Se in405Cooldown: true, aguarde o tempo indicado

# 3. Forçar nova geração
curl -X POST https://seu-projeto.railway.app/generate-qr/SEU_TENANT_ID

# 4. Aguardar 60 segundos e buscar QR
sleep 60
curl https://seu-projeto.railway.app/qr/SEU_TENANT_ID
```

---

### ❌ Railway Não Detecta Mudanças

**Solução:**
1. Force push:
```bash
git push -f origin main
```

2. Ou faça deploy manual no Railway Dashboard:
   - Deployments > três pontinhos > Redeploy

---

## 🎯 Checklist Pré-Deploy

Antes de fazer deploy, verifique:

- [ ] Dependências instaladas (`socks-proxy-agent`, `@whiskeysockets/baileys`, etc.)
- [ ] Proxy configurado (Webshare, Bright Data ou outro)
- [ ] Variáveis de ambiente no Railway
- [ ] Start Command: `node backend/server-whatsapp-railway.js`
- [ ] Código commitado e pushed
- [ ] Aguardou 20 min se teve erro 405 recente

---

## 🎯 Checklist Pós-Deploy

Após deploy, verifique:

- [ ] Logs mostram "Proxy configurado"
- [ ] Logs mostram "Proxy funcionando! IP externo: X.X.X.X"
- [ ] Endpoint `/` retorna `"proxy": true`
- [ ] Consegue gerar QR Code
- [ ] WhatsApp conecta sem erro 405
- [ ] Reconexão automática funciona

---

## 📞 Endpoints Disponíveis

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/` | GET | Status geral do servidor |
| `/health` | GET | Health check (para Railway) |
| `/status/:tenantId` | GET | Status de um tenant específico |
| `/qr/:tenantId` | GET | Obter QR Code |
| `/generate-qr/:tenantId` | POST | Forçar nova geração de QR |
| `/reset/:tenantId` | POST | Reset completo (limpa sessão) |
| `/clear-cooldown/:tenantId` | POST | Limpar cooldown 405 (emergência) |

---

## 💰 Custos Estimados

| Item | Custo/mês | Obrigatório? |
|------|-----------|--------------|
| Railway (Hobby) | $5 | ✅ Sim |
| Webshare Proxy | $3 | ⭐ Muito Recomendado |
| **TOTAL** | **$8** | |

---

## 🔗 Links Úteis

- **Webshare (Proxy):** https://www.webshare.io
- **Railway Dashboard:** https://railway.app/dashboard
- **Documentação Railway:** https://docs.railway.app
- **Supabase Dashboard:** https://app.supabase.com
- **Guia Completo:** `RAILWAY_WHATSAPP_SOLUCAO.md`

---

## ✅ Resumo: O Que Fazer AGORA

1. **Execute:**
   ```bash
   cd /home/user/webapp/backend
   ./install-railway-deps.sh
   ```

2. **Crie conta no Webshare:**
   - https://www.webshare.io/register
   - Anote credenciais do proxy

3. **Configure Railway:**
   - Adicione variáveis (use `.railway-env.example`)
   - Configure Start Command: `node backend/server-whatsapp-railway.js`

4. **Deploy:**
   ```bash
   git add .
   git commit -m "feat: Railway anti-bloqueio configurado"
   git push origin main
   ```

5. **Aguarde 20 minutos** (se teve 405 antes)

6. **Teste:**
   ```bash
   curl https://seu-projeto.railway.app/
   curl https://seu-projeto.railway.app/qr/SEU_TENANT_ID
   ```

---

**🚂 Pronto! Seu WhatsApp vai funcionar sem bloqueios no Railway! 🎉**
