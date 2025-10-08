# 🚀 Como Iniciar o Servidor WhatsApp

## 📋 Método 1: Script Automático (RECOMENDADO)

O servidor agora tem **limpeza automática integrada**! Basta executar:

### Windows:
```powershell
.\start-safe.ps1
```

**OU simplesmente:**
```powershell
node server-whatsapp-unified.js
```

### Linux/Mac:
```bash
node server-whatsapp-unified.js
```

---

## ✨ O que o servidor faz automaticamente:

1. ✅ **Mata processos Node.js antigos** (exceto o atual)
2. ✅ **Remove arquivos de lock travados**
3. ✅ **Aguarda 3 segundos** para liberação de recursos
4. ✅ **Inicia com segurança**

**Logs de inicialização:**
```
🧹 Iniciando limpeza automática...
📍 PID atual: 12345
✅ 2 processo(s) Node.js antigo(s) encerrado(s)
✅ 3 arquivo(s) de lock removido(s)
✅ Limpeza automática concluída!

🏢 ═══════════════════════════════════════════════
🏢 Servidor WhatsApp - MANIA DE MULHER (EXCLUSIVO)
🏢 ═══════════════════════════════════════════════
```

---

## 🛡️ Método 2: Script PowerShell Completo

Use `start-safe.ps1` para uma inicialização ainda mais segura:

**Recursos extras do script:**
- Mata processos Chrome/Chromium
- Verifica porta 3333
- Limpa arquivos de lock opcionais
- Logs coloridos detalhados

```powershell
# Executar script
.\start-safe.ps1
```

---

## ⚙️ Configuração (Primeira vez)

### 1. Instalar dependências:
```powershell
npm install
```

### 2. Configurar variáveis de ambiente (PowerShell):

```powershell
$env:SUPABASE_SERVICE_ROLE="eyJhbGciOiJI...SUA_SERVICE_ROLE_AQUI"
$env:TENANT_ID="08f2b1b9-3988-489e-8186-c60f0c0b0622"
$env:TENANT_SLUG="app"
```

**OU** criar arquivo `.env`:
```env
SUPABASE_SERVICE_ROLE=eyJhbGciOiJI...SUA_SERVICE_ROLE_AQUI
TENANT_ID=08f2b1b9-3988-489e-8186-c60f0c0b0622
TENANT_SLUG=app
PORT=3333
```

### 3. Iniciar servidor:
```powershell
node server-whatsapp-unified.js
```

### 4. Escanear QR Code:
- Abra WhatsApp no celular
- Vá em **Aparelhos Conectados**
- Escaneie o QR Code que aparece no terminal

---

## 📱 Verificar Status

```powershell
# Verificar se está rodando
curl http://localhost:3333/status

# Resposta esperada:
{
  "tenant": {
    "id": "08f2b1b9-3988-489e-8186-c60f0c0b0622",
    "slug": "app"
  },
  "whatsapp": {
    "ready": true
  },
  "supabase": {
    "url": "https://hxtbsieodbtzgcvvkeqx.supabase.co",
    "hasServiceRole": true
  },
  "features": ["individual", "groups"]
}
```

---

## 🛑 Parar o Servidor

### Opção 1: Ctrl+C (Recomendado)
```
Pressione Ctrl+C no terminal
```

O servidor fará **shutdown gracioso**:
- Desconecta WhatsApp corretamente
- Salva sessão
- Libera recursos

### Opção 2: Forçar encerramento (emergência)
```powershell
taskkill /F /IM node.exe
```

---

## ❌ Se tiver problemas

### Erro: "EBUSY: resource busy or locked"

**Solução rápida:**
```powershell
# 1. Parar TUDO
taskkill /F /IM node.exe
taskkill /F /IM chrome.exe

# 2. Aguardar
Start-Sleep -Seconds 5

# 3. Reiniciar
node server-whatsapp-unified.js
```

