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
