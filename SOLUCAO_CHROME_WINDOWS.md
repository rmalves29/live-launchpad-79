# 🔧 Solução: Erro "Could not find expected browser (chrome)"

## ❌ Erro

```
Error: Could not find expected browser (chrome) locally.
Run 'npm install' to download the correct Chromium revision
```

## ✅ Solução Rápida (Windows)

### Opção 1: Instalar Chromium Automaticamente (Recomendado)

Execute o script de instalação:

```batch
instalar-chromium.bat
```

Isso irá:
1. Reinstalar o Puppeteer
2. Baixar o Chromium (~300MB)
3. Configurar tudo automaticamente

**Depois execute:**
```batch
start-server.bat
```

### Opção 2: Usar Chrome do Sistema

O servidor agora detecta automaticamente o Chrome instalado no Windows nos seguintes caminhos:
- `C:\Program Files\Google\Chrome\Application\chrome.exe`
- `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`
- `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`

**Passos:**
1. Certifique-se que o Google Chrome está instalado
2. Execute `npm install` (se ainda não executou)
3. Execute `start-server.bat`

O servidor automaticamente encontrará e usará o Chrome do sistema!

## 🐧 Linux/Mac

```bash
# Instalar dependências
npm install

# O Chromium será baixado automaticamente
# Se falhar, execute:
./instalar-chromium.sh
```

## 🔍 Verificar Instalação

Após instalar, verifique se está tudo ok:

```javascript
node -e "const p = require('puppeteer'); console.log('Chromium:', p.executablePath());"
```

## 📝 O Que Foi Alterado no Código

O servidor agora:

1. **Tenta usar Chromium do Puppeteer** (se disponível)
2. **Busca Chrome do sistema no Windows** (fallback automático)
3. **Mostra qual Chrome está sendo usado** no console

```javascript
// No server1.js agora temos:
if (process.platform === 'win32') {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ];

  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`✅ Chrome encontrado: ${chromePath}`);
      puppeteerConfig.executablePath = chromePath;
      break;
    }
  }
}
```

## 🚨 Ainda com Problemas?

### Erro: "Chrome não encontrado"

**Instale o Google Chrome:**
https://www.google.com/chrome/

### Erro: "npm install falha"

**Execute como Administrador:**
```batch
# Botão direito no CMD -> Executar como Administrador
npm install puppeteer --force
```

### Erro: "Download trava em 50%"

**Configure proxy (se usar):**
```batch
set HTTP_PROXY=http://proxy:porta
set HTTPS_PROXY=http://proxy:porta
npm install
```

## 📦 Dependências Atualizadas

O `package-server.json` agora inclui:

```json
{
  "dependencies": {
    "whatsapp-web.js": "^1.23.0",
    "puppeteer": "^21.6.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "qrcode-terminal": "^0.12.0",
    "node-fetch": "^2.6.7"
  }
}
```

## ✅ Teste Final

Após a instalação, teste com:

```batch
node server1.js
```

Você deve ver:
```
🚀 Iniciando servidor WhatsApp Multi-Tenant...
📋 Carregando tenants ativos...
✅ 2 tenant(s) encontrado(s)
🔄 Inicializando MANIA DE MULHER...
📱 Criando cliente WhatsApp para tenant: MANIA DE MULHER
✅ Chrome encontrado: C:\Program Files\Google\Chrome\Application\chrome.exe
🔲 QR Code para MANIA DE MULHER:
[QR CODE AQUI]
```

## 🎯 Resumo

**Antes:** Chromium não baixava automaticamente  
**Agora:** Servidor usa Chrome do sistema como fallback  
**Resultado:** Funciona mesmo sem Chromium do Puppeteer!
