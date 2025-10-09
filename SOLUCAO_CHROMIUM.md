# 🔧 Solução Definitiva - Chromium não encontrado

## 📋 Problema

Erro ao iniciar o servidor:
```
Could not find expected browser (chrome) locally.
Run `npm install` to download the correct Chromium revision.
```

**Causa:** O Puppeteer não conseguiu baixar o Chromium durante a instalação.

---

## ✅ Solução Rápida (Recomendada)

### Windows:

```batch
# Execute o script automático
instalar-chromium.bat
```

### Linux/Mac:

```bash
# Desinstalar puppeteer
npm uninstall puppeteer

# Garantir que o download não será pulado
unset PUPPETEER_SKIP_CHROMIUM_DOWNLOAD

# Reinstalar com download forçado
npm install puppeteer@latest --force

# Verificar instalação
node -e "const p = require('puppeteer'); console.log(p.executablePath())"
```

---

## 🔍 Verificar se Funcionou

### Opção 1: Script de Verificação

```batch
# Windows
verificar-chromium.bat

# Linux/Mac
node -e "const p = require('puppeteer'); console.log(p.executablePath())"
```

### Opção 2: Teste Rápido

```batch
# Windows
node check-whatsapp.js

# Linux/Mac
node check-whatsapp.js
```

Se o QR Code aparecer = ✅ Funcionou!

---

## 🛠️ Solução Manual (Se o Script Falhar)

### Passo 1: Limpar Completamente

```batch
# Windows
rmdir /s /q node_modules
rmdir /s /q .wwebjs_auth_clean
del package-lock.json
npm cache clean --force
```

```bash
# Linux/Mac
rm -rf node_modules
rm -rf .wwebjs_auth_clean
rm package-lock.json
npm cache clean --force
```

### Passo 2: Reinstalar Dependências

```batch
# Garantir que o Chromium será baixado
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false    # Windows
unset PUPPETEER_SKIP_CHROMIUM_DOWNLOAD        # Linux/Mac

# Instalar dependências
npm install whatsapp-web.js@latest
npm install puppeteer@latest --force
npm install express cors qrcode-terminal node-fetch@2
```

### Passo 3: Verificar Instalação

```bash
node -e "const p = require('puppeteer'); console.log('Chromium em:', p.executablePath())"
```

**Saída esperada:**
```
Chromium em: C:\Users\...\node_modules\puppeteer\.local-chromium\win64-1045629\chrome-win\chrome.exe
```

### Passo 4: Testar Conexão

```batch
node check-whatsapp.js
```

---

## 🔥 Solução Alternativa - Usar Chrome do Sistema

Se mesmo assim não funcionar, use o Chrome já instalado no seu computador:

### 1. Instalar puppeteer-core (sem Chromium)

```bash
npm uninstall puppeteer
npm install puppeteer-core
```

### 2. Configurar caminho do Chrome

Edite `server-multitenant-clean.js` na linha 104:

```javascript
puppeteer: {
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Windows
  // executablePath: '/usr/bin/google-chrome',  // Linux
  // executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // Mac
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu'
  ]
},
```

### 3. Testar

```batch
node check-whatsapp.js
```

---

## 🐧 Linux - Instalar Dependências do Chromium

Se estiver no Linux e o Chromium não iniciar mesmo após instalado:

```bash
sudo apt-get update

sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils
```

---

## 🎯 Checklist de Verificação

Antes de iniciar o servidor, verifique:

- [ ] Node.js instalado (v16 ou superior)
- [ ] NPM atualizado
- [ ] Espaço em disco (mínimo 500MB livres)
- [ ] Antivírus desabilitado temporariamente
- [ ] Firewall não está bloqueando
- [ ] Chromium baixado com sucesso
- [ ] `node_modules/puppeteer/.local-chromium` existe
- [ ] Arquivo `chrome.exe` ou `chrome` existe no caminho

---

## 📊 Comandos Úteis de Diagnóstico

### Verificar onde o Puppeteer procura o Chrome:

```bash
node -e "const p = require('puppeteer'); console.log(p.executablePath())"
```

### Verificar se o arquivo existe:

```bash
# Windows
dir "C:\...\node_modules\puppeteer\.local-chromium\...\chrome.exe"

# Linux/Mac
ls -la /path/to/node_modules/puppeteer/.local-chromium/.../chrome
```

### Verificar versões:

```bash
node --version
npm --version
npm list puppeteer
npm list whatsapp-web.js
```

### Testar Puppeteer isoladamente:

```javascript
// Crie um arquivo test-puppeteer.js
const puppeteer = require('puppeteer');

(async () => {
  console.log('Iniciando Puppeteer...');
  const browser = await puppeteer.launch({ headless: false });
  console.log('✓ Puppeteer funcionando!');
  
  const page = await browser.newPage();
  await page.goto('https://example.com');
  console.log('✓ Navegação funcionando!');
  
  await browser.close();
  console.log('✓ Teste concluído com sucesso!');
})();
```

Execute:
```bash
node test-puppeteer.js
```

---

## 🆘 Se Nada Funcionar

### Opção 1: Docker

Use Docker para evitar problemas de ambiente:

```dockerfile
FROM node:18-slim

RUN apt-get update && apt-get install -y \
    wget ca-certificates fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 \
    libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 \
    libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 \
    libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
    libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
    libxrandr2 libxrender1 libxss1 libxtst6 lsb-release \
    xdg-utils && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

CMD ["node", "server-multitenant-clean.js"]
```

### Opção 2: Deploy em Cloud

- **Railway.app** (recomendado - fácil)
- **Render.com** (free tier)
- **DigitalOcean Droplet**

### Opção 3: WSL2 (Windows Subsystem for Linux)

Se estiver no Windows, use WSL2 para ambiente Linux:

```powershell
# Instalar WSL2
wsl --install

# Dentro do WSL:
cd /mnt/c/seu-projeto
npm install
node check-whatsapp.js
```

---

## 📚 Referências

- [Puppeteer Troubleshooting](https://pptr.dev/troubleshooting)
- [whatsapp-web.js Guide](https://wwebjs.dev/guide/)
- [Chrome/Chromium Download](https://www.chromium.org/getting-involved/download-chromium)

---

## ✅ Sucesso!

Após seguir estes passos, execute:

```batch
# 1. Verificar
verificar-chromium.bat

# 2. Testar
node check-whatsapp.js

# 3. Se tudo OK, iniciar servidor
start-clean.bat
```

**Esperado:**
- ✅ Chromium encontrado
- ✅ Servidor iniciando
- ✅ QR Code gerado
- ✅ WhatsApp conectado
