# 🚀 Servidor WhatsApp - MANIA DE MULHER

## 📋 Descrição

Servidor Node.js **dedicado** e **estável** para o tenant **MANIA DE MULHER**.

Este servidor possui sistema de fila de mensagens, auto-retry e proteção contra rate limiting do WhatsApp.

---

## ✅ Recursos de Estabilidade

- 📥 **Fila de Mensagens**: Processa mensagens sequencialmente
- 🔄 **Auto-Retry**: Até 3 tentativas por mensagem
- ⏱️ **Delay Inteligente**: 2-3s entre mensagens (proteção rate limit)
- 💚 **Heartbeat**: Verifica conexão a cada 15s
- 🔌 **Auto-Reconexão**: Reconecta automaticamente se desconectar
- 📊 **Monitoramento**: Endpoints para status e fila

---

## 🚀 Como Iniciar

### No Windows:
```cmd
start-mania-mulher.bat
```

### No Linux/Mac:
```bash
chmod +x start-mania-mulher.sh
./start-mania-mulher.sh
```

### Diretamente:
```bash
node server-whatsapp-mania-mulher.js
```

---

## 📊 Informações do Servidor

- **Nome do Tenant**: MANIA DE MULHER
- **Tenant ID**: 08f2b1b9-3988-489e-8186-c60f0c0b0622
- **Porta**: 3334
- **URL**: http://localhost:3334
- **Pasta de sessão**: `.wwebjs_auth_mania_mulher`

---

## 🔧 Endpoints Disponíveis

### Status
```bash
GET http://localhost:3334/status
```
Retorna o status da conexão WhatsApp e tamanho da fila

### Enviar Mensagem
```bash
POST http://localhost:3334/send
{
  "phone": "11999999999",
  "message": "Olá!"
}
```
Se WhatsApp estiver desconectado, adiciona à fila automaticamente

### Broadcast (Múltiplos Destinatários)
```bash
POST http://localhost:3334/broadcast
{
  "phones": ["11999999999", "11988888888"],
  "message": "Mensagem em massa"
}
```
Todas mensagens são adicionadas à fila para envio sequencial

### Ver Fila
```bash
GET http://localhost:3334/queue
```
Mostra mensagens pendentes na fila

### Listar Grupos
```bash
GET http://localhost:3334/list-all-groups
```
Retorna todos os grupos do WhatsApp conectado

### Enviar para Grupo
```bash
POST http://localhost:3334/send-to-group
{
  "groupId": "123456789@g.us",
  "message": "Mensagem para o grupo"
}
```

### Health Check
```bash
GET http://localhost:3334/health
```

---

## 📱 Conectar WhatsApp

1. Inicie o servidor
2. Aguarde o QR Code aparecer no terminal
3. Abra o WhatsApp no celular
4. Vá em **Configurações > Aparelhos conectados**
5. Toque em **Conectar um aparelho**
6. Escaneie o QR Code
7. Aguarde a confirmação: ✅ WhatsApp conectado!

---

## 🔄 Sistema de Fila

O servidor possui um sistema inteligente de fila que:

1. **Adiciona mensagens à fila** quando:
   - WhatsApp está desconectado
   - Envio direto falha após 2 tentativas
   - É um broadcast (sempre usa fila)

2. **Processa a fila** com:
   - Delay de 2-3s entre mensagens
   - Até 3 tentativas por mensagem
   - Salvamento automático no banco
   - Processamento sequencial (não paralelo)

3. **Benefícios**:
   - ✅ Evita bloqueio por spam
   - ✅ Não perde mensagens
   - ✅ Funciona mesmo offline
   - ✅ Auto-recuperação

---

## 🔄 Configurar no Sistema

Para que o sistema use este servidor, atualize a tabela `integration_whatsapp` no Supabase:

```sql
UPDATE integration_whatsapp 
SET api_url = 'http://localhost:3334'
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
```

Ou pelo Supabase Dashboard:
1. Acesse a tabela `integration_whatsapp`
2. Encontre o registro da MANIA DE MULHER
3. Edite o campo `api_url` para: `http://localhost:3334`
4. Marque `is_active` como `true`

---

