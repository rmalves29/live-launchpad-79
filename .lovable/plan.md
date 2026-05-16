Executar a edge function `cleanup-fe-group-events` manualmente agora, antes do cron agendado.

## Passos

1. **Dry-run primeiro** (segurança): chamar a função com `dry_run=true` para validar:
   - Conexão com Google Drive
   - Upload do CSV na pasta `1_VbPMQAci0g6knmx1fLbONwraB-m2hyo`
   - Sem deletar nada do banco

2. **Verificar resultado** na tabela `fe_group_events_backups` e no Google Drive.

3. **Execução real** (se dry-run OK): chamar sem `dry_run`, com `retention_days=30`. Isso vai:
   - Exportar todas as linhas de `fe_group_events` com `created_at < now() - 30 dias`
   - Subir CSV no Drive
   - Deletar as linhas em lotes de 5000

4. **Validar**: consultar `fe_group_events_backups` (última linha) e contagem de `fe_group_events` antes/depois.

## Comando técnico

```
POST https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/cleanup-fe-group-events
Body: {"retention_days": 30, "dry_run": true}
```

Depois sem `dry_run`.

## Confirmação necessária

Confirma que posso já executar **direto a versão real** (sem dry-run), já que a pasta do Drive já está confirmada? Ou prefere fazer o dry-run antes?