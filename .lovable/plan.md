Aprovar e aplicar a reescrita da Edge Function `supabase/functions/sync-bling-tracking/index.ts` com as otimizações de performance já especificadas:

- Reduzir `SYNC_BATCH_LIMIT` de 120 para 40
- Adicionar `CONCURRENCY = 5` e `runConcurrent()` para processar pedidos em lotes paralelos
- Remover o `REQUEST_DELAY_MS` e o `await delay(150ms)` do loop sequencial
- Buscar todas as integrações Bling ativas em uma única query `.in("tenant_id", tenantIds)`
- Resolver tokens sequencialmente por tenant e armazenar em `Map<string, string>`
- Substituir o loop sequencial por `runConcurrent(orders, ..., CONCURRENCY)`
- Manter toda a lógica de retry em 429, refresh de token, update no banco e logs intacta

O código otimizado completo já foi fornecido na mensagem do usuário e será aplicado diretamente ao arquivo.