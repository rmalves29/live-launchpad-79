# 🔧 Troubleshooting - WhatsApp não envia mensagens

## ❌ Problema: Mensagens não estão sendo enviadas

### Sintomas
- Mensagens não chegam no WhatsApp
- Erro "Servidor não está respondendo"
- Status mostra "Offline" ou "Aguardando"

---

## ✅ Solução Passo a Passo

### 1️⃣ Verificar se o servidor Node.js está rodando

**Windows PowerShell:**
```powershell
# Matar processos antigos
taskkill /F /IM node.exe
taskkill /F /IM chrome.exe

# Aguardar 5 segundos
Start-Sleep -Seconds 5

# Iniciar o servidor
node server-whatsapp-individual-no-env.js
```

**Ou use o script automatizado:**
```powershell
.\start-safe.ps1
```

### 2️⃣ Escanear o QR Code

Após iniciar o servidor, você verá um QR Code no terminal:
1. Abra o WhatsApp no seu celular
2. Vá em **Configurações > Aparelhos Conectados**
3. Clique em **Conectar um aparelho**
4. Escaneie o QR Code exibido no terminal

⏳ Aguarde até ver a mensagem: `✅ Cliente WhatsApp autenticado!`

### 3️⃣ Verificar a configuração no sistema

No sistema web, vá em **Integrações > WhatsApp** e verifique:

- ✅ Status deve estar **"Conectado"** (verde)
- ✅ Servidor deve ser `http://localhost:3333` ou a porta configurada
- ✅ "Pode Enviar Mensagens" deve estar **"✅ Sim"**

Se aparecer **"Servidor não está respondendo"**, volte ao Passo 1.

### 4️⃣ Testar envio de mensagem

1. Vá em **Integrações > WhatsApp**
2. Clique em **"Atualizar Status"**
3. Se o status estiver conectado, tente enviar uma mensagem de teste

---

## 🐛 Erros Comuns e Soluções

### ❌ "Servidor não está respondendo"

**Causa:** Servidor Node.js não está rodando ou está na porta errada.

**Solução:**
```powershell
# Verificar se há processos Node rodando
tasklist | findstr node

# Se houver, matar todos
taskkill /F /IM node.exe

# Reiniciar o servidor
node server-whatsapp-individual-no-env.js
```

---

### ❌ "WhatsApp não está conectado"

**Causa:** QR Code não foi escaneado ou conexão caiu.

**Solução:**
1. Olhe o terminal do Node.js
2. Se aparecer QR Code, escaneie novamente
3. Se não aparecer, reinicie o servidor:
```powershell
# Ctrl+C para parar o servidor
# Depois:
.\start-safe.ps1
```

---

### ❌ "Error: EBUSY: resource busy or locked"

**Causa:** Arquivos de sessão travados.

**Solução:**
```powershell
# Executar script de limpeza
.\fix-lockfile.ps1

# Ou manualmente:
taskkill /F /IM node.exe
taskkill /F /IM chrome.exe
Remove-Item -Recurse -Force .\.wwebjs_auth -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\.wwebjs_cache -ErrorAction SilentlyContinue

# Aguardar 5 segundos e reiniciar
node server-whatsapp-individual-no-env.js
```

---

### ❌ Mensagens ficam "pendentes" sem enviar

**Causa:** Cliente WhatsApp não está pronto (ainda inicializando).

**Solução:**
1. Aguarde 30-60 segundos após escanear o QR Code
2. Verifique no terminal se apareceu: `✅ Cliente WhatsApp pronto!`
3. Atualize o status no sistema web
4. Tente enviar novamente

---

## 📋 Checklist de Verificação

Antes de enviar mensagens, certifique-se:

- [ ] Servidor Node.js está rodando (terminal aberto)
- [ ] QR Code foi escaneado com sucesso
- [ ] Aparece `✅ Cliente WhatsApp pronto!` no terminal
- [ ] Status no sistema web mostra **"Conectado"**
- [ ] "Pode Enviar Mensagens" está **"✅ Sim"**
- [ ] Porta configurada (`3333` ou `3334`) está correta
- [ ] Nenhum firewall está bloqueando a porta

---

## 🔍 Logs e Debug

### Ver logs do servidor Node.js
Os logs aparecem no terminal onde você executou o comando `node server-whatsapp-individual-no-env.js`.

**Logs importantes:**
- `🚀 SERVIDOR RODANDO NA PORTA 3333` - Servidor iniciado
- `⚡ QR Code gerado` - Escaneie o QR Code
- `✅ Cliente WhatsApp autenticado!` - QR Code escaneado
- `✅ Cliente WhatsApp pronto!` - Pronto para enviar
- `📤 Enviando mensagem para: ...` - Mensagem sendo enviada

### Ver logs no navegador
1. Abra o Console do navegador (F12)
2. Vá para a aba **Console**
3. Procure por mensagens com prefixo `[WS]`

---

## 🆘 Ainda não funciona?

Se após seguir todos os passos acima o problema persistir:

1. **Copie os logs do terminal** (últimas 50 linhas)
2. **Tire um print da tela de Status do WhatsApp** no sistema
3. **Anote qual erro aparece** no Console do navegador
4. Entre em contato com o suporte com essas informações

---

## 📚 Documentos Relacionados

- `START_SERVIDOR.md` - Como iniciar o servidor
- `BOAS_PRATICAS_SERVIDOR.md` - Boas práticas de uso
- `start-safe.ps1` - Script de inicialização segura
- `fix-lockfile.ps1` - Script de limpeza de arquivos travados
