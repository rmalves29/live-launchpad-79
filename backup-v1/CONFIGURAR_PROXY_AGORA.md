# 🔐 Configurar Proxy AGORA - Passo a Passo

## ⏱️ Tempo estimado: 10 minutos

---

## 🎯 Passo 2.1: Criar Conta no Webshare (5 min)

### **1. Acessar site:**
https://www.webshare.io/register

### **2. Preencher dados:**
- Email: seu_email@exemplo.com
- Password: (crie uma senha forte)
- Clique em **Sign Up**

### **3. Confirmar email:**
- Verifique sua caixa de entrada
- Clique no link de confirmação

### **4. Fazer login:**
https://www.webshare.io/login

---

## 🔑 Passo 2.2: Obter Credenciais do Proxy (2 min)

### **1. No dashboard Webshare:**
- Clique em **"Proxy"** no menu lateral
- Ou acesse: https://proxy2.webshare.io/proxy/list

### **2. Você verá uma lista de proxies**

Procure uma linha parecida com esta:

```
proxy.webshare.io:80
Username: seu_username
Password: sua_senha_aqui
```

### **3. ANOTAR ESSAS 4 INFORMAÇÕES:**

```
Host: proxy.webshare.io
Port: 80
Username: [COPIAR DAQUI]
Password: [COPIAR DAQUI]
```

**💡 Dica:** Clique no ícone de "Copy" ao lado de cada campo.

---

## ⚙️ Passo 2.3: Configurar no Railway (3 min)

### **1. Acessar Railway:**
https://railway.app/dashboard

### **2. Abrir seu projeto:**
- Clique no projeto **Backend** (ou orderzap-backend)

### **3. Ir em Variables:**
- Clique em **"Variables"** (ícone de cadeado 🔐)

### **4. Adicionar variáveis uma por uma:**

Clique em **"New Variable"** e adicione:

#### **Variável 1:**
```
Name: PROXY_HOST
Value: proxy.webshare.io
```
Clique em **Add**

#### **Variável 2:**
```
Name: PROXY_PORT
Value: 80
```
Clique em **Add**

#### **Variável 3:**
```
Name: PROXY_USER
Value: [SEU USERNAME DO WEBSHARE]
```
Clique em **Add**

#### **Variável 4:**
```
Name: PROXY_PASSWORD
Value: [SUA SENHA DO WEBSHARE]
```
Clique em **Add**

### **5. Verificar se já tem estas variáveis:**

Se ainda não tiver, adicione também:

#### **Variável 5:**
```
Name: PORT
Value: 8080
```

#### **Variável 6:**
```
Name: VITE_SUPABASE_URL
Value: [SUA URL DO SUPABASE]
```

#### **Variável 7:**
```
Name: SUPABASE_SERVICE_KEY
Value: [SUA SERVICE KEY DO SUPABASE]
```

#### **Variáveis de Proteção (Opcionais mas Recomendadas):**

```
Name: WHATSAPP_MAX_RETRIES
Value: 2

Name: WHATSAPP_RETRY_DELAY
Value: 300000

Name: WHATSAPP_TIMEOUT
Value: 120000

Name: WHATSAPP_COOLDOWN_ON_405
Value: 1800000
```

---

## ✅ Passo 2.4: Salvar e Verificar

### **1. Após adicionar todas as variáveis:**
- Railway vai mostrar uma mensagem: "Variables updated"
- O serviço vai **reiniciar automaticamente**

### **2. Aguarde o restart:**
- Isso leva cerca de 1-2 minutos
- Você verá o status mudando para "Deploying"
- Depois para "Active"

---

## 🧪 Passo 2.5: Testar Proxy

### **1. Aguardar deploy terminar**
- Status deve estar **"Active"** com bolinha verde

### **2. Abrir logs:**
- No Railway, clique no deployment ativo
- Vá na aba **"Logs"**

### **3. Procurar por estas linhas:**

✅ **Sinais de SUCESSO:**
```
[PROXY] Proxy configurado: proxy.webshare.io:80
[✓] Proxy funcionando! IP externo: XXX.XXX.XXX.XXX
🚂 Servidor WhatsApp Railway rodando na porta 8080
```

❌ **Sinais de PROBLEMA:**
```
[⚠] Proxy NÃO configurado
[✗] Erro ao testar proxy
```

### **4. Testar endpoint:**

```bash
curl https://api.orderzaps.com/
```

**Resposta esperada:**
```json
{
  "server": "WhatsApp Multi-Tenant Railway Edition",
  "proxy": true,  ← DEVE SER TRUE!
  "proxyConfig": "proxy.webshare.io:80"
}
```

Se retornar `"proxy": true`, **PARABÉNS!** O proxy está funcionando! 🎉

---

## 🚨 Troubleshooting

### ❌ Se proxy retornar false:

**Causa:** Variáveis não configuradas ou com erro

**Solução:**
1. Volte em Railway > Variables
2. Verifique se as 4 variáveis de proxy estão corretas:
   - PROXY_HOST
   - PROXY_PORT
   - PROXY_USER
   - PROXY_PASSWORD
3. Verifique se não tem espaços extras
4. Redeploy: Settings > Deploy > Restart

---

### ❌ Se der erro "Cannot connect to proxy":

**Causa:** Credenciais inválidas ou proxy offline

**Solução:**
1. Volte no Webshare: https://proxy2.webshare.io/proxy/list
2. Verifique se o proxy está **Active** (bolinha verde)
3. Copie as credenciais novamente
4. Atualize no Railway
5. Aguarde restart

---

### ❌ Se Webshare pedir cartão de crédito:

**Alternativa 1 - Bright Data (Trial Grátis):**
1. Acesse: https://brightdata.com
2. Crie conta
3. Ative trial grátis ($500 em créditos)
4. Configure Residential Proxy
5. Use credenciais no Railway:
   ```
   PROXY_HOST=zproxy.lum-superproxy.io
   PROXY_PORT=22225
   PROXY_USER=brd-customer-XXX-zone-YYY
   PROXY_PASSWORD=sua_senha
   ```

**Alternativa 2 - ProxyMesh:**
1. Acesse: https://proxymesh.com
2. Plano básico $10/mês
3. Configure no Railway

---

## 📋 Checklist Final

Antes de prosseguir, verifique:

- [ ] Conta Webshare criada e confirmada
- [ ] Credenciais do proxy anotadas (Host, Port, User, Password)
- [ ] 4 variáveis de proxy adicionadas no Railway
- [ ] Variáveis do Supabase configuradas (URL, Service Key)
- [ ] Deploy terminado (status Active)
- [ ] Logs mostram "Proxy configurado"
- [ ] Endpoint `/` retorna `"proxy": true`

---

## ⏭️ Próximo Passo

Após configurar o proxy, vá para **PRIORIDADE 3** (aguardar cooldown).

---

## 💰 Custo

- **Webshare:** $2.99/mês após trial grátis
- **Bright Data:** Grátis por 30 dias ($500 créditos)
- **ProxyMesh:** $10/mês

**Vale a pena?** SIM! Resolve definitivamente o erro 405.

---

## 🆘 Precisa de Ajuda?

Se tiver qualquer dúvida:
1. Veja os logs no Railway
2. Teste: `curl https://api.orderzaps.com/`
3. Consulte: `RAILWAY_WHATSAPP_SOLUCAO.md`

---

**✅ Assim que o proxy estiver configurado, prossiga para PRIORIDADE 3!**
