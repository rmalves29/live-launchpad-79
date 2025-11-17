# 🚀 Nova Arquitetura WhatsApp - v5.0 STABLE

## O que mudou?

Refatoração completa focada em **estabilidade, simplicidade e recuperação de erros**.

### Problemas resolvidos:
- ✅ Crashes SIGTERM no Railway eliminados
- ✅ Erros 405 tratados com cooldown inteligente  
- ✅ Timeouts configuráveis e conservadores
- ✅ Graceful shutdown implementado
- ✅ Logs mais claros e informativos
- ✅ Código simplificado (menos bugs)

## Arquitetura

```
Frontend
   ↓
Edge Function (whatsapp-proxy)
   ↓ [timeout: 45s]
Railway Backend (server-stable.js)
   ↓
WhatsApp (Baileys)
```

### Timeouts configurados:
- **Edge Function → Backend**: 45 segundos (connect), 20s (qr), 30s (reset)
- **Backend → WhatsApp**: 90 segundos (connect), 45s (keepalive)
- **Cooldown 405**: 15 minutos após erro
- **Reconnect**: Máximo 2 tentativas automáticas com 60s de intervalo

## Servidor Estável (server-stable.js)

### Características:

**1. Configurações Conservadoras**
```javascript
CONNECT_TIMEOUT_MS: 90_000,      // 90 segundos
KEEPALIVE_INTERVAL_MS: 45_000,   // 45 segundos
QR_TIMEOUT_MS: 120_000,           // 2 minutos
ERROR_405_COOLDOWN_MS: 900_000,   // 15 minutos
MAX_RECONNECT_ATTEMPTS: 2         // Máximo 2 tentativas
```

**2. Gerenciamento Simplificado**
- Classe `SimpleTenantManager` mais enxuta
- Menos estado mantido em memória
- Limpeza automática de recursos

**3. Tratamento de Erros Robusto**

#### Erro 405 (Connection Failure)
- IP bloqueado temporariamente pelo WhatsApp
- Sistema ativa cooldown de 15 minutos
- Limpa sessão automaticamente
- Frontend recebe status `429` com tempo restante

#### Erro 401/515 (Sessão Inválida)
- Limpa sessão corrompida
- Força geração de novo QR
- Não tenta reconectar (sessão inválida)

#### Outros Erros
- Até 2 tentativas automáticas de reconexão
- Intervalo de 60 segundos entre tentativas
- Após 2 falhas, aguarda novo `/connect`

**4. Health Check Expandido**
```bash
curl https://backend-production-2599.up.railway.app/health
```

Resposta:
```json
{
  "ok": true,
  "status": "online",
  "version": "5.0-stable",
  "uptime": 3600,
  "memory": {
    "heap": 85,
    "rss": 150
  },
  "tenants": {
    "total": 2,
    "online": 1
  }
}
```

## Edge Function Melhorada

### Características:

**1. Timeout Inteligente**
- Cada tipo de requisição tem seu timeout
- Previne Edge Function travada
- Mensagens de erro claras

**2. Tratamento de Erros**
```typescript
// Timeout configurável por tipo
- connect: 45s
- reset: 30s  
- qr/status: 20s
```

**3. Retry Automático**
- Edge Function não faz retry (evita loops)
- Retry é responsabilidade do frontend
- Erros são propagados com contexto

## Endpoints

### POST /connect
Inicia conexão WhatsApp.

**Request:**
```bash
curl -X POST https://backend.../connect \
  -H "x-tenant-id: TENANT_UUID"
```

**Response (sucesso):**
```json
{
  "ok": true,
  "tenantId": "...",
  "status": "connecting"
}
```

**Response (cooldown ativo):**
```json
{
  "ok": false,
  "error": "Cooldown ativo após erro 405",
  "cooldownRemaining": 10
}
```
*Status HTTP: 429*

### GET /qr
Obtém QR code.

**Request:**
```bash
curl https://backend.../qr \
  -H "x-tenant-id: TENANT_UUID"
```

**Response (QR disponível):**
```json
{
  "ok": true,
  "tenantId": "...",
  "qr": "string_do_qr",
  "qrDataURL": "data:image/png;base64,..."
}
```

**Response (QR não disponível ainda):**
*Status HTTP: 204 (No Content)*

**Response (cooldown ativo):**
```json
{
  "ok": false,
  "status": "cooldown",
  "cooldownRemaining": 10
}
```
*Status HTTP: 429*

**Response (cooldown expirou):**
```json
{
  "ok": false,
  "status": "reconnect_required",
  "message": "Cooldown expirou. Inicie nova conexão."
}
```

### GET /status/:tenantId
Verifica status da conexão.

**Response:**
```json
{
  "ok": true,
  "tenantId": "...",
  "status": "online",  // ou: connecting, qr_code, reconnecting, error, disconnected, not_found
  "connected": true
}
```

### POST /reset/:tenantId
Reseta sessão (força novo QR).

**Response:**
```json
{
  "ok": true,
  "message": "Sessão resetada"
}
```

### GET /health
Health check do servidor.

## Estados do Sistema

### Status possíveis:
- `connecting`: Iniciando conexão
- `qr_code`: QR code gerado, aguardando escaneamento
- `online`: Conectado e pronto
- `reconnecting`: Reconectando após erro temporário
- `error`: Erro (pode ter cooldown ativo)
- `disconnected`: Desconectado após múltiplas falhas
- `not_found`: Tenant nunca iniciou conexão

### Fluxo normal:
```
not_found → connecting → qr_code → online
```

### Fluxo com erro 405:
```
online → error (cooldown 15min) → reconnect_required → connecting → qr_code → online
```

### Fluxo com erro temporário:
```
online → reconnecting (1ª tentativa, 60s) → reconnecting (2ª tentativa, 60s) → disconnected
```

## Como Usar

### 1. Configurar Railway

**Variáveis de ambiente:**
```env
PORT=8080
AUTH_DIR=/data/.baileys_auth
SUPABASE_URL=https://hxtbsieodbtzgcvvkeqx.supabase.co
SUPABASE_SERVICE_KEY=<sua-key>
```

**Volume (recomendado):**
- Mount path: `/data`
- Size: 1GB mínimo

### 2. Deploy
```bash
# Railway faz deploy automático
# ou manual:
npm install
npm start
```

### 3. Testar
```bash
# 1. Health check
curl https://backend.../health

# 2. Iniciar conexão
curl -X POST https://backend.../connect \
  -H "x-tenant-id: TENANT_ID"

# 3. Obter QR
curl https://backend.../qr \
  -H "x-tenant-id: TENANT_ID"

# 4. Escanear QR no WhatsApp

# 5. Verificar status
curl https://backend.../status/TENANT_ID
```

## Troubleshooting

### ❌ Erro 405 imediatamente após conectar

**Causa:** IP do Railway bloqueado temporariamente pelo WhatsApp

**Solução:**
1. Sistema ativa cooldown de 15 minutos automaticamente
2. Aguarde o cooldown expirar
3. Tente novamente após 15 minutos
4. Se persistir, pode ser bloqueio mais longo do WhatsApp

**Prevenção:**
- Evite múltiplas conexões/desconexões rápidas
- Use `/reset` apenas quando necessário
- Mantenha sessões estáveis quando possível

### ❌ QR não aparece (Status 204)

**Causa:** WhatsApp ainda está gerando o QR

**Solução:**
1. Aguarde até 2 minutos
2. Frontend deve fazer polling a cada 3-5 segundos
3. Se após 2 minutos não aparecer, chamar `/reset` e tentar novamente

### ❌ "Reconnect required" ao buscar QR

**Causa:** Cooldown de 15 minutos expirou

**Solução:**
1. Frontend deve chamar `/connect` novamente
2. Não é erro, é indicação que pode tentar novamente

### ❌ Crashes com SIGTERM

**Causa:** Servidor antigo (server-multitenant-clean.js)

**Solução:**
1. Certifique-se de que `package.json` aponta para `server-stable.js`
2. Redeploy no Railway
3. Verifique logs: deve aparecer "v5.0 STABLE"

### ❌ Timeout ao conectar

**Causa:** Backend não responde em 45 segundos

**Solução:**
1. Verifique logs do Railway
2. Pode ser problema de rede Railway ↔ WhatsApp
3. Tente novamente (frontend deve ter retry)

### ❌ Memória alta (>400MB)

**Causa:** Muitos tenants conectados ou vazamento de memória

**Solução:**
1. Monitore `/health` para ver uso de memória
2. Considere aumentar memória no Railway
3. Implemente limpeza de sessões antigas (TODO)

## Migração da Versão Anterior

### 1. Backup (opcional)
```bash
# Se tiver sessões importantes, fazer backup do volume /data
```

### 2. Update package.json
```json
{
  "scripts": {
    "start": "node server-stable.js"
  }
}
```

### 3. Redeploy
```bash
git add .
git commit -m "Update to v5.0 stable"
git push
```

### 4. Verificar
```bash
curl https://backend.../health
# Deve retornar version: "5.0-stable"
```

### 5. Resetar sessões existentes
```bash
# Para cada tenant
curl -X POST https://backend.../reset/TENANT_ID
```

## Monitoramento

### Logs importantes:

**Startup:**
```
🚀 WhatsApp Multi-Tenant v5.0 STABLE
📂 Auth: /data/.baileys_auth
🌐 Port: 8080
⏱️  Connect timeout: 90s
🔄 Keepalive: 45s
```

**Conexão bem-sucedida:**
```
🔧 Criando sessão para: NOME_TENANT
✅ Estado carregado
🔑 Tem credenciais: NÃO
✅ Socket criado
📱 QR gerado para tenant_slug
✅ tenant_slug: CONECTADO
```

**Erro 405:**
```
❌ tenant_slug: DESCONECTADO
📊 Status Code: 405
💬 Erro: Connection Failure
⚠️  Erro 405: WhatsApp bloqueou o IP temporariamente
🗑️  Sessão limpa (erro 405)
```

**Reconexão:**
```
🔄 Tentativa 1/2 em 60s...
🔧 Criando sessão para: NOME_TENANT
```

### Métricas via /health:

Monitorar:
- `uptime`: Tempo desde último restart (quanto maior, mais estável)
- `memory.heap`: Uso de memória heap (<300MB é normal)
- `memory.rss`: Memória total do processo (<500MB é normal)
- `tenants.online`: Quantos tenants estão conectados

## Próximos Passos (Roadmap)

- [ ] Limpeza automática de sessões antigas (>30 dias sem uso)
- [ ] Metrics endpoint com histórico de erros
- [ ] Webhook para notificar frontend de mudanças de status
- [ ] Suporte a múltiplas instâncias (horizontal scaling)
- [ ] Dashboard de monitoramento em tempo real
