# 🚀 Guia Passo-a-Passo - Resolver WhatsApp Offline

## ❌ Problema: Integração do WhatsApp continua offline

Siga **TODOS** os passos na ordem. Não pule nenhum!

---

## 📋 Passo 1: Parar TUDO e Limpar

### Windows:

```batch
# 1. Matar todos os processos Node.js
taskkill /F /IM node.exe

# 2. Esperar 5 segundos
timeout /t 5

# 3. Limpar sessões antigas
rmdir /s /q .wwebjs_auth_clean

# 4. Limpar cache do NPM
npm cache clean --force
```

### Linux/Mac:

```bash
# 1. Matar todos os processos Node.js
killall node

# 2. Esperar 5 segundos
sleep 5

# 3. Limpar sessões antigas
rm -rf .wwebjs_auth_clean

# 4. Limpar cache do NPM
npm cache clean --force
```

✅ **Checkpoint 1:** Terminal sem processos Node rodando

---

## 📋 Passo 2: Verificar Chromium

```batch
# Windows
verificar-chromium.bat
```

**O que você deve ver:**

```
✓ Chromium encontrado em:
   C:\Users\...\node_modules\puppeteer\.local-chromium\win64-XXXXXX\chrome-win\chrome.exe
✓ Arquivo existe
```

### ❌ Se NÃO encontrou o Chromium:

```batch
# Windows - Execute isso:
instalar-chromium.bat

# Aguarde até ver:
# ✓ Chromium instalado em: C:\...
```

✅ **Checkpoint 2:** Chromium instalado e encontrado

---

## 📋 Passo 3: Teste Isolado

Vamos testar APENAS a conexão WhatsApp, sem o servidor completo:

```batch
node check-whatsapp.js
```

### ✅ Cenário 1: QR Code apareceu

```
✅ QR CODE GERADO em Xs

[QR CODE ASCII ART AQUI]

⏰ Tempo restante: Xs segundos
```

**AÇÃO:**
1. Abra WhatsApp no celular
2. WhatsApp > Aparelhos conectados
3. Conectar um aparelho
4. **ESCANEIE O QR CODE RÁPIDO** (menos de 60s)

**Você verá:**
```
✅ AUTENTICADO em Xs
🎉 SUCESSO! WhatsApp conectado em Xs
```

➡️ **Se viu isso: PULE para o Passo 4**

---

### ❌ Cenário 2: Travou em "Inicializando Puppeteer..."

```
🚀 Iniciando teste de conexão...
📡 Conectando ao WhatsApp Web...
⚙️ [14:30:00] Passo 1/3: Inicializando Puppeteer...

[TRAVADO AQUI POR MAIS DE 30 SEGUNDOS]
```

**CAUSA:** Puppeteer não consegue inicializar o Chrome

**SOLUÇÃO A - Reinstalar Puppeteer Completo:**

```batch
# Parar o script (Ctrl+C)

# Executar reinstalação COMPLETA:
reinstalar-completo.bat

# Aguardar finalizar, então:
node check-whatsapp.js
```

**SOLUÇÃO B - Usar Chrome do Sistema:**

Se a SOLUÇÃO A não funcionar, vamos usar o Chrome já instalado:

```batch
# 1. Instalar puppeteer-core
npm uninstall puppeteer
npm install puppeteer-core

# 2. Verificar onde está o Chrome no seu PC
# Windows - Chrome geralmente está em:
C:\Program Files\Google\Chrome\Application\chrome.exe

# OU
C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
```

Agora edite `server-multitenant-clean.js` e `check-whatsapp.js`:

**No `server-multitenant-clean.js` (linha ~104):**

```javascript
puppeteer: {
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // ← SEU CAMINHO AQUI
  headless: 'new',
  args: [
    '--no-sandbox',
    // ... resto das flags
  ]
},
```

**No `check-whatsapp.js` (linha ~45):**

```javascript
const puppeteerConfig = {
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // ← SEU CAMINHO AQUI
  headless: 'new',
  args: [
    '--no-sandbox',
    // ... resto das flags
  ],
  timeout: TIMEOUT
};
```

Salve e teste novamente:
```batch
node check-whatsapp.js
```

---

### ❌ Cenário 3: Erro "Could not find expected browser"

```
❌ ERRO FATAL após Xs
Erro: Could not find expected browser (chrome) locally.
```

**SOLUÇÃO:**

```batch
# 1. Desinstalar TUDO
rmdir /s /q node_modules
del package-lock.json

# 2. Garantir que o Chromium SERÁ baixado
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

# 3. Reinstalar TUDO
npm install

# 4. Verificar se baixou
node -e "const p = require('puppeteer'); console.log(p.executablePath())"

# Deve mostrar o caminho do chrome.exe
```

---

### ❌ Cenário 4: Erro de Firewall/Antivírus

```
❌ ERRO: net::ERR_CONNECTION_REFUSED
ou
❌ ERRO: Timeout ao conectar
```

**SOLUÇÃO:**

1. **Desative o Windows Defender temporariamente:**
   - Configurações > Atualização e Segurança
   - Segurança do Windows
   - Proteção contra vírus e ameaças
   - Gerenciar configurações
   - **Desative "Proteção em tempo real"**

2. **Desconecte VPN** (se estiver usando)

3. **Teste conectividade:**
   ```batch
   testar-conectividade.bat
   ```

4. **Tente novamente:**
   ```batch
   node check-whatsapp.js
   ```

5. **IMPORTANTE:** Reative o Windows Defender depois!

---

## 📋 Passo 4: Iniciar Servidor Completo

Se o `check-whatsapp.js` funcionou, agora inicie o servidor:

```batch
# Windows
start-clean.bat
```

**Você DEVE ver:**

```
🚀 WhatsApp Multi-Tenant Server - Clean Architecture v4.0
======================================================================

🔍 Carregando tenants ativos...

✅ 1 tenant(s) ativo(s) no banco

🎯 Inicializando: MANIA DE MULHER

======================================================================
🔧 Inicializando: MANIA DE MULHER
🆔 ID: 08f2b1b9-3988-489e-8186-c60f0c0b0622
📂 Auth: C:\...\\.wwebjs_auth_clean\tenant_08f2b1b9-...
======================================================================

📱 Primeira inicialização para MANIA DE MULHER
📸 QR Code será exibido em breve...

⚙️ MANIA DE MULHER: Configurando Puppeteer...

🚀 MANIA DE MULHER: INICIANDO WHATSAPP WEB
📡 Conectando ao servidor do WhatsApp...
⏰ Timeout máximo: 90 segundos

⚙️ [14:40:00] Passo 1/3: Inicializando Puppeteer...
```

### Aguarde até ver:

```
======================================================================
📱 QR CODE GERADO - MANIA DE MULHER
======================================================================

🔥 SUCESSO! Abra o WhatsApp no celular:
   1. WhatsApp > Aparelhos conectados
   2. Conectar um aparelho
   3. Escaneie o QR Code abaixo:

[QR CODE GRANDE AQUI]

======================================================================
⏰ Tempo: 60 segundos para escanear
💡 QR pequeno? Dê zoom no terminal (Ctrl + Scroll)
======================================================================
```

**ESCANEIE O QR CODE COM SEU WHATSAPP**

### Depois de escanear, você verá:

```
🔐 MANIA DE MULHER: Autenticado

✅✅✅ MANIA DE MULHER: CONECTADO ✅✅✅

✅ MANIA DE MULHER: INICIALIZAÇÃO COMPLETA em Xs!

======================================================================
✅ Servidor rodando!
📊 Status: http://localhost:3333/status
🏥 Health: http://localhost:3333/health
======================================================================
```

✅ **SUCESSO! WhatsApp está online!**

---

## 📋 Passo 5: Verificar Status

Abra outra janela do CMD/Terminal e execute:

```batch
curl http://localhost:3333/status
```

**Resposta esperada:**

```json
{
  "success": true,
  "tenants": {
    "08f2b1b9-3988-489e-8186-c60f0c0b0622": {
      "status": "online",
      "hasClient": true
    }
  },
  "totalTenants": 1
}
```

Se `"status": "online"` ➡️ **TUDO CERTO!** 🎉

---

## ❌ Problemas Comuns e Soluções

### 1. QR Code não aparece (trava antes)

**Causa:** Puppeteer/Chromium com problema

**Solução:**
```batch
# Opção 1: Reinstalar completo
reinstalar-completo.bat

# Opção 2: Usar Chrome do sistema (veja Cenário 2)
```

---

### 2. QR Code aparece mas expira

**Causa:** Você demorou mais de 60 segundos para escanear

**Solução:**
1. Pare o servidor (Ctrl+C)
2. Delete a sessão: `rmdir /s /q .wwebjs_auth_clean`
3. Reinicie: `start-clean.bat`
4. **Esteja PRONTO com o WhatsApp aberto antes do QR aparecer**

---

### 3. QR Code escaneado mas não conecta

**Causa:** Problema de rede ou sessão corrompida

**Solução:**
```batch
# 1. Parar servidor (Ctrl+C)

# 2. Limpar sessão
rmdir /s /q .wwebjs_auth_clean

# 3. Teste conectividade
testar-conectividade.bat

# 4. Se conectividade OK, reinicie
start-clean.bat
```

---

### 4. Conecta mas desconecta logo em seguida

**Causa:** WhatsApp Web instável ou múltiplas conexões

**Solução:**
1. No WhatsApp do celular:
   - WhatsApp > Aparelhos conectados
   - **Desconecte TODOS os aparelhos**
   - Aguarde 30 segundos
2. Pare o servidor (Ctrl+C)
3. Limpe: `rmdir /s /q .wwebjs_auth_clean`
4. Reinicie: `start-clean.bat`
5. Escaneie o QR Code novamente

---

### 5. Erro "EBUSY: resource busy or locked"

**Causa:** Múltiplas instâncias do servidor rodando

**Solução:**
```batch
# Windows
parar-tudo.bat

# Aguarde 5 segundos, então
start-clean.bat
```

---

## 🎯 Checklist Final

Antes de desistir, verifique se fez TUDO:

- [ ] Matou todos os processos Node.js
- [ ] Limpou `.wwebjs_auth_clean`
- [ ] Limpou cache NPM
- [ ] Verificou se Chromium está instalado
- [ ] Testou com `check-whatsapp.js` e funcionou
- [ ] Desativou antivírus temporariamente
- [ ] Desconectou VPN
- [ ] Testou conectividade com `testar-conectividade.bat`
- [ ] Reiniciou o computador
- [ ] Está rodando como Administrador

---

## 🆘 Última Tentativa - Modo Debug Visual

Se **NADA** funcionou, rode em modo visual para ver o Chrome:

1. Edite `server-multitenant-clean.js` linha ~104:

```javascript
puppeteer: {
  headless: false,  // ← MUDE DE 'new' PARA false
  args: [
    // ... resto
  ]
},
```

2. Reinicie:
```batch
start-clean.bat
```

3. **Você verá o Chrome abrindo na tela**

4. Observe o que acontece:
   - Se o Chrome abre mas não carrega nada = Problema de rede
   - Se o Chrome não abre = Problema com Puppeteer
   - Se o Chrome abre e carrega = Tire um print e mande

---

## 📞 Suporte

Se chegou até aqui e ainda não funciona, forneça:

1. **Screenshot do terminal** quando trava
2. **Resultado de:** `verificar-chromium.bat`
3. **Resultado de:** `testar-conectividade.bat`
4. **Versões:**
   ```batch
   node --version
   npm --version
   ```

5. **Sistema operacional:** Windows 10/11, Linux, Mac

---

## ✅ Sucesso!

Se tudo funcionou, você verá no seu aplicativo:

- ✅ Status: Online
- ✅ Pode enviar mensagens
- ✅ Mensagens aparecem no WhatsApp do cliente

**Parabéns! 🎉 Sistema funcionando perfeitamente!**