## 🛠️ Solução de Problemas

### Servidor desconecta ao enviar mensagens

**Causa**: Rate limiting do WhatsApp (muitas mensagens rápido demais)

**Solução**: O servidor agora usa fila automática com delay de 2-3s entre mensagens

### Mensagens não estão sendo enviadas

```bash
# Verificar status
curl http://localhost:3334/status

# Verificar fila
curl http://localhost:3334/queue
```

Se houver mensagens na fila e `processing: false`, o servidor tentará processar no próximo heartbeat (15s)

### QR Code não aparece
```bash
# Limpar sessão antiga
rmdir /s /q .wwebjs_auth_mania_mulher  (Windows)
rm -rf .wwebjs_auth_mania_mulher       (Linux/Mac)

# Reiniciar
node server-whatsapp-mania-mulher.js
```

### Erro de porta em uso
```bash
# Verificar o que está usando a porta 3334
netstat -ano | findstr :3334  (Windows)
lsof -i :3334                  (Linux/Mac)

# Matar o processo
taskkill /PID <PID> /F         (Windows)
kill -9 <PID>                  (Linux/Mac)
```

---

## 📊 Monitoramento em Tempo Real

### Ver Status
```bash
curl http://localhost:3334/status

# Resposta esperada:
{
  "success": true,
  "tenant": "MANIA DE MULHER",
  "tenant_id": "08f2b1b9-3988-489e-8186-c60f0c0b0622",
  "status": "online",
  "whatsapp_state": "CONNECTED",
  "connected": true,
  "queue_size": 0,
  "processing_queue": false
}
```

### Ver Fila
```bash
curl http://localhost:3334/queue

# Resposta esperada:
{
  "success": true,
  "queue_size": 2,
  "processing": true,
  "items": [
    {
      "phone": "11999999999",
      "retries": 0,
      "timestamp": 1234567890,
      "type": "single"
    }
  ]
}
```

---

## 🔄 Como Funciona o Auto-Retry

1. Mensagem é adicionada à fila
2. Servidor tenta enviar
3. **Se falhar**:
   - Incrementa contador de tentativas
   - Aguarda 5s
   - Tenta novamente
4. **Após 3 falhas**:
   - Remove da fila
   - Salva erro no banco
   - Continua com próxima mensagem

---

## 💡 Dicas

✅ **Deixe o terminal aberto** enquanto usar o WhatsApp
✅ **Mantenha o celular conectado** à internet
✅ **Use broadcast** para envios em massa (usa fila automaticamente)
✅ **Monitore a fila** via `/queue` endpoint
✅ **Verifique logs** no terminal para debug

❌ **Não feche o terminal** enquanto usar o sistema
❌ **Não envie mais de 50 mensagens/minuto** (limite WhatsApp)
❌ **Não use múltiplos servidores** com mesmo número

---

## 📝 Logs

O servidor mostra logs detalhados:

- 📱 QR Code gerado
- 🔐 Autenticação bem-sucedida
- ✅ WhatsApp conectado
- 📥 Mensagem adicionada à fila (X itens)
- 📤 Enviando para 5511999999999
- ✅ Mensagem enviada com sucesso
- ⏱️ Aguardando 2s antes da próxima mensagem
- 💚 Heartbeat: Conexão ativa
- 🔄 Tentativa 2/3 falhou, tentando novamente

---

## 🆘 Suporte

Se tiver problemas:

1. ✅ Verifique os logs no terminal
2. ✅ Teste o endpoint `/status`
3. ✅ Verifique a fila com `/queue`
4. ✅ Limpe a sessão e tente novamente
5. ✅ Consulte `TROUBLESHOOTING.md` para problemas comuns

---

## 🎯 Por que este servidor é mais estável?

| Problema Antigo | Solução Nova |
|----------------|--------------|
| Desconecta ao enviar rápido | Fila com delay de 2-3s |
| Perde mensagens se offline | Fila persiste mensagens |
| Sem retry em falhas | Auto-retry (3x) |
| Rate limiting do WhatsApp | Delay inteligente |
| Desconexões não tratadas | Auto-reconexão |
| Sem monitoramento | Endpoints /status e /queue |
