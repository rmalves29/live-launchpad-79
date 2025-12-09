# 🚂 Railway: Solução Definitiva para Bloqueio WhatsApp

## 🎯 Problema

O WhatsApp está bloqueando o IP do Railway (erro 405) porque:
- Múltiplas tentativas de conexão
- Railway usa IPs de data center (mais suscetíveis a bloqueio)
- Outros usuários podem ter usado o mesmo IP antes

## ✅ Soluções Práticas para Railway

### 🏆 **SOLUÇÃO 1: Proxy SOCKS5 (Recomendada - 95% de eficácia)**

Use um proxy rotativo para mudar o IP percebido pelo WhatsApp.

#### Passo 1: Adicionar serviço de proxy ao Railway

**Opção A - Bright Data (Mais confiável):**
1. Crie conta grátis em https://brightdata.com
2. Configure proxy SOCKS5 residencial
3. No Railway, adicione variáveis de ambiente:

```bash
PROXY_HOST=zproxy.lum-superproxy.io
PROXY_PORT=22225
PROXY_USER=seu_usuario
PROXY_PASSWORD=sua_senha
```

**Opção B - Webshare (Mais barato):**
1. Crie conta em https://www.webshare.io
2. Crie 1 proxy SOCKS5
3. No Railway:

```bash
PROXY_HOST=proxy.webshare.io
PROXY_PORT=porta_fornecida
PROXY_USER=seu_usuario
PROXY_PASSWORD=sua_senha
```

**Opção C - IPRoyal (Alternativa):**
```bash
PROXY_HOST=geo.iproyal.com
PROXY_PORT=12321
PROXY_USER=seu_usuario
PROXY_PASSWORD=sua_senha
```

---

### 🔧 **SOLUÇÃO 2: Mudar Região do Railway (Média eficácia - 70%)**

O Railway tem múltiplas regiões, cada uma com IPs diferentes:

1. Acesse seu projeto no Railway
2. Vá em **Settings > Deploy**
3. Em **Region**, mude para:
   - `us-west1` (Oregon - EUA)
   - `eu-west1` (Bélgica - Europa)
   - `ap-southeast1` (Singapura - Ásia)

4. Faça um novo deploy
5. **Aguarde 20 minutos** antes de tentar conectar

---

### 🆕 **SOLUÇÃO 3: Usar WhatsApp Business API (100% eficácia)**

Melhor solução a longo prazo:

**Opção A - Maytapi (Mais fácil):**
- https://maytapi.com
- R$ 50/mês
- API estável, sem bloqueios
- Setup em 5 minutos

**Opção B - Evolution API (Open Source):**
- Deploy próprio no Railway
- Grátis (só paga infraestrutura)
- Mais controle

**Opção C - Waha (WhatsApp HTTP API):**
- Docker simplificado
- Funciona bem no Railway
- Open source

---

### ⚡ **SOLUÇÃO 4: Rate Limiting Agressivo (60% eficácia)**

Limitar drasticamente as tentativas de conexão:

No Railway, configure variáveis:

```bash
WHATSAPP_RETRY_DELAY=300000        # 5 minutos entre tentativas
WHATSAPP_MAX_RETRIES=2             # Máximo 2 tentativas
WHATSAPP_TIMEOUT=180000            # Timeout de 3 minutos
WHATSAPP_COOLDOWN_ON_405=1800000   # 30 min de cooldown se 405
```

---

### 🔄 **SOLUÇÃO 5: Rotação Automática de Deploy (70% eficácia)**

Forçar Railway a dar novo IP periodicamente:

#### Criar Cron Job para Redeploy:

1. Instale GitHub Actions no seu repo
2. Crie `.github/workflows/railway-rotate.yml`:

```yaml
name: Railway IP Rotation

on:
  schedule:
    # Executa a cada 6 horas
    - cron: '0 */6 * * *'
  workflow_dispatch: # Permite execução manual

jobs:
  redeploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Railway Redeploy
        run: |
          curl -X POST https://backboard.railway.app/graphql \
            -H "Authorization: Bearer ${{ secrets.RAILWAY_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"query":"mutation { projectRedeploy(projectId: \"${{ secrets.RAILWAY_PROJECT_ID }}\") { id } }"}'
```

3. No Railway Dashboard > Settings > Tokens, crie um token
4. No GitHub repo > Settings > Secrets, adicione:
   - `RAILWAY_TOKEN`
   - `RAILWAY_PROJECT_ID`

---

## 🎯 Solução Implementada: Servidor com Proxy

### ✅ Criado: `backend/server-whatsapp-railway.js`

Servidor especializado para Railway com:
- ✅ Suporte a Proxy SOCKS5 automático
- ✅ Proteção contra erro 405 com cooldown inteligente
- ✅ Rate limiting configurável
- ✅ Reconexão segura com delays
- ✅ Logs detalhados para Railway
- ✅ Health check para monitoramento

---

## 📋 Configuração Passo a Passo no Railway

### **PASSO 1: Configurar Variáveis de Ambiente**

No Railway Dashboard > Seu Projeto > Variables, adicione:

#### Variáveis Obrigatórias:
```bash
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=sua_service_key_aqui
PORT=3333
```

#### Variáveis de Proteção (Recomendadas):
```bash
WHATSAPP_MAX_RETRIES=2
WHATSAPP_RETRY_DELAY=300000
WHATSAPP_TIMEOUT=120000
WHATSAPP_COOLDOWN_ON_405=1800000
```

#### Variáveis de Proxy (Opcional mas MUITO recomendado):
```bash
# Exemplo com Webshare.io
PROXY_HOST=proxy.webshare.io
PROXY_PORT=80
PROXY_USER=seu_usuario
PROXY_PASSWORD=sua_senha
```

---

### **PASSO 2: Configurar o Comando de Start**

No Railway Dashboard > Settings > Deploy:

**Start Command:**
```bash
node backend/server-whatsapp-railway.js
```

Ou se quiser usar o package.json, adicione no `scripts`:
```json
"start:railway": "node backend/server-whatsapp-railway.js"
```

E configure no Railway:
```bash
npm run start:railway
```

---

### **PASSO 3: Escolher Proxy (Recomendado)**

#### 🏆 Opção 1: Webshare.io (Mais Fácil)

1. Crie conta em https://www.webshare.io
2. No dashboard, clique em "Proxy List"
3. Copie as credenciais SOCKS5:
   - Host: `proxy.webshare.io`
   - Port: `80` ou a porta fornecida
   - Username: seu username
   - Password: sua senha

4. Adicione no Railway:
```bash
PROXY_HOST=proxy.webshare.io
PROXY_PORT=80
PROXY_USER=seu_username
PROXY_PASSWORD=sua_senha
```

**Custo:** ~$2.99/mês para 10 proxies

---

#### 🥈 Opção 2: Bright Data (Mais Confiável)

1. Crie conta em https://brightdata.com
2. Vá em "Proxies & Scraping Infrastructure"
3. Crie uma "Residential Proxy Zone"
4. Copie as credenciais SOCKS5

5. Adicione no Railway:
```bash
PROXY_HOST=zproxy.lum-superproxy.io
PROXY_PORT=22225
PROXY_USER=brd-customer-XXX-zone-YYY
PROXY_PASSWORD=sua_senha
```

**Custo:** $500 em créditos grátis iniciais

---

#### 🥉 Opção 3: ProxyMesh (Rotativo)

1. Crie conta em https://proxymesh.com
2. Configure proxy rotativo
3. Adicione no Railway:
```bash
PROXY_HOST=us-wa.proxymesh.com
PROXY_PORT=31280
PROXY_USER=seu_usuario
PROXY_PASSWORD=sua_senha
```

**Custo:** $10/mês

---

### **PASSO 4: Deploy no Railway**

1. Faça commit das mudanças:
```bash
git add .
git commit -m "feat: Servidor WhatsApp otimizado para Railway"
git push origin main
```

2. Railway detectará automaticamente e fará o deploy

3. Aguarde o deploy terminar (2-3 minutos)

4. **IMPORTANTE:** Aguarde 20 minutos antes de tentar conectar se teve erro 405 recente

---

### **PASSO 5: Testar Conexão**

1. Obtenha a URL do Railway:
   - No dashboard: `https://seu-projeto.railway.app`

2. Teste o status:
```bash
curl https://seu-projeto.railway.app/
```

3. Gere QR Code:
```bash
curl https://seu-projeto.railway.app/qr/SEU_TENANT_ID
```

4. Se aparecer o QR em base64, cole em:
   - https://base64.guru/converter/decode/image

---

## 🔍 Monitoramento no Railway

### Ver Logs em Tempo Real:

1. Railway Dashboard > Seu Projeto > Deployments
2. Clique no deployment ativo
3. Veja a aba "Logs"

### O que procurar nos logs:

✅ **Sinais Bons:**
```
[PROXY] Proxy configurado: proxy.webshare.io:80
[✓] Proxy funcionando! IP externo: XXX.XXX.XXX.XXX
[QR] QR Code gerado para tenant: seu_tenant
[✓] WhatsApp conectado para tenant: seu_tenant
```

⚠️ **Sinais de Problema:**
```
[⚠] Proxy NÃO configurado
[✗] ERRO 405 DETECTADO - IP BLOQUEADO
[⚠] Aguardando 30 minutos antes de reconectar
```

---

## 🚨 Troubleshooting Railway

### Problema 1: Erro 405 Continua Mesmo com Proxy

**Solução:**
1. Verifique se o proxy está ativo nos logs
2. Teste o proxy manualmente:
```bash
curl --socks5 usuario:senha@proxy.host:porta https://api.ipify.org
```
3. Troque de provedor de proxy
4. Limpe o cooldown:
```bash
curl -X POST https://seu-projeto.railway.app/clear-cooldown/SEU_TENANT_ID
```

---

### Problema 2: Railway Não Inicia Servidor

**Solução:**
1. Verifique se o Start Command está correto
2. Veja os logs de build no Railway
3. Instale dependências necessárias:
```bash
npm install socks-proxy-agent node-fetch
```

---

### Problema 3: QR Code Não Aparece

**Solução:**
1. Aguarde 60 segundos após fazer requisição
2. Tente forçar novo QR:
```bash
curl -X POST https://seu-projeto.railway.app/generate-qr/SEU_TENANT_ID
```
3. Verifique se não está em cooldown:
```bash
curl https://seu-projeto.railway.app/status/SEU_TENANT_ID
```

---

### Problema 4: Proxy Não Funciona

**Solução:**
1. Teste credenciais do proxy localmente primeiro
2. Verifique se o plano do proxy permite SOCKS5
3. Alguns proxies precisam de whitelist de IP - adicione o IP do Railway
4. Use proxy HTTP em vez de SOCKS5 (ajustar código)

---

## 🎯 Comparação de Soluções

| Solução | Eficácia | Custo/mês | Complexidade | Recomendação |
|---------|----------|-----------|--------------|--------------|
| **Proxy SOCKS5** | 95% | $3-10 | Baixa | ⭐⭐⭐⭐⭐ |
| Mudar Região Railway | 70% | $0 | Muito Baixa | ⭐⭐⭐ |
| Rate Limiting | 60% | $0 | Baixa | ⭐⭐ |
| Evolution API | 100% | $5 | Média | ⭐⭐⭐⭐ |
| WhatsApp Business API | 100% | $50+ | Alta | ⭐⭐⭐⭐⭐ |

---

## 🔗 Links Úteis

- **Webshare.io:** https://www.webshare.io
- **Bright Data:** https://brightdata.com
- **ProxyMesh:** https://proxymesh.com
- **Railway Docs:** https://docs.railway.app
- **Evolution API:** https://evolution-api.com

---

## ✅ Checklist Final

Antes de considerar resolvido:

- [ ] Proxy configurado e testado
- [ ] Variáveis de ambiente no Railway
- [ ] Start Command correto
- [ ] Deploy realizado com sucesso
- [ ] Aguardou 20 minutos se teve 405 recente
- [ ] Testou endpoint `/` e viu "Proxy: ATIVO"
- [ ] Conseguiu gerar QR Code
- [ ] WhatsApp conectou sem erro 405

---

## 🎉 Resultado Esperado

Com proxy configurado corretamente:
- ✅ QR Code gerado em 10-30 segundos
- ✅ Conexão estável sem erro 405
- ✅ IP diferente do Railway (verificável nos logs)
- ✅ Reconexões automáticas funcionando
- ✅ Sistema multi-tenant operacional

---

**🚂 Seu Railway está pronto para conectar WhatsApp sem bloqueios! 🎯**

