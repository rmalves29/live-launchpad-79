# 🚀 Como Usar o Servidor Estável

## ✅ Versão Simplificada e Confiável

Este é o **servidor estável** (`server-stable.js`) - versão simplificada sem complexidades que causam EBUSY.

---

## 📋 Passo a Passo

### 1️⃣ **Antes de Iniciar (SEMPRE!)**

```powershell
# Mate TODOS os processos Node.js anteriores
taskkill /F /IM node.exe

# Aguarde 2 segundos
Start-Sleep -Seconds 2
```

### 2️⃣ **Inicie o Servidor**

```powershell
node server-stable.js
```

### 3️⃣ **Escaneie o QR Code**

Quando aparecer o QR code no terminal, escaneie com seu WhatsApp.

### 4️⃣ **Aguarde a Confirmação**

```
✅ WhatsApp CONECTADO!
📄 Templates: ITEM_ADDED, ...
```

### 5️⃣ **Pronto para Usar!**

O servidor está pronto quando você ver:
```
🌐 Servidor rodando na porta 3333
```

---

## 🔍 Verificar Status

```bash
curl http://localhost:3333/status
```

Resposta esperada:
```json
{
  "tenant": { "id": "...", "slug": "app" },
  "whatsapp": { "ready": true }
}
```

---

## 📤 Endpoints Disponíveis

### 1. Enviar Mensagem Simples

```bash
curl -X POST http://localhost:3333/send \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "11999999999",
    "message": "Olá! Teste de mensagem"
  }'
```

### 2. Enviar Item Adicionado

```bash
curl -X POST http://localhost:3333/send-item-added \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "11999999999",
    "product_id": "uuid-do-produto",
    "quantity": 1
  }'
```

### 3. Listar Grupos WhatsApp

```bash
curl http://localhost:3333/list-all-groups
```

### 4. Enviar para Grupo

```bash
curl -X POST http://localhost:3333/send-to-group \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "123456789@g.us",
    "message": "Olá grupo!",
    "imageUrl": "https://exemplo.com/imagem.jpg"
  }'
```

---

## ⚠️ Se Desconectar (LOGOUT)

Se o WhatsApp desconectar com mensagem **LOGOUT**:

### Opção 1: Script Automático
```powershell
.\fix-lockfile.ps1
node server-stable.js
```

### Opção 2: Manual
```powershell
# 1. Pare o servidor
Ctrl+C

# 2. Mate processos
taskkill /F /IM node.exe

# 3. Limpe sessões
Remove-Item -Recurse -Force ".\.wwebjs_auth"

# 4. Reinicie
node server-stable.js
```

---

## ✨ Diferenças da Versão Estável

### ✅ O que FOI REMOVIDO (causava problemas):
- ❌ Reconexão automática após LOGOUT
- ❌ Limpeza automática de arquivos
- ❌ Múltiplas tentativas de envio
- ❌ Verificações complexas de estado
- ❌ Tratamento excessivo de erros

### ✅ O que FOI MANTIDO (essencial):
- ✅ Conexão WhatsApp básica
- ✅ Envio de mensagens
- ✅ Recebimento de mensagens
- ✅ Processamento de produtos
- ✅ Integração com Supabase
- ✅ Templates de mensagens
- ✅ Grupos WhatsApp

---

## 🎯 Quando Usar Cada Versão

### `server-stable.js` (USE ESTE!)
- ✅ **Uso diário normal**
- ✅ Ambiente de produção
- ✅ Quando precisa de estabilidade
- ✅ Primeira vez configurando

### `server-whatsapp-individual-no-env.js` (Avançado)
- ⚠️  Apenas se precisar de recursos avançados
- ⚠️  Requer mais manutenção
- ⚠️  Mais propenso a erros EBUSY

---

## 🔧 Troubleshooting Rápido

### Problema: "WhatsApp não conectado"
**Solução:** Aguarde aparecer `✅ WhatsApp CONECTADO!`

### Problema: Erro EBUSY
**Solução:** Execute `.\fix-lockfile.ps1` e reinicie

### Problema: QR code não aparece
**Solução:** 
1. Verifique se não há outro Node.js rodando
2. Limpe a sessão: `Remove-Item -Recurse -Force ".\.wwebjs_auth"`
3. Reinicie

### Problema: Servidor trava ao enviar
**Solução:**
1. Ctrl+C para parar
2. `taskkill /F /IM node.exe`
3. Reinicie

---

## 📊 Logs Importantes

### ✅ Tudo OK:
```
🚀 Servidor WhatsApp ESTÁVEL
📱 ESCANEIE O QR CODE
🔐 Autenticado
✅ WhatsApp CONECTADO!
🌐 Servidor rodando na porta 3333
```

### ❌ Problema:
```
❌ Desconectado: LOGOUT
⚠️  LOGOUT detectado! Reinicie manualmente
```

**Ação:** Execute `.\fix-lockfile.ps1`

---

## 💡 Dicas de Uso

1. **Sempre mate processos antes de iniciar:**
   ```powershell
   taskkill /F /IM node.exe
   ```

2. **Use apenas UMA instância por número WhatsApp**

3. **Não escaneie o mesmo QR em múltiplos lugares**

4. **Se o servidor travar, sempre:**
   - Ctrl+C
   - `taskkill /F /IM node.exe`
   - Aguarde 3 segundos
   - Reinicie

5. **Verifique o status antes de enviar mensagens:**
   ```bash
   curl http://localhost:3333/status
   ```

---

## 🆘 Ainda Tendo Problemas?

1. **Reinicie o computador** (libera TODOS os recursos)
2. **Atualize as dependências:**
   ```powershell
   npm install whatsapp-web.js@latest
   ```
3. **Use Node.js LTS (18.x ou 20.x):**
   ```powershell
   node --version
   ```
4. **Verifique permissões da pasta do projeto**

---

## ✅ Checklist de Inicialização

Antes de CADA inicialização:

- [ ] Matar processos Node.js: `taskkill /F /IM node.exe`
- [ ] Aguardar 2-3 segundos
- [ ] Verificar que não há outro servidor rodando
- [ ] Iniciar: `node server-stable.js`
- [ ] Aguardar QR code aparecer
- [ ] Escanear QR code
- [ ] Aguardar confirmação: `✅ WhatsApp CONECTADO!`
- [ ] Verificar status: `curl http://localhost:3333/status`
- [ ] Pronto para usar! 🎉

---

## 🎉 Sucesso!

Se você seguiu todos os passos e viu `✅ WhatsApp CONECTADO!`, está tudo funcionando! 

O servidor estável é **muito mais confiável** e raramente desconecta ou trava.
