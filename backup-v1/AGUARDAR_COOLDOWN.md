# ⏰ PRIORIDADE 3: Aguardar Cooldown (20-30 minutos)

## 🎯 Por que preciso aguardar?

O WhatsApp bloqueou o IP do Railway devido a múltiplas tentativas de conexão.

**Erro nos logs:**
```
Erro 405: WhatsApp bloqueou o IP temporariamente
```

**Solução:** Aguardar o tempo de "castigo" do WhatsApp antes de tentar reconectar.

---

## ⏱️ Quanto tempo aguardar?

### **Tempo Mínimo:**
- ✅ **20 minutos** - Recomendado
- ⭐ **30 minutos** - Mais seguro
- 🏆 **60 minutos** - Garantido

**Regra de ouro:** Quanto mais tempo, melhor.

---

## 🛑 O Que Fazer Durante o Cooldown

### **1. PARAR todos os deployments ativos**

#### **No Railway:**

1. Acesse: https://railway.app/dashboard
2. Clique no seu projeto
3. Vá em **Deployments**
4. Clique nos **3 pontinhos** do deployment ativo
5. Clique em **"Stop"** ou **"Remove"**

**Por que parar?**
- Evita que o servidor continue tentando reconectar
- Evita aumentar o tempo de bloqueio
- Economiza créditos do Railway

---

### **2. Verificar se tudo está configurado**

Use este tempo para garantir que está tudo pronto:

#### ✅ **Start Command correto?**
- Railway > Settings > Deploy
- Start Command deve ser: `node backend/server-whatsapp-railway.js`
- OU: `npm start` (agora que corrigimos o package.json)

#### ✅ **Variáveis de ambiente configuradas?**
- Railway > Variables
- Mínimo 7 variáveis:
  1. `PORT=8080`
  2. `VITE_SUPABASE_URL=...`
  3. `SUPABASE_SERVICE_KEY=...`
  4. `PROXY_HOST=proxy.webshare.io`
  5. `PROXY_PORT=80`
  6. `PROXY_USER=seu_usuario`
  7. `PROXY_PASSWORD=sua_senha`

#### ✅ **Proxy Webshare configurado?**
- Conta criada
- Credenciais obtidas
- Variáveis no Railway

#### ✅ **Código atualizado?**
- Último commit: `2b4fc2e`
- Railway deve detectar automaticamente no próximo deploy

---

### **3. Marcar o horário**

**Horário que parou o servidor:**
```
____:____ (anote aqui)
```

**Adicione 30 minutos:**
```
____:____ (horário para religar)
```

**💡 Dica:** Use um timer no celular!

---

## 📋 Checklist Durante o Cooldown

Use este tempo para verificar tudo:

- [ ] Servidor parado no Railway
- [ ] Start Command: `node backend/server-whatsapp-railway.js`
- [ ] 7+ variáveis configuradas no Railway
- [ ] Proxy Webshare configurado (Host, Port, User, Password)
- [ ] Conta Supabase ativa (URL e Service Key corretos)
- [ ] Timer de 30 minutos ativado
- [ ] Café/água preparados ☕

---

## ⏰ Após o Cooldown (30 minutos)

### **Passo 1: Fazer novo deploy**

#### **Opção A - Redeploy (Recomendado):**

1. Railway > Deployments
2. Clique nos **3 pontinhos** do último deploy
3. Clique em **"Redeploy"**

#### **Opção B - Force push:**

```bash
cd /home/user/webapp
git commit --allow-empty -m "feat: Redeploy após cooldown"
git push origin main
```

Railway detectará e fará deploy automático.

---

### **Passo 2: Monitorar logs em tempo real**

1. Railway > Clique no deployment ativo
2. Vá na aba **"Logs"**
3. Deixe aberto e acompanhe

**O que procurar:**

✅ **Sinais BONS:**
```
[PROXY] Proxy configurado: proxy.webshare.io:80
[✓] Proxy funcionando! IP externo: XXX.XXX.XXX.XXX
🚂 Servidor WhatsApp Railway rodando na porta 8080
[INFO] Criando cliente WhatsApp para tenant: abc123
[QR] QR Code gerado para tenant: abc123
```

❌ **Sinais RUINS:**
```
[⚠] Proxy NÃO configurado
[✗] ERRO 405 DETECTADO - IP BLOQUEADO!
npm error command failed
```

---

### **Passo 3: Testar endpoint**

Após 2 minutos do deploy:

```bash
curl https://api.orderzaps.com/
```

**Resposta esperada:**
```json
{
  "server": "WhatsApp Multi-Tenant Railway Edition",
  "uptime": 123,
  "proxy": true,
  "proxyConfig": "proxy.webshare.io:80",
  "clients": 0
}
```

**Verificações:**
- ✅ `"proxy": true` → Proxy funcionando
- ✅ `"uptime"` → Servidor rodando
- ✅ Status 200 → Tudo OK

---

### **Passo 4: Gerar QR Code**

**IMPORTANTE:** Aguarde mais 2 minutos após servidor iniciar!

```bash
curl https://api.orderzaps.com/qr/SEU_TENANT_ID
```

Substitua `SEU_TENANT_ID` pelo ID real (ex: `abc123`, `tenant1`, etc)

**Resposta esperada:**
```json
{
  "qr": "data:image/png;base64,iVBORw0KGg...",
  "tenantId": "abc123"
}
```

