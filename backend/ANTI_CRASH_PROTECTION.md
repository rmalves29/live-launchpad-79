# Proteções Anti-Crash do Backend

## 🛡️ Proteções Implementadas

### 1. **Handlers de Erros Globais**
```javascript
process.on('uncaughtException', (error) => { /* log */ })
process.on('unhandledRejection', (reason, promise) => { /* log */ })
```
- Captura erros não tratados
- **NÃO encerra o processo** - apenas loga
- Evita crashes por exceções inesperadas

### 2. **Graceful Shutdown**
```javascript
process.on('SIGTERM', () => { /* fecha servidor graciosamente */ })
process.on('SIGINT', () => { /* fecha servidor graciosamente */ })
```
- Responde a sinais de término (SIGTERM, SIGINT)
- Fecha conexões ativas antes de sair
- Evita dados corrompidos

### 3. **Socket Error Handler**
```javascript
sock.ev.on('error', (error) => { /* log */ })
```
- Captura erros específicos do Baileys
- Evita que erros de socket crashem o servidor

### 4. **Limite de Reconexões**
- **Máximo: 3 tentativas** (reduzido de 5)
- **Delays progressivos**: 10s → 20s → 30s
- Após 3 falhas, aguarda nova requisição `/connect`
- Evita loops infinitos de reconexão

### 5. **Status Codes Específicos**
```javascript
// NÃO reconectar em casos específicos:
- DisconnectReason.loggedOut (401)
- Session Timed Out (440)
```

## 🔍 Como Debugar

### 1. **Verificar Logs do Railway**
Procure por estas mensagens:

**Conexão Fechada:**
```
❌ [TENANT]: CONEXÃO FECHADA
📊 Status Code: XXX
💬 Erro: [mensagem]
```

**Tentativas de Reconexão:**
```
🔄 Reconectar? true (tentativa 1/3)
⏰ Aguardando 10s antes de reconectar...
```

**Máximo Atingido:**
```
⛔ [TENANT]: Máximo de tentativas atingido (3)
💡 Aguardando nova solicitação de /connect para retentar
```

### 2. **Status Codes Comuns**

| Code | Significado | Ação |
|------|-------------|------|
| 401 | Logged Out | Precisa reautenticar (novo QR) |
| 440 | Session Timeout | Limpar sessão e reconectar |
| 500 | Internal Error | Verificar logs detalhados |
| 515 | Connection Lost | Problema de rede/firewall |

### 3. **Comandos Úteis**

**Verificar Health:**
```bash
curl https://api.orderzaps.com/health
```

**Verificar Status do Tenant:**
```bash
curl -H "X-Tenant-Id: TENANT_UUID" https://api.orderzaps.com/status-tenant
```

**Resetar Sessão:**
```bash
curl -X POST https://api.orderzaps.com/reset/TENANT_UUID
```

## 🚨 Erros Comuns

### 1. **Loop de Reconexão**
**Sintoma:** Backend reinicia constantemente
**Causa:** Baileys não consegue estabelecer conexão
**Solução:** 
- Verificar se o volume `/data` está montado
- Limpar sessão antiga: `POST /reset/:tenantId`
- Verificar logs para erro específico

### 2. **SIGTERM Repetido**
**Sintoma:** "npm error signal SIGTERM" nos logs
**Causa:** Container sendo parado pelo Railway (OOM ou crash)
**Solução:**
- Verificar uso de memória
- As proteções agora evitam crashes
- Verificar se há erros não tratados antes do SIGTERM

### 3. **QR Code Não Gerado**
**Sintoma:** Frontend mostra timeout
**Causa:** Backend está em loop de crash
**Solução:**
- Verificar se backend está estável (health check)
- Ver logs do Railway para erro específico
- Tentar reset da sessão

## 📝 Checklist de Troubleshooting

- [ ] Backend está respondendo? (`/health`)
- [ ] Volume `/data` está montado?
- [ ] Variáveis de ambiente configuradas?
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_SERVICE_KEY`
  - [ ] `AUTH_DIR=/data/.baileys_auth`
- [ ] Logs mostram erro específico?
- [ ] Tentou reset da sessão? (`POST /reset/:tenantId`)
- [ ] Tentou limpar volume e reiniciar?

## 🔄 Fluxo de Recuperação

1. **Identificar o erro** nos logs do Railway
2. **Resetar sessão** via `/reset/:tenantId`
3. **Aguardar 30s** para reconexões pararem
4. **Tentar conectar** novamente via `/connect`
5. **Se falhar 3x**, limpar volume `/data` e reiniciar

## 📊 Monitoramento

**Indicadores de Saúde:**
- ✅ Servidor responde `/health` → OK
- ✅ Status é "online" → Conectado
- ⚠️ Status é "reconnecting" → Tentando
- ❌ Status é "disconnected" → Atingiu limite
- ❌ Status é "error" → Erro crítico

**Ações por Status:**
- `online` → Tudo OK, pode enviar mensagens
- `qr_code` → Aguardando scan do QR
- `reconnecting` → Aguardar tentativas
- `disconnected` → Chamar `/connect` novamente
- `error` → Verificar logs e resetar
