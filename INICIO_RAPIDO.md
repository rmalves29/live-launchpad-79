# ⚡ INÍCIO RÁPIDO - Servidor WhatsApp

## ✅ PROBLEMA CORRIGIDO!

O erro 401 do Supabase foi corrigido. Agora usa a chave SERVICE ROLE correta.

## 🚀 Iniciar em 3 Passos

### 1️⃣ Abrir PowerShell
```powershell
cd C:\whatsapp-automacao
```

### 2️⃣ Iniciar servidor
```powershell
node server-whatsapp-v2.js
```

### 3️⃣ Escanear QR Code
- Chrome abrirá automaticamente
- Escaneie o QR Code com WhatsApp
- Pronto! ✅

## 📊 Ver Status
```
http://localhost:3333/status
```

## ❌ Se der erro
```powershell
taskkill /F /IM node.exe
Remove-Item -Recurse -Force .wwebjs_auth
node server-whatsapp-v2.js
```