---

### **Passo 5: Decodificar QR Code**

#### **Opção A - Online:**
1. Copie o valor do campo `qr` (TUDO depois de `data:image/png;base64,`)
2. Acesse: https://base64.guru/converter/decode/image
3. Cole o código
4. Clique em **"Decode Image"**
5. Escaneie com WhatsApp

#### **Opção B - Terminal:**
```bash
# Salvar QR em arquivo
echo "iVBORw0KGgoAAAANS..." | base64 -d > qrcode.png

# Abrir arquivo
open qrcode.png  # Mac
xdg-open qrcode.png  # Linux
start qrcode.png  # Windows
```

---

## 🚨 Se o Erro 405 Aparecer NOVAMENTE

### **Cenário 1: Proxy não está funcionando**

**Sinais:**
- Logs mostram `"proxy": false`
- Erro 405 aparece imediatamente

**Solução:**
1. Verificar credenciais do proxy no Railway
2. Testar proxy manualmente:
   ```bash
   curl --socks5 usuario:senha@proxy.webshare.io:80 https://api.ipify.org
   ```
3. Se der erro, credenciais estão erradas
4. Corrigir no Railway e redeploy

---

### **Cenário 2: Aguardou pouco tempo**

**Sinais:**
- Erro 405 aparece após 1-2 minutos
- Logs mostram "Aguardando cooldown"

**Solução:**
1. Parar servidor IMEDIATAMENTE
2. Aguardar mais **30 minutos**
3. Tentar novamente

---

### **Cenário 3: IP ainda bloqueado (raro)**

**Sinais:**
- Aguardou 60 minutos
- Proxy configurado corretamente
- Erro 405 persiste

**Soluções:**

#### **A. Mudar região do Railway:**
1. Railway > Settings > Deploy
2. Mudar **Region** para:
   - `us-west1` (Oregon)
   - `eu-west1` (Bélgica)
   - `ap-southeast1` (Singapura)
3. Aguardar 20 minutos
4. Tentar conectar

#### **B. Usar VPN no proxy:**
- Alguns proxies permitem rotação de IP
- Webshare tem opção "Rotating Proxy"
- Configure `PROXY_HOST=proxy.webshare.io` (porta 80 já é rotativo)

#### **C. Aguardar 24 horas:**
- Em casos extremos, WhatsApp bloqueia por mais tempo
- Aguarde 24 horas completas
- Tente reconectar

---

## 📊 Timeline Recomendada

```
00:00 - Parar servidor Railway
00:01 - Verificar configurações (Start Command, Variables)
00:02 - Configurar proxy se ainda não fez
00:05 - Marcar timer de 30 minutos
00:30 - Fazer redeploy
00:32 - Verificar logs (proxy configurado?)
00:34 - Testar endpoint /
00:36 - Gerar QR Code
00:37 - Escanear QR Code com WhatsApp
00:38 - ✅ WhatsApp CONECTADO!
```

**Tempo total:** ~38 minutos (incluindo cooldown)

---

## 💡 Dicas Para Evitar Futuro Bloqueio

### **1. Nunca faça múltiplos redeploys seguidos**
- Se der erro, aguarde 10 minutos antes de tentar de novo
- Use `/status/:tenantId` para verificar antes de gerar QR

### **2. Use sempre o proxy**
- Não desabilite as variáveis de proxy
- Se proxy cair, PARE o servidor até corrigir

### **3. Configure cooldown alto**
- `WHATSAPP_COOLDOWN_ON_405=1800000` (30 min)
- Se ainda der problema, aumente para 3600000 (60 min)

### **4. Monitore os logs**
- Railway > Logs
- Se ver "Aguardando cooldown", AGUARDE
- Não force reconexão

---

## ✅ Checklist Pós-Cooldown

Após aguardar e fazer novo deploy:

- [ ] Servidor rodando (status Active)
- [ ] Logs mostram "Proxy configurado"
- [ ] Endpoint `/` retorna status 200
- [ ] `"proxy": true` na resposta
- [ ] Consegue gerar QR Code
- [ ] QR Code decodificado
- [ ] WhatsApp escaneou QR
- [ ] WhatsApp conectado (ver logs)
- [ ] Sem erro 405 nos logs

---

## 🎯 Resultado Esperado

Com tudo configurado e após aguardar cooldown:

✅ **Proxy funcionando** (IP diferente do Railway)  
✅ **Sem erro 405** (IP não bloqueado)  
✅ **QR Code gerado** automaticamente  
✅ **WhatsApp conectado** e estável  
✅ **Reconexão automática** se cair  

---

## 📞 Próximos Passos

Depois que WhatsApp conectar:

1. **Testar envio de mensagem:**
   ```bash
   curl -X POST https://api.orderzaps.com/send \
     -H "Content-Type: application/json" \
     -d '{"tenantId":"abc123","to":"5511999999999","message":"Teste"}'
   ```

2. **Monitorar por 1 hora:**
   - Ver se mantém conectado
   - Ver se reconecta automaticamente se cair

3. **Integrar com frontend:**
   - Usar componentes criados
   - Testar fluxo completo

---

**⏰ Configure o timer e aguarde! O tempo vai resolver o bloqueio. 🎯**

**Enquanto isso, relaxe! ☕**
