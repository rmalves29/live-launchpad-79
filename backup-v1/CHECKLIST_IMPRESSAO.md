# ✅ CHECKLIST PARA IMPRIMIR - Resolver Erro 405 Railway

**Data:** ________________  
**Início:** ____:____  
**Fim previsto:** ____:____ (+45 min)

---

## 🎯 VISÃO GERAL

**Tempo total:** 45 minutos  
**Custo:** $3/mês (proxy Webshare)  
**Resultado:** WhatsApp funcionando sem erro 405

---

## ✅ PRIORIDADE 1: CÓDIGO CORRIGIDO (2 min)

**Status:** ✅ CONCLUÍDO AUTOMATICAMENTE

- [x] Package.json corrigido
- [x] Commit realizado (2b4fc2e)
- [x] Push para GitHub
- [x] Railway detectará automaticamente

**Próximo:** PRIORIDADE 2

---

## 🔄 PRIORIDADE 2: CONFIGURAR PROXY (10 min)

**Tempo:** ____:____ até ____:____

### **Etapa 2.1: Criar Conta Webshare (5 min)**

- [ ] Acessar: https://www.webshare.io/register
- [ ] Preencher email: ______________________________
- [ ] Criar senha: ___________________________________
- [ ] Clicar em "Sign Up"
- [ ] Confirmar email (verificar caixa de entrada)
- [ ] Fazer login

**Tempo:** ____:____

---

### **Etapa 2.2: Obter Credenciais (2 min)**

- [ ] Clicar em "Proxy" no menu
- [ ] Copiar credenciais:

```
Host:     proxy.webshare.io
Port:     80
Username: _____________________________
Password: _____________________________
```

**Tempo:** ____:____

---

### **Etapa 2.3: Configurar Railway (3 min)**

- [ ] Acessar: https://railway.app/dashboard
- [ ] Abrir projeto Backend
- [ ] Clicar em "Variables"

**Adicionar variáveis (uma por uma):**

#### **Proxy (OBRIGATÓRIO):**

- [ ] `PROXY_HOST` = `proxy.webshare.io`
- [ ] `PROXY_PORT` = `80`
- [ ] `PROXY_USER` = [username copiado]
- [ ] `PROXY_PASSWORD` = [password copiado]

#### **Básicas (verificar se existem):**

- [ ] `PORT` = `8080`
- [ ] `VITE_SUPABASE_URL` = ______________________________
- [ ] `SUPABASE_SERVICE_KEY` = ______________________________

#### **Proteção (opcionais):**

- [ ] `WHATSAPP_MAX_RETRIES` = `2`
- [ ] `WHATSAPP_RETRY_DELAY` = `300000`
- [ ] `WHATSAPP_TIMEOUT` = `120000`
- [ ] `WHATSAPP_COOLDOWN_ON_405` = `1800000`

**Tempo:** ____:____

---

### **Etapa 2.4: Aguardar Restart (2 min)**

- [ ] Variables updated (mensagem apareceu)
- [ ] Status mudou para "Deploying"
- [ ] Status mudou para "Active" (bolinha verde)

**Tempo:** ____:____

---

### **Etapa 2.5: Testar Proxy (1 min)**

```bash
curl https://api.orderzaps.com/
```

**Verificar resposta:**

- [ ] Status 200 OK
- [ ] `"proxy": true` ✅
- [ ] `"proxyConfig": "proxy.webshare.io:80"`

**Se proxy = false:**
- [ ] Voltar e verificar variáveis
- [ ] Redeploy manual

**Tempo:** ____:____

**Próximo:** PRIORIDADE 3

---

## ⏰ PRIORIDADE 3: AGUARDAR COOLDOWN (30 min)

**Tempo:** ____:____ até ____:____

### **Etapa 3.1: Parar Servidor (1 min)**

- [ ] Railway > Deployments
- [ ] Clicar 3 pontinhos
- [ ] Clicar "Stop"
- [ ] Status "Stopped"

**Horário parada:** ____:____

---

### **Etapa 3.2: Marcar Tempo (1 min)**

**Aguardar:** 30 minutos

```
Parou em:    ____:____
Religar em:  ____:____ (+30 min)
```

- [ ] Timer ativado no celular (30 min)

---

### **Etapa 3.3: Usar o Tempo (28 min)**

**Enquanto aguarda:**

- [ ] Tomar café ☕
- [ ] Verificar checklist
- [ ] Ler `AGUARDAR_COOLDOWN.md`
- [ ] Preparar próximos passos

**Não fazer:**
- ❌ Tentar conectar WhatsApp
- ❌ Fazer redeploy
- ❌ Ligar servidor

---

### **Etapa 3.4: Após 30 Minutos**

**Horário:** ____:____

#### **A. Redeploy (2 min)**

- [ ] Railway > Deployments
- [ ] Clicar 3 pontinhos
- [ ] Clicar "Redeploy"
- [ ] Status "Deploying"
- [ ] Status "Active"

**Tempo:** ____:____

---

#### **B. Monitorar Logs (2 min)**

- [ ] Clicar deployment ativo
- [ ] Aba "Logs"

