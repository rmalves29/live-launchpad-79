# Renovação Automática de Tokens Bling

Este documento explica como configurar a renovação automática proativa dos tokens OAuth do Bling ERP.

## Por que é necessário?

O Bling API v3 usa OAuth2 com as seguintes limitações:
- **Access Token**: expira em ~6 horas
- **Refresh Token**: expira em 30 dias **se não for usado**

Se a integração ficar inativa por mais de 30 dias, o refresh token expira e o usuário precisa reautorizar manualmente.

## Solução: Cron Job para Renovação Proativa

A edge function `bling-refresh-tokens` renova automaticamente os tokens de **todos os tenants ativos**, garantindo que o refresh token nunca expire.

## Pré-requisitos

1. Ativar extensões no Supabase (se ainda não estiverem ativas):

```sql
-- Ativar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

## SQL para Criar o Cron Job

Execute o seguinte SQL no **Supabase Dashboard > SQL Editor**:

```sql
-- Renovação automática de tokens Bling a cada 7 dias (domingo às 03:00 UTC)
SELECT cron.schedule(
  'bling-refresh-tokens-weekly',
  '0 3 * * 0', -- Domingo às 03:00 UTC (00:00 horário de Brasília)
  $$
  SELECT
    net.http_post(
      url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-refresh-tokens',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);
```

## Alternativas de Frequência

### A cada 7 dias (Recomendado)
```sql
'0 3 * * 0' -- Domingo às 03:00 UTC
```

### A cada 3 dias (Mais frequente)
```sql
'0 3 */3 * *' -- A cada 3 dias às 03:00 UTC
```

### A cada 14 dias (Menos frequente)
```sql
'0 3 1,15 * *' -- Dias 1 e 15 de cada mês às 03:00 UTC
```

## Verificar Jobs Agendados

```sql
-- Listar todos os cron jobs
SELECT * FROM cron.job ORDER BY jobname;

-- Ver histórico de execuções
SELECT * FROM cron.job_run_details 
WHERE jobname = 'bling-refresh-tokens-weekly'
ORDER BY start_time DESC 
LIMIT 10;
```

## Remover o Cron Job

```sql
SELECT cron.unschedule('bling-refresh-tokens-weekly');
```

## Executar Manualmente

Para testar ou executar manualmente:

```bash
curl -X POST \
  'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-refresh-tokens' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

## Resposta Esperada

```json
{
  "message": "Renovação proativa de tokens concluída",
  "processed": 5,
  "success": 4,
  "errors": 1,
  "timestamp": "2026-01-24T10:00:00.000Z",
  "results": [
    {
      "tenant_id": "abc-123",
      "tenant_name": "Loja Exemplo",
      "success": true,
      "expires_at": "2026-01-24T16:00:00.000Z",
      "days_until_expiry": 30
    }
  ]
}
```

## Comportamento

1. A função busca todas as integrações Bling ativas
2. Para cada uma, renova o access_token e refresh_token
3. Se o refresh_token já expirou (30 dias sem uso), marca a integração como inativa
4. Registra o resultado de cada tenant no log

## Benefícios

- ✅ Tokens nunca expiram por inatividade
- ✅ Renovação automática sem intervenção manual
- ✅ Log detalhado de cada renovação
- ✅ Detecção automática de tokens expirados
