# 🚂 Railway - Solução Completa WhatsApp Anti-Bloqueio

## 🎯 Problema Resolvido

✅ **Erro 405 - IP Bloqueado pelo WhatsApp no Railway**  
✅ **QR Code não gerado**  
✅ **Reconexões infinitas**  
✅ **Falta de controle de rate limit**

---

## 📚 Documentação Disponível

### 🚀 Para Começar AGORA:

1. **[DEPLOY_RAILWAY_GUIA_RAPIDO.md](./DEPLOY_RAILWAY_GUIA_RAPIDO.md)** ⭐  
   Deploy em 5 passos rápidos com comandos prontos.
   
2. **[RAILWAY_SETUP_VISUAL.md](./RAILWAY_SETUP_VISUAL.md)** 📸  
   Guia passo a passo com instruções visuais detalhadas.

### 🔧 Para Entender a Solução:

3. **[RAILWAY_WHATSAPP_SOLUCAO.md](./RAILWAY_WHATSAPP_SOLUCAO.md)** 📖  
   Explicação técnica completa de todas as soluções disponíveis.

### 🧪 Para Testar:

4. **Script de Teste Local:**
   ```bash
   ./test-railway-local.sh
   ```
   Testa localmente antes de fazer deploy.

### ⚙️ Configuração:

5. **[.railway-env.example](./.railway-env.example)**  
   Template com todas as variáveis de ambiente necessárias.

---

## ⚡ Quick Start (3 Comandos)

```bash
# 1. Instalar dependências
cd backend && ./install-railway-deps.sh && cd ..

# 2. Commit e push
git add . && git commit -m "Deploy Railway" && git push

# 3. Configurar no Railway Dashboard
# - Adicione variáveis do .railway-env.example
# - Start Command: node backend/server-whatsapp-railway.js
```

---

## 🔑 Principais Funcionalidades

### ✅ Servidor Otimizado
- **Arquivo:** `backend/server-whatsapp-railway.js`
- Proxy SOCKS5 automático
- Proteção contra erro 405
- Rate limiting inteligente
- Logs estruturados para Railway

### ✅ Proteção Anti-Bloqueio
- Cooldown de 30 min após erro 405
- Máximo de 2 tentativas com delay de 5 min
- Timeout de 2 min por conexão
- Reconexão automática com delays progressivos

### ✅ Suporte a Proxy
Compatível com:
- **Webshare.io** ($3/mês) - Recomendado
- **Bright Data** (trial grátis)
- **ProxyMesh** ($10/mês)
- **IPRoyal**

---

## 🎯 Configuração Railway em 5 Etapas

### 1️⃣ Instalar Dependências
```bash
cd backend
./install-railway-deps.sh
```

