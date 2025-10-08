# ⚡ INÍCIO RÁPIDO - Servidor WhatsApp

## 🔍 PRIMEIRO: Diagnóstico

Antes de iniciar, execute o diagnóstico para verificar se está tudo configurado:

```powershell
node diagnostico-whatsapp.js
```

Este script verifica:
- ✅ Conexão com Supabase
- ✅ Tenants cadastrados
- ✅ Integrações WhatsApp ativas
- ✅ Dependências instaladas
- ✅ Sessões antigas

## 🚀 Iniciar Servidor

### 1️⃣ Vá para o diretório do projeto
```powershell
cd caminho\do\seu\projeto\lovable
```

### 2️⃣ Instale dependências (se necessário)
```powershell
npm install whatsapp-web.js qrcode-terminal express cors
```

### 3️⃣ Limpe sessões antigas
```powershell
Remove-Item -Recurse -Force .wwebjs_auth_v2 -ErrorAction SilentlyContinue
taskkill /F /IM chrome.exe /T -ErrorAction SilentlyContinue
```

### 4️⃣ Inicie o servidor
```powershell
node server-whatsapp-v2.js
```

### 5️⃣ Escaneie o QR Code
- Chrome abrirá automaticamente
- QR Code aparecerá no terminal
- Escaneie com WhatsApp do celular
- Aguarde "Cliente pronto!"

## 📊 Verificar Status
```
http://localhost:3333/status
```

## ❌ Se QR Code não aparecer ou ficar carregando

### 1️⃣ Parar o servidor
```powershell
Ctrl + C (no terminal onde está rodando)
ou
taskkill /F /IM node.exe
```

### 2️⃣ Limpar sessões antigas
```powershell
Remove-Item -Recurse -Force .wwebjs_auth_v2
```

### 3️⃣ Reiniciar
```powershell
node server-whatsapp-v2.js
```

## 🔍 Logs importantes

Quando o QR code for gerado, você verá:
```
==================================================
📱 QR CODE GERADO - Nome da Empresa
==================================================
(QR code aparece aqui)
==================================================
✅ Escaneie o QR code acima no WhatsApp
==================================================
```
