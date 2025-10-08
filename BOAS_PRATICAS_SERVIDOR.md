# 🛡️ Boas Práticas - Servidor WhatsApp

## 🎉 NOVIDADE: Limpeza Automática Integrada!

O servidor agora faz **limpeza automática** ao iniciar! 

**O que ele faz sozinho:**
- ✅ Mata processos Node.js antigos (exceto o atual)
- ✅ Remove arquivos de lock travados
- ✅ Aguarda tempo necessário para liberação de recursos
- ✅ Shutdown gracioso ao encerrar (Ctrl+C)

**Basta executar:**
```powershell
node server-whatsapp-unified.js
```

**OU usar o script completo:**
```powershell
.\start-safe.ps1
```

---

## 📋 Problemas Comuns e Soluções

### 1. ❌ Erro: "Cannot read properties of undefined (reading 'getChat')"

**Causa:**
- O método `msg.getChat()` pode falhar em grupos quando o WhatsApp está sobrecarregado
- Puppeteer pode estar instável ou desconectado momentaneamente

**Soluções Implementadas:**
```javascript
// ✅ CORRETO: Com timeout e fallback
const getChatWithTimeout = () => {
  return Promise.race([
    msg.getChat(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 5000)
    )
  ]);
};

// Se falhar, processar com author mesmo sem nome do grupo
if (msg.author) {
  authorPhone = normalizeForStorage(msg.author.replace('@c.us', ''));
  groupName = 'Grupo (nome indisponível)';
}
```

**Prevenção:**
- ✅ Sempre verificar se `msg.author` existe antes de processar grupos
- ✅ Usar timeout em operações com Puppeteer
- ✅ Ter fallback quando `getChat()` falhar

---

### 2. ❌ Erro: "EBUSY: resource busy or locked"

**Causa:**
- Múltiplos processos Node.js tentando acessar os mesmos arquivos de sessão
- Operações de limpeza durante desconexão enquanto arquivos estão em uso
- Verificação automática de pagamentos ao conectar (sobrecarga)

**Soluções Implementadas:**

#### A) Remover Verificação Automática ao Conectar
```javascript
// ❌ ERRADO: Sobrecarga ao conectar
client.on('ready', async () => { 
  await checkAndSendPendingPaymentConfirmations(); // Pode causar EBUSY
});

// ✅ CORRETO: Verificação manual quando necessário
client.on('ready', async () => { 
  console.log('💡 Use POST /check-pending-payments para enviar confirmações');
});
```

#### B) Endpoint para Verificação Manual
```javascript
// Use este endpoint quando precisar verificar pagamentos pendentes
POST http://localhost:3333/check-pending-payments
```

#### C) Matar Processos Antes de Iniciar
```powershell
# SEMPRE execute antes de iniciar o servidor
taskkill /F /IM node.exe
Start-Sleep -Seconds 3
node server-whatsapp-unified.js
```

**Prevenção:**
- ✅ NUNCA rode múltiplas instâncias do servidor
- ✅ SEMPRE mate processos antes de reiniciar
- ✅ NÃO faça operações massivas logo após conectar

---

### 3. ⚠️ Mensagens do Próprio Bot

**Problema:**
O bot pode processar suas próprias mensagens, causando loops infinitos

**Solução Implementada:**
```javascript
// ✅ CORRETO: Ignorar mensagens do próprio bot
client.on('message', async (msg) => {
  if (msg.fromMe) {
    console.log('⏭️ Ignorando mensagem enviada pelo próprio bot');
    return;
  }
  // ... resto do código
});
```

---

## 🚀 Checklist de Inicialização Segura

### Antes de Iniciar o Servidor:

1. ✅ **Matar processos existentes:**
```powershell
taskkill /F /IM node.exe
```

2. ✅ **Aguardar limpeza:**
```powershell
Start-Sleep -Seconds 3
```

3. ✅ **Verificar se porta está livre:**
```powershell
netstat -ano | findstr :3333
```

4. ✅ **Iniciar servidor:**
```powershell
node server-whatsapp-unified.js
```

5. ✅ **Aguardar QR Code:**
- Não envie mensagens antes de ver "WhatsApp conectado!"

6. ✅ **Verificar status:**
```powershell
curl http://localhost:3333/status
```

---

## 📊 Monitoramento e Logs

### Logs Importantes:

**✅ Inicialização Bem-Sucedida:**
```
🏢 Servidor WhatsApp - MANIA DE MULHER (EXCLUSIVO)
🔐 Modo Supabase: service_role
📱 Escaneie o QR Code
🔑 WhatsApp autenticado!
✅ WhatsApp conectado!
💡 Use POST /check-pending-payments para enviar confirmações pendentes
```

**⚠️ Logs de Alerta (Normais):**
```
⏭️ Ignorando mensagem enviada pelo próprio bot
⚠️ Mensagem de grupo sem author definido, ignorando
⚠️ Processando sem nome do grupo
```

**❌ Logs de Erro (Requer Ação):**
```
❌ Erro CRÍTICO ao processar mensagem
❌ Falha na autenticação do WhatsApp
❌ WhatsApp desconectado. Motivo: LOGOUT
```

---

## 🛠️ Recuperação de Erros

### Se o WhatsApp desconectar (LOGOUT):

```powershell
# 1. Parar o servidor (Ctrl+C)

# 2. Matar todos os processos Node.js
taskkill /F /IM node.exe

# 3. Aguardar
Start-Sleep -Seconds 3

# 4. Limpar sessão (OPCIONAL - só se problemas persistirem)
Remove-Item -Recurse -Force ".\.wwebjs_auth"
Remove-Item -Recurse -Force ".\.wwebjs_cache"

# 5. Reiniciar
node server-whatsapp-unified.js

# 6. Escanear QR code novamente
```

---

## 📝 Melhorias Implementadas

### Tratamento de Erros Robusto:

1. **Timeout em operações Puppeteer:**
   - Limite de 5 segundos para `getChat()`
   - Fallback quando timeout ocorrer

2. **Verificações de segurança:**
   - Validar `msg.from` antes de processar
   - Validar `msg.author` em grupos
   - Validar `msg.body` antes de processar texto

3. **Logs detalhados:**
   - Salvar erros críticos no banco
   - Logs com emojis para fácil identificação
   - Stack traces completos para debug

4. **Event handlers melhorados:**
   - `auth_failure` com dicas de solução
   - `disconnected` com identificação de motivo
   - Handlers de erro para cada operação

---

## ⚡ Performance

### Otimizações:

1. **Verificação Manual de Pagamentos:**
   - Removida verificação automática ao conectar
   - Use endpoint quando realmente necessário

2. **Delays entre envios:**
   - 2 segundos entre mensagens individuais
   - 3 segundos entre lotes de broadcast

3. **Timeouts apropriados:**
   - 5 segundos para operações de chat
   - 45 segundos para download de imagens

---

## 🔒 Segurança

### Boas Práticas:

1. **Service Role:**
   - Usar apenas no servidor Node.js
   - NUNCA expor no frontend
   - Manter em variável de ambiente

2. **Validação de Input:**
   - Normalizar telefones antes de salvar
   - Validar códigos de produto
   - Sanitizar mensagens recebidas

3. **Rate Limiting:**
   - Delays entre envios de mensagens
   - Batches para broadcast

---

## 📞 Suporte

Se problemas persistirem após seguir este guia:

1. ✅ Execute o checklist de inicialização
2. ✅ Verifique os logs detalhadamente
3. ✅ Tente em modo debug se necessário
4. ✅ Considere atualizar whatsapp-web.js:
   ```powershell
   npm install whatsapp-web.js@latest
   ```

---

## 🎯 Resumo Rápido

**Para evitar erros:**
- ✅ Sempre mate processos antes de iniciar
- ✅ Não sobrecarregue ao conectar
- ✅ Use timeouts em operações Puppeteer
- ✅ Valide dados antes de processar
- ✅ Ignore mensagens do próprio bot
- ✅ Tenha fallbacks para operações críticas

**Para uso diário:**
- ✅ Use `server-whatsapp-unified.js`
- ✅ Monitor logs regularmente
- ✅ Verificações de pagamento manual
- ✅ Mantenha uma única instância por número
