# ⚡ GUIA RÁPIDO: Evolution API em 10 Minutos

## 🎯 O Que Você Vai Fazer AGORA

1. Deploy Evolution API no Railway (5 min)
2. Configurar Backend para usar Evolution API (3 min)
3. Testar QR Code e WhatsApp (2 min)

**Resultado:** WhatsApp funcionando SEM erro 405! 🎉

---

## 📝 PASSO 1: Deploy Evolution API (5 min)

### **Opção A - Template Railway (MAIS FÁCIL):**

1. **Clique neste link:**
   ```
   https://railway.app/new/template/evolution-api
   ```

2. **Configure:**
   - Repository: `EvolutionAPI/evolution-api`
   - Region: Escolha a mais próxima
   - Clique em **"Deploy"**

3. **Aguarde 3-5 minutos** (Railway faz tudo sozinho)

---

### **Opção B - Deploy Manual:**

1. Acesse: https://railway.app/dashboard
2. Clique em **"New Project"**
3. Escolha **"Deploy from GitHub repo"**
4. Procure por: `EvolutionAPI/evolution-api`
5. Clique em **"Deploy"**
6. Aguarde build terminar

---

### **Configure Variáveis:**

No Railway, vá em **Variables** do projeto Evolution API:

```bash
SERVER_PORT=8080
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=SEU_TOKEN_ALEATORIO_AQUI
CORS_ORIGIN=*
LOG_LEVEL=ERROR,WARN,INFO
PROVIDER_ENABLED=baileys
```

**Gerar token aleatório:**
- Linux/Mac: `openssl rand -base64 32`
- Ou use: https://randomkeygen.com

---

### **Obter URL Pública:**

1. Railway > Evolution API > **Settings** > **Networking**
2. Clique em **"Generate Domain"**
3. Copie a URL: `https://evolution-api-production.up.railway.app`
4. **ANOTE ESSA URL!**

---

### **Testar Evolution API:**

```bash
curl https://evolution-api-production.up.railway.app/
```

**Se retornar algo, FUNCIONOU!** ✅

---

## 🔧 PASSO 2: Configurar Backend (3 min)

### **2.1: Adicionar Variáveis no Backend:**

Railway > Projeto **Backend** > **Variables**

Adicione:

```bash
EVOLUTION_API_URL=https://evolution-api-production.up.railway.app
EVOLUTION_API_KEY=SEU_TOKEN_AQUI
```

(Use a MESMA API Key que configurou na Evolution API)

---

### **2.2: Atualizar Start Command:**

Railway > Backend > **Settings** > **Deploy**

**Start Command:**
```bash
node backend/server-evolution.js
```

Salve e aguarde restart automático (1-2 min)

---

### **2.3: Testar Backend:**

```bash
curl https://api.orderzaps.com/
```

**Resposta esperada:**
```json
{
  "server": "WhatsApp Multi-Tenant Evolution API",
  "evolutionApiStatus": "online"
}
```

✅ **Se `"evolutionApiStatus": "online"`, SUCESSO!**

---

## 🧪 PASSO 3: Testar WhatsApp (2 min)

### **3.1: Gerar QR Code:**

```bash
curl -X POST https://api.orderzaps.com/generate-qr/meu_tenant
```

---

### **3.2: Aguardar 5 segundos:**

```bash
sleep 5
```

---

### **3.3: Obter QR Code:**

```bash
curl https://api.orderzaps.com/qr/meu_tenant
```

**Resposta:**
```json
{
  "tenantId": "meu_tenant",
  "qr": "data:image/png;base64,iVBORw0..."
}
```

---

### **3.4: Escanear QR Code:**

1. Copie o valor de `"qr"` (TUDO)
2. Cole em: https://base64.guru/converter/decode/image
3. Escaneie com WhatsApp no celular
4. Aguarde conexão

---

### **3.5: Verificar Conexão:**

```bash
curl https://api.orderzaps.com/status/meu_tenant
```

**Resposta esperada:**
```json
{
  "connected": true,
  "state": "open"
}
```

✅ **Se `"connected": true`, WHATSAPP CONECTADO!** 🎉

---

### **3.6: Enviar Mensagem de Teste:**

```bash
curl -X POST https://api.orderzaps.com/send \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "meu_tenant",
    "number": "5511999999999",
    "message": "Teste Evolution API! 🚀"
  }'
```

**Se a mensagem chegar, TUDO FUNCIONANDO!** ✅

---

## ✅ Checklist Rápido

- [ ] Evolution API rodando no Railway
- [ ] URL Evolution API copiada
- [ ] Variáveis `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` no Backend
- [ ] Start Command: `node backend/server-evolution.js`
- [ ] Backend restart realizado
- [ ] Teste retorna `"evolutionApiStatus": "online"`
- [ ] QR Code gerado
- [ ] QR Code escaneado no WhatsApp
- [ ] Status retorna `"connected": true`
- [ ] Mensagem de teste enviada e recebida

---

## 🚨 Troubleshooting Rápido

### **Problema: "evolutionApiStatus": "offline"**

**Solução:**
1. Verificar se Evolution API está rodando
2. Railway > Evolution API > Deployment > Ver logs
3. Se erro, redeploy

---

### **Problema: "Unauthorized"**

**Solução:**
1. Verificar `EVOLUTION_API_KEY` no Backend
2. Deve ser igual a `AUTHENTICATION_API_KEY` na Evolution API
3. Redeploy Backend

---

### **Problema: QR Code não aparece**

**Solução:**
1. Aguardar 10 segundos
2. Tentar novamente: `curl .../qr/meu_tenant`
3. Se não funcionar: `curl -X POST .../reset/meu_tenant`
4. Aguardar 5s e gerar novo QR

---

## 🎉 PRONTO!

**Você agora tem:**

✅ Evolution API rodando  
✅ Backend usando Evolution API  
✅ WhatsApp conectado SEM erro 405  
✅ Sistema 90% mais estável  
✅ Dashboard administrativo grátis  
✅ Multi-tenant nativo  

---

## 📚 Documentação Completa

- **Guia Detalhado:** `DEPLOY_EVOLUTION_RAILWAY.md`
- **Comparação Técnica:** `COMPARACAO_EVOLUTION_VS_BAILEYS.md`
- **Evolution API Docs:** https://doc.evolution-api.com

---

## 💰 Custo Final

| Item | Valor/mês |
|------|-----------|
| Railway Backend | $5 |
| Railway Evolution API | $5 |
| **TOTAL** | **$10** |

**Sem proxy necessário!** Evolution API tem anti-bloqueio nativo. 🎉

---

## 📞 Próximos Passos

Depois que tudo funcionar:

1. ✅ Integrar com frontend (usar mesmos endpoints)
2. ✅ Configurar webhooks (se precisar)
3. ✅ Testar envio em massa
4. ✅ Explorar dashboard Evolution API

---

**🚀 Boa sorte! Em 10 minutos seu WhatsApp estará funcionando sem bloqueios! 💪**
