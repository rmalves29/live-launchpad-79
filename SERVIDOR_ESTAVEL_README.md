# 🚀 Servidor WhatsApp Estável - MANIA DE MULHER

## ✨ Melhorias de Estabilidade v2.0

### 🎯 Problema Resolvido
O servidor agora **não desconecta** mais ao enviar mensagens. Sistema de fila e retry implementado.

### 📋 Recursos Implementados

#### 1. **Sistema de Fila de Mensagens**
- Todas as mensagens são adicionadas a uma fila antes do envio
- Fila continua processando mesmo se houver falhas
- Mensagens não são perdidas se o WhatsApp estiver temporariamente offline

#### 2. **Auto-Retry Inteligente**
- 3 tentativas automáticas por mensagem
- Delay de 2 segundos entre mensagens
- Mensagens removidas da fila apenas após sucesso

#### 3. **Verificação de Conexão**
- Verifica estado antes de enviar
- Adiciona à fila se WhatsApp estiver offline
- Heartbeat a cada 15 segundos para monitorar conexão

#### 4. **Auto-Reconexão**
- Tenta reconectar automaticamente após desconexão
- Evita loops infinitos
- Processa fila automaticamente ao reconectar

### 🔌 Endpoints

#### `/status` - Status do Servidor
```json
{
  "success": true,
  "tenant": "MANIA DE MULHER",
  "status": "online",
  "connected": true,
  "queue_size": 0,
  "processing_queue": false
}
```

#### `/queue` - Ver Fila de Mensagens
```json
{
  "success": true,
  "queue_size": 5,
  "processing": false,
  "items": [
    {
      "phone": "5511999999999",
      "retries": 0,
      "timestamp": "2025-10-09T09:30:00.000Z",
      "type": "outgoing"
    }
  ]
}
```

#### `/send` - Enviar Mensagem
```json
{
  "number": "11999999999",
  "message": "Olá!"
}
```

Resposta com fila:
```json
{
  "success": true,
  "message": "Mensagem adicionada à fila",
  "phone": "5511999999999",
  "queued": true
}
```

#### `/broadcast` - Envio em Massa
```json
{
  "phones": ["11999999999", "11888888888"],
  "message": "Mensagem em massa"
}
```

Resposta:
```json
{
  "success": true,
  "message": "2 mensagens adicionadas à fila",
  "total": 2,
  "queue_size": 2
}
```

### 🚦 Como Funciona

1. **Envio de Mensagem**
   - Verifica se WhatsApp está conectado
   - Se sim: tenta enviar direto (2 tentativas)
   - Se falhar: adiciona à fila
   - Se offline: adiciona direto à fila

2. **Processamento da Fila**
   - Verifica conexão
   - Processa 1 mensagem por vez
   - Delay de 2 segundos entre mensagens
   - Retry até 3 vezes
   - Remove apenas após sucesso

3. **Monitoramento**
   - Heartbeat a cada 15 segundos
   - Atualiza status automaticamente
   - Inicia processamento da fila quando online

### ⚙️ Configuração

Porta: `3334`
Tenant: `MANIA DE MULHER`
Tenant ID: `08f2b1b9-3988-489e-8186-c60f0c0b0622`

### 🔧 Como Usar

1. **Iniciar Servidor**
```bash
node server-whatsapp-mania-mulher.js
```

ou no Windows:
```bash
start-mania-mulher.bat
```

2. **Escanear QR Code**
   - QR Code aparece no console
   - Escanear com WhatsApp
   - Aguardar conexão

3. **Verificar Status**
```bash
curl http://localhost:3334/status
```

4. **Ver Fila**
```bash
curl http://localhost:3334/queue
```

### 📝 Logs Importantes

- `📥 Adicionado à fila` - Mensagem adicionada
- `📤 Processando fila` - Iniciou envio
- `✅ Enviado da fila` - Enviado com sucesso
- `🔄 Tentativa X/3` - Tentando reenviar
- `✅ Heartbeat OK` - Conexão estável

### ⚠️ Troubleshooting

**WhatsApp desconecta ao enviar?**
- ✅ Agora não desconecta mais!
- Mensagens vão para fila automaticamente

**Mensagens não enviando?**
1. Verificar `/status` - deve estar `connected: true`
2. Verificar `/queue` - ver se há mensagens pendentes
3. Aguardar processamento automático

**QR Code não aparece?**
1. Parar servidor (Ctrl+C)
2. Deletar pasta `.wwebjs_auth_mania_mulher`
3. Reiniciar servidor

### 🎉 Benefícios

✅ Sem desconexões ao enviar
✅ Mensagens não são perdidas
✅ Auto-retry automático
✅ Fila persistente
✅ Monitoramento em tempo real
✅ Reconexão automática
✅ Envio em massa estável

### 📊 Performance

- **Delay entre mensagens**: 2 segundos
- **Heartbeat**: 15 segundos
- **Max retries**: 3 tentativas
- **Timeout reconexão**: 10 segundos

---

**Versão**: 2.0 Estável
**Data**: 09/10/2025
**Status**: ✅ Produção