### 2️⃣ Configurar Proxy (Recomendado)
- Crie conta no [Webshare.io](https://www.webshare.io)
- Anote: Host, Port, Username, Password

### 3️⃣ Adicionar Variáveis no Railway
Copie de `.railway-env.example`:
- Supabase (obrigatório)
- Proteção (recomendado)
- Proxy (muito recomendado)

### 4️⃣ Configurar Start Command
```bash
node backend/server-whatsapp-railway.js
```

### 5️⃣ Deploy
```bash
git add .
git commit -m "Deploy Railway com anti-bloqueio"
git push origin main
```

**⏰ Aguarde 20 minutos se teve erro 405 antes!**

---

## 🧪 Testar Após Deploy

### Verificar Status:
```bash
curl https://seu-projeto.railway.app/
```

**Deve retornar:**
```json
{
  "server": "WhatsApp Multi-Tenant Railway Edition",
  "proxy": true,  ← IMPORTANTE!
  "proxyConfig": "proxy.webshare.io:80"
}
```

### Gerar QR Code:
```bash
curl https://seu-projeto.railway.app/qr/SEU_TENANT_ID
```

---

## 📊 Endpoints Disponíveis

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/` | GET | Status geral do servidor |
| `/health` | GET | Health check |
| `/status/:tenantId` | GET | Status de um tenant |
| `/qr/:tenantId` | GET | Obter QR Code |
| `/generate-qr/:tenantId` | POST | Forçar novo QR |
| `/reset/:tenantId` | POST | Reset completo |
| `/clear-cooldown/:tenantId` | POST | Limpar cooldown 405 |

---

## 🚨 Troubleshooting Rápido

### ❌ Erro 405 Continua
1. Verificar se proxy está ativo nos logs
2. Aguardar cooldown de 30 minutos
3. Testar proxy: `curl --socks5 user:pass@proxy:port https://api.ipify.org`

### ❌ "proxy": false
1. Adicionar variáveis de proxy no Railway
2. Railway reiniciará automaticamente

### ❌ QR Code Não Aparece
```bash
# Verificar status
curl https://seu-projeto.railway.app/status/SEU_TENANT_ID

# Forçar novo QR
curl -X POST https://seu-projeto.railway.app/generate-qr/SEU_TENANT_ID

# Aguardar 60s e buscar
sleep 60
curl https://seu-projeto.railway.app/qr/SEU_TENANT_ID
```

---

## 💰 Custos Estimados

| Item | Custo/mês | Necessário? |
|------|-----------|-------------|
| Railway Hobby | $5 | ✅ Sim |
| Webshare Proxy | $3 | ⭐ Muito Recomendado |
| **TOTAL** | **$8** | |

---

## 📋 Checklist de Deploy

Antes de fazer deploy:

- [ ] Dependências instaladas (`./backend/install-railway-deps.sh`)
- [ ] Proxy configurado (Webshare ou outro)
- [ ] Variáveis de ambiente no Railway (mínimo 7)
- [ ] Start Command: `node backend/server-whatsapp-railway.js`
- [ ] Código commitado e pushed
- [ ] Aguardou 20 min se teve erro 405

Após deploy:

- [ ] Deploy com status SUCCESS
- [ ] Logs mostram "Proxy configurado"
- [ ] Endpoint `/` retorna `"proxy": true`
- [ ] Consegue gerar QR Code
- [ ] WhatsApp conecta sem erro 405

---

## 🔗 Links Úteis

### Provedores de Proxy:
- **Webshare:** https://www.webshare.io (Recomendado)
- **Bright Data:** https://brightdata.com (Trial grátis)
- **ProxyMesh:** https://proxymesh.com

### Plataformas:
- **Railway:** https://railway.app/dashboard
- **Supabase:** https://app.supabase.com

### Ferramentas:
- **Decodificar QR:** https://base64.guru/converter/decode/image
- **Testar Proxy:** `curl --socks5 user:pass@host:port https://api.ipify.org`

---

## 📞 Suporte

### Documentação Completa:
- `RAILWAY_WHATSAPP_SOLUCAO.md` - Explicação técnica
- `DEPLOY_RAILWAY_GUIA_RAPIDO.md` - Deploy em 5 passos
- `RAILWAY_SETUP_VISUAL.md` - Guia visual passo a passo

### Logs:
Railway Dashboard > Seu Projeto > Deployment > Logs

### Teste Local:
```bash
./test-railway-local.sh
```

---

## ✅ Resultado Final

Com tudo configurado:

✅ WhatsApp conecta em 10-30 segundos  
✅ Sem erro 405 (IP bloqueado)  
✅ QR Code gerado automaticamente  
✅ Reconexão automática funcionando  
✅ Sistema multi-tenant operacional  
✅ Proxy protegendo seu IP  
✅ Logs detalhados no Railway  

---

## 🎉 Commits Relacionados

- **42f2955** - Solução completa anti-bloqueio
- **343b9f9** - Documentação visual e teste local

---

**🚂 Pronto para rodar no Railway sem bloqueios! 🎯**

**Dúvidas?** Consulte os guias detalhados acima ou veja os logs do Railway.
