# 🚀 INSTALAÇÃO DAS DEPENDÊNCIAS - GUIA DEFINITIVO

## ❌ Erro Atual
```
ReferenceError: Client is not defined
```

Isso significa: **As dependências NÃO estão instaladas no seu computador**.

---

## ✅ SOLUÇÃO RÁPIDA (Execute no PowerShell como Administrador)

### Opção 1: Script Automático
```powershell
.\diagnostico-instalacao.bat
```

### Opção 2: Comandos Manuais

**Passo 1:** Limpar instalação anterior
```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
```

**Passo 2:** Instalar whatsapp-web.js (principal)
```powershell
npm install whatsapp-web.js@1.23.0
```

**Aguarde:** Isso pode levar 5-10 minutos. Vai baixar o Chromium automaticamente.

**Passo 3:** Instalar outras dependências
```powershell
npm install express@4.18.2 cors@2.8.5 qrcode-terminal@0.12.0 node-fetch@2.7.0
```

**Passo 4:** Verificar se funcionou
```powershell
dir node_modules\whatsapp-web.js
```

Você deve ver uma pasta com arquivos dentro.

**Passo 5:** Iniciar servidor
```powershell
node server1.js
```

---

## 🔍 Como Saber Se Está Funcionando?

### ✅ SUCESSO - Você verá:
```
✅ Chrome encontrado: C:\Program Files\Google\Chrome\Application\chrome.exe
📱 Criando cliente WhatsApp para tenant: MANIA DE MULHER
📱 Aguardando QR Code...
🔲 QR Code:
█████████████████████████████
█████████████████████████████
```

### ❌ FALHA - Você verá:
```
❌ Erro fatal: ReferenceError: Client is not defined
```

---

## 🛠️ Problemas Comuns

### 1. "npm not found"
**Solução:** Instale Node.js de https://nodejs.org/

### 2. "Access denied" ou "Permission denied"
**Solução:** Execute o PowerShell como Administrador (botão direito > Executar como administrador)

### 3. Instalação trava em "Installing Chromium"
**Solução:** 
- Desabilite temporariamente o Windows Defender
- Desconecte VPN se estiver usando
- Verifique sua conexão de internet

### 4. "EBUSY: resource busy or locked"
**Solução:**
```powershell
# Feche todos os processos Node.js
taskkill /F /IM node.exe

# Depois reinstale
npm install whatsapp-web.js@1.23.0
```

### 5. Proxy/Firewall Corporativo
**Solução:**
```powershell
# Configure o proxy do npm
npm config set proxy http://seu-proxy:porta
npm config set https-proxy http://seu-proxy:porta

# Depois instale
npm install whatsapp-web.js@1.23.0
```

---

## 📊 Checklist de Verificação

Antes de iniciar, confirme:

- [ ] Node.js 16 ou superior instalado
- [ ] npm funcionando
- [ ] Conexão estável com internet
- [ ] Pelo menos 2GB de espaço livre
- [ ] Executando como Administrador
- [ ] Nenhum processo Node.js rodando (`tasklist | findstr node`)
- [ ] Firewall/Antivírus não está bloqueando

---

## 🎯 Teste Rápido

Execute este comando para testar se o Client está disponível:

```powershell
node -e "const {Client} = require('whatsapp-web.js'); console.log('✅ OK:', typeof Client);"
```

**Resultado esperado:**
```
✅ OK: function
```

**Se der erro:**
```
Error: Cannot find module 'whatsapp-web.js'
```
= As dependências NÃO estão instaladas. Volte ao Passo 2.

---

## 📞 Ainda Precisa de Ajuda?

1. Execute: `diagnostico-instalacao.bat`
2. Copie TODA a saída
3. Me envie para análise

Ou veja: `DIAGNOSTICO_PUPPETEER.md` para soluções avançadas.
