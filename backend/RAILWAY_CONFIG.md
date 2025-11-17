# Configuração Railway - WhatsApp Backend

## Variáveis de Ambiente Obrigatórias

Configure no Railway → Settings → Variables:

```env
# Porta (Railway configura automaticamente)
PORT=8080

# Diretório de autenticação (será configurado pelo start.js)
AUTH_DIR=/data/.baileys_auth

# Supabase (obrigatório)
SUPABASE_URL=https://hxtbsieodbtzgcvvkeqx.supabase.co
SUPABASE_SERVICE_KEY=<sua-service-role-key>

# CORS (opcional)
ALLOWED_ORIGINS=*
```

## Volume para Persistência de Sessões

**IMPORTANTE**: Configure um volume no Railway para persistir as sessões do WhatsApp:

1. Acesse Railway → Settings → Volumes
2. Clique em "Add Volume"
3. Configure:
   - **Mount Path**: `/data`
   - **Size**: 1GB (mínimo)

Sem o volume, as sessões serão perdidas a cada deploy.

## Configuração de Recursos

Para evitar crashes por falta de recursos:

### CPU e Memória Recomendados
- **CPU**: 0.5-1 vCPU
- **Memory**: 512MB-1GB
- **Timeout**: 300s (5 minutos)

Configure em Railway → Settings → Resources

### Healthcheck

O Railway usa o endpoint `/health` para verificar a saúde do servidor:

```bash
curl https://backend-production-2599.up.railway.app/health
```

Resposta esperada:
```json
{
  "ok": true,
  "status": "online",
  "time": "2025-11-17T...",
  "version": "4.1",
  "uptime": 123.45,
  "memory": {
    "used": 85,
    "total": 128,
    "rss": 150
  },
  "tenants": {
    "total": 2,
    "online": 1,
    "connecting": 1
  }
}
```

## Troubleshooting

### SIGTERM e Crashes

Se o servidor estiver crasheando com SIGTERM:

1. **Verifique a memória**: O Railway mata processos que excedem o limite de memória
   - Aumente o limite em Settings → Resources
   - Monitore logs de heartbeat: `💓 Heartbeat - Uptime: XXXs | Mem: XXXmb`

2. **Verifique o volume**: Certifique-se de que `/data` está montado corretamente
   - O `start.js` tenta criar `/data/.baileys_auth`
   - Se falhar, usa um diretório local (não persistente)

3. **Logs úteis**:
```bash
# Ver logs do Railway
railway logs

# Filtrar por erros
railway logs --filter error

# Seguir logs em tempo real
railway logs --follow
```

### Erro: "npm error path /app"

Isso geralmente indica que o Railway reiniciou o processo durante uma operação. Soluções:

1. **Graceful Shutdown**: O `start.js` implementa shutdown gracioso
2. **Timeout maior**: Ajuste o timeout em Settings → Resources
3. **Health Check**: Certifique-se de que o `/health` está respondendo rapidamente

### Múltiplos Erros 405

Se você está recebendo múltiplos erros 405 consecutivos:

1. **Cooldown de 15 minutos**: O sistema ativa um cooldown após 3 erros 405
2. **IP bloqueado**: O WhatsApp pode ter bloqueado o IP do Railway temporariamente
3. **Aguarde**: Após 15 minutos, o sistema tenta reconectar automaticamente

Logs relevantes:
```
⚠️  Erro 405 (tentativa 1/3)
⚠️  Erro 405 (tentativa 2/3)
⚠️  3 erros 405 consecutivos - limpando sessão
⏰ Cooldown de 15 minutos ativado
```

### Alto Uso de Memória

Se ver warnings de memória:
```
⚠️  Alto uso de memória: 450MB heap
```

Soluções:
1. Aumentar limite de memória no Railway
2. Reduzir número de tenants simultâneos
3. Implementar limpeza periódica de sessões antigas

## Monitoramento

### Heartbeat Logs

A cada 5 minutos, o servidor loga:
```
💓 Heartbeat - Uptime: 300s | Mem: 85MB heap / 150MB RSS | Tenants: 2
```

Use isso para monitorar:
- **Uptime**: Tempo desde última reinicialização
- **Mem**: Uso de memória (heap = JavaScript, RSS = total do processo)
- **Tenants**: Quantos tenants têm conexões ativas

### Status Endpoints

```bash
# Status geral do servidor
curl https://backend-production-2599.up.railway.app/health

# Status de todos os tenants
curl https://backend-production-2599.up.railway.app/status

# Status de um tenant específico
curl https://backend-production-2599.up.railway.app/status/TENANT_ID
```

## Deploy

O Railway faz deploy automático quando você faz push para o repositório.

### Build Process
1. Railway detecta `package.json`
2. Executa `npm install`
3. Executa `npm start` (que roda `start.js`)
4. `start.js` configura o ambiente e inicia `server-multitenant-clean.js`

### Rollback

Se um deploy quebrar, você pode fazer rollback:

1. Railway → Deployments
2. Selecione um deployment anterior que funcionava
3. Clique em "Redeploy"

## Links Úteis

- **Dashboard Railway**: https://railway.app/dashboard
- **Logs**: https://railway.app/project/[project-id]/service/backend/logs
- **Metrics**: https://railway.app/project/[project-id]/service/backend/metrics
- **Supabase Dashboard**: https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx
