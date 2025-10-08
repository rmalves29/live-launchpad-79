# 🔧 Troubleshooting: WhatsApp LOGOUT

## ❌ Problema

O WhatsApp desconecta automaticamente com mensagem:
```
WhatsApp DESCONECTADO
Motivo: LOGOUT
Error: EBUSY: resource busy or locked, unlink 'C:\whatsapp-automacao\.wwebjs_auth\...'
```

---

## 🔍 Causas Comuns

### 1. **Múltiplas instâncias do servidor**
- Você iniciou o servidor mais de uma vez
- Processos Node.js antigos ainda estão rodando

### 2. **QR Code escaneado em múltiplos lugares**
- Escaneou o mesmo QR em outro servidor/computador
- Sessão duplicada detectada pelo WhatsApp

### 3. **Sessão expirada ou inválida**
- Sessão WhatsApp antiga corrompida
- Mudança de IP ou rede

### 4. **WhatsApp Web detectou comportamento suspeito**
- Muitas mensagens enviadas rapidamente
- Padrão de uso automatizado detectado

---

## ✅ Solução Rápida

### **Opção 1: Script Automático (Recomendado)**

```powershell
# Execute o script de correção
.\fix-lockfile.ps1
```

### **Opção 2: Comandos Manuais**

```powershell
# 1. Parar TODOS os processos Node.js
taskkill /F /IM node.exe

# 2. Aguardar 3 segundos
Start-Sleep -Seconds 3

# 3. Limpar sessões travadas
Remove-Item -Recurse -Force ".\.wwebjs_auth"
Remove-Item -Recurse -Force ".\.wwebjs_cache"

# 4. Reiniciar o servidor
node server-whatsapp-individual-no-env.js
```

---

## 🛡️ Prevenção

### 1. **Sempre verifique processos antes de iniciar**

```powershell
# Ver processos Node.js rodando
Get-Process -Name node -ErrorAction SilentlyContinue

# Se houver algum, mate todos antes de iniciar
taskkill /F /IM node.exe
```

### 2. **Use apenas UMA instância por número**

⚠️ **NUNCA:**
- Rode múltiplos servidores com o mesmo `TENANT_SLUG`
- Escaneie o QR em mais de um lugar
- Use a mesma sessão WhatsApp em múltiplos processos

### 3. **Monitore o status do WhatsApp**

```bash
# Endpoint de status
curl http://localhost:3333/status
```

Resposta esperada:
```json
{
  "whatsapp": {
    "ready": true,
    "clientState": "READY",
    "puppeteerState": "CONNECTED",
    "canSendMessages": true
  }
}
```

### 4. **Aguarde a estabilização após conectar**

O servidor aguarda **3 segundos** após conectar antes de marcar como "pronto":

```
✅ WhatsApp CONECTADO E PRONTO!
✅ Cliente estabilizado e pronto para enviar mensagens
```

⚠️ **NÃO envie mensagens** antes de ver essa mensagem!

---

## 🔄 Reconexão Automática

O servidor agora tem **reconexão automática** para desconexões não-LOGOUT:

```javascript
// Reconexão em 10 segundos para desconexões normais
// LOGOUT requer intervenção manual (QR code)
```

Se vir `🔄 Tentando reconectar em 10 segundos...`, aguarde e o servidor reconectará automaticamente.

---

## 📊 Logs Importantes

### ✅ **Logs Normais (Tudo OK)**

```
🚀 INICIANDO SERVIDOR WHATSAPP
🏢 Tenant: app (08f2b1b9-3988-489e-8186-c60f0c0b0622)
🧹 Verificando e limpando arquivos travados do WhatsApp...
📱 ESCANEIE O QR CODE ABAIXO:
🔑 WhatsApp autenticado com sucesso!
✅ WhatsApp CONECTADO E PRONTO!
✅ Cliente estabilizado e pronto para enviar mensagens
```

### ❌ **Logs de Problema**

```
❌ WhatsApp DESCONECTADO
❌ Motivo: LOGOUT
⚠️  LOGOUT detectado - sessão removida pelo WhatsApp
📋 Possíveis causas:
   1. Múltiplas conexões no mesmo número
   2. QR code escaneado em outro servidor
   3. Sessão expirada ou inválida
```

**Ação:** Execute `.\fix-lockfile.ps1` e reinicie

---

## 🆘 Ainda não funciona?

### 1. **Reinicie o computador**
- Em casos extremos, arquivos do sistema podem estar travados
- Reiniciar libera TODOS os recursos

### 2. **Verifique antivírus/firewall**
- Alguns antivírus bloqueiam o acesso aos arquivos `.wwebjs_auth`
- Adicione exceção para a pasta do projeto

### 3. **Atualize dependências**

```powershell
npm install whatsapp-web.js@latest
```

### 4. **Verifique permissões da pasta**

```powershell
# Garanta permissão de escrita/leitura
icacls .\.wwebjs_auth /grant Everyone:F
```

### 5. **Use Node.js LTS**

Versão recomendada: **Node.js 18.x ou 20.x**

```powershell
node --version
# Deve ser v18.x ou v20.x
```

---

## 📞 Contato

Se o problema persistir após todas as tentativas:

1. Execute: `.\fix-lockfile.ps1`
2. Reinicie o computador
3. Verifique se não há **outras instâncias** do servidor rodando
4. Tente usar uma **nova sessão** (diferente `TENANT_SLUG`)

---

## ✨ Melhorias Implementadas

- ✅ Limpeza automática de lockfile ao iniciar
- ✅ Reconexão automática para desconexões não-LOGOUT
- ✅ Logs detalhados para diagnóstico
- ✅ Script `fix-lockfile.ps1` para correção rápida
- ✅ Verificação de estado antes de enviar mensagens
- ✅ Tratamento inteligente de EBUSY durante LOGOUT