**Procurar por:**

✅ **Sinais BONS:**
- [ ] `[PROXY] Proxy configurado`
- [ ] `[✓] Proxy funcionando! IP externo: XXX`
- [ ] `🚂 Servidor WhatsApp Railway rodando`

❌ **Sinais RUINS:**
- [ ] `[⚠] Proxy NÃO configurado` → Voltar Prioridade 2
- [ ] `[✗] ERRO 405 DETECTADO` → Aguardar mais 30 min

**Tempo:** ____:____

---

#### **C. Testar Endpoint (1 min)**

```bash
curl https://api.orderzaps.com/
```

**Verificar:**
- [ ] Status 200
- [ ] `"proxy": true`
- [ ] `"uptime"` maior que 0

**Tempo:** ____:____

---

#### **D. Gerar QR Code (2 min)**

**Aguardar 2 minutos após servidor iniciar!**

```bash
curl https://api.orderzaps.com/qr/SEU_TENANT_ID
```

Substituir `SEU_TENANT_ID` por: ______________________

**Verificar:**
- [ ] Status 200
- [ ] Campo `"qr"` presente
- [ ] Base64 retornado

**Tempo:** ____:____

---

#### **E. Decodificar QR (2 min)**

**Opção 1 - Online:**
- [ ] Copiar base64 (tudo depois de `data:image/png;base64,`)
- [ ] Abrir: https://base64.guru/converter/decode/image
- [ ] Colar código
- [ ] Clicar "Decode Image"
- [ ] QR Code apareceu

**Opção 2 - Terminal:**
```bash
echo "base64..." | base64 -d > qrcode.png
```

**Tempo:** ____:____

---

#### **F. Conectar WhatsApp (1 min)**

- [ ] Abrir WhatsApp no celular
- [ ] Três pontinhos > Aparelhos conectados
- [ ] Conectar um aparelho
- [ ] Escanear QR Code
- [ ] Aguardar conexão

**Tempo:** ____:____

---

#### **G. Verificar Conexão (1 min)**

**Nos logs Railway:**

- [ ] `[✓] WhatsApp conectado para tenant: abc123`
- [ ] Sem erro 405
- [ ] Status "ready"

**Ou via API:**
```bash
curl https://api.orderzaps.com/status/SEU_TENANT_ID
```

**Verificar:**
- [ ] `"connected": true`
- [ ] `"hasQR": false` (QR consumido)

**Tempo:** ____:____

---

## 🎉 SUCESSO!

**Horário final:** ____:____

**Tempo total:** _______ minutos

### **Checklist Final:**

- [ ] Código corrigido (commit 2b4fc2e)
- [ ] Proxy configurado no Railway
- [ ] Cooldown respeitado (30 min)
- [ ] Servidor rodando sem erro 405
- [ ] QR Code gerado
- [ ] WhatsApp conectado
- [ ] Logs mostram "WhatsApp conectado"

---

## 🚨 SE ALGO DEU ERRADO

### **Erro 405 apareceu novamente:**

- [ ] Verificar se proxy = true
- [ ] Parar servidor
- [ ] Aguardar mais 30 minutos
- [ ] Testar credenciais proxy:
  ```bash
  curl --socks5 user:pass@proxy.webshare.io:80 https://api.ipify.org
  ```

---

### **Proxy = false:**

- [ ] Railway > Variables
- [ ] Verificar 4 variáveis de proxy
- [ ] Copiar credenciais novamente do Webshare
- [ ] Redeploy

---

### **QR Code não aparece:**

- [ ] Aguardar 2 minutos após servidor iniciar
- [ ] Forçar novo QR:
  ```bash
  curl -X POST https://api.orderzaps.com/generate-qr/TENANT_ID
  ```
- [ ] Aguardar 60 segundos
- [ ] Tentar buscar novamente

---

## 📚 DOCUMENTAÇÃO

**Guias principais:**
- `SEQUENCIA_COMPLETA_AGORA.md` - Índice master
- `CONFIGURAR_PROXY_AGORA.md` - Proxy detalhado
- `AGUARDAR_COOLDOWN.md` - Cooldown detalhado
- `README_RAILWAY.md` - Referência geral

**Para consulta:**
- `RAILWAY_WHATSAPP_SOLUCAO.md` - Soluções técnicas
- `DEPLOY_RAILWAY_GUIA_RAPIDO.md` - Deploy rápido
- `RESUMO_SOLUCAO_COMPLETA.md` - Visão geral

---

## 💰 CUSTOS

| Item | Valor |
|------|-------|
| Railway Hobby | $5/mês |
| Webshare Proxy | $3/mês |
| **Total** | **$8/mês** |

**Primeira cobrança:** após 30 dias de trial Webshare

---

## 📞 SUPORTE

**Logs:** Railway Dashboard > Deployment > Logs

**Teste:** `curl https://api.orderzaps.com/`

**GitHub:** https://github.com/rmalves29/orderzap

**Commits:** 2b4fc2e, 3ca8c67

---

**🎯 Boa sorte! Siga o checklist e vai dar certo! 💪**

---

_Imprima esta página e marque cada item conforme completa._