### Erro: "WhatsApp não conecta"

**Solução:**
```powershell
# 1. Parar servidor
Ctrl+C

# 2. Limpar sessão
Remove-Item -Recurse -Force ".\.wwebjs_auth"

# 3. Reiniciar e escanear QR code novamente
node server-whatsapp-unified.js
```

### Erro: "Porta 3333 já em uso"

**Solução:**
```powershell
# Encontrar processo na porta
netstat -ano | findstr :3333

# Matar processo (substitua PID)
taskkill /F /PID <PID>
```

---

## 📊 Endpoints Disponíveis

### Status do Servidor
```http
GET http://localhost:3333/status
```

### Enviar Mensagem Individual
```http
POST http://localhost:3333/send
Content-Type: application/json

{
  "phone": "5531999999999",
  "message": "Olá!"
}
```

### Listar Grupos WhatsApp
```http
GET http://localhost:3333/list-all-groups
```

### Enviar para Grupo
```http
POST http://localhost:3333/send-to-group
Content-Type: application/json

{
  "groupId": "120363xxx@g.us",
  "message": "Mensagem para o grupo",
  "imageUrl": "https://example.com/image.jpg"
}
```

### Verificar Pagamentos Pendentes
```http
POST http://localhost:3333/check-pending-payments
```

### Broadcast por Status de Pedidos
```http
POST http://localhost:3333/api/broadcast/orders
Content-Type: application/json

{
  "key": "whatsapp-broadcast-2024",
  "status": "paid",
  "message": "Mensagem em massa",
  "startDate": "2025-01-01",
  "endDate": "2025-12-31"
}
```

---

## 🔥 Dicas Avançadas

### 1. Criar Alias no PowerShell

Adicione ao perfil (`notepad $PROFILE`):

```powershell
function Start-WhatsApp {
    Set-Location "C:\whatsapp-automacao"
    node server-whatsapp-unified.js
}

Set-Alias wpp Start-WhatsApp
```

Depois só digite:
```powershell
wpp
```

### 2. Executar como Serviço Windows

Use PM2 ou NSSM para rodar como serviço:

```powershell
# Com PM2
npm install -g pm2
pm2 start server-whatsapp-unified.js --name whatsapp
pm2 save
pm2 startup
```

### 3. Monitoramento Automático

```powershell
# Loop de monitoramento
while ($true) {
    $status = Invoke-RestMethod http://localhost:3333/status -ErrorAction SilentlyContinue
    if ($status.whatsapp.ready) {
        Write-Host "✅ WhatsApp Online" -ForegroundColor Green
    } else {
        Write-Host "❌ WhatsApp Offline" -ForegroundColor Red
    }
    Start-Sleep -Seconds 30
}
```

---

## 📚 Documentação Adicional

- **Boas Práticas:** `BOAS_PRATICAS_SERVIDOR.md`
- **Troubleshooting:** `TROUBLESHOOTING_LOGOUT.md`
- **Servidor Estável:** `USAR_SERVIDOR_ESTAVEL.md`

---

## ✅ Checklist de Inicialização

- [ ] Variáveis de ambiente configuradas
- [ ] Dependências instaladas (`npm install`)
- [ ] Porta 3333 livre
- [ ] Nenhum processo Node.js antigo rodando
- [ ] Executar `node server-whatsapp-unified.js` OU `.\start-safe.ps1`
- [ ] Escanear QR Code quando aparecer
- [ ] Aguardar "✅ WhatsApp conectado!"
- [ ] Verificar status: `curl http://localhost:3333/status`

---

## 🆘 Suporte

Se problemas persistirem:

1. ✅ Leia `BOAS_PRATICAS_SERVIDOR.md`
2. ✅ Verifique logs no terminal
3. ✅ Execute `.\start-safe.ps1` para limpeza completa
4. ✅ Considere reiniciar o computador em casos extremos

**Agora é só iniciar e usar! 🚀**
