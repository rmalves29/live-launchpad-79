# Tabela de Logs de Sincronização Bling

## Objetivo
Registrar todas as operações de sincronização com o Bling ERP (pedidos, produtos, etc.) com timestamp para rastreabilidade.

## Como aplicar

1. Acesse o **Supabase Dashboard** do seu projeto
2. Vá em **SQL Editor**
3. Cole e execute o SQL abaixo:

```sql
-- Criar tabela de logs de sincronização Bling
CREATE TABLE IF NOT EXISTS public.bling_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text NOT NULL DEFAULT 'order',
  entity_id text,
  bling_id text,
  status text NOT NULL DEFAULT 'success',
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para consultas rápidas
CREATE INDEX idx_bling_sync_logs_tenant_created ON public.bling_sync_logs(tenant_id, created_at DESC);
CREATE INDEX idx_bling_sync_logs_entity ON public.bling_sync_logs(entity_type, entity_id);

-- RLS
ALTER TABLE public.bling_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their bling logs"
  ON public.bling_sync_logs FOR SELECT
  USING (tenant_id = get_current_tenant_id() OR is_super_admin());

CREATE POLICY "System can insert bling logs"
  ON public.bling_sync_logs FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE public.bling_sync_logs IS 'Log de todas as operações de sincronização com o Bling ERP';
```

## Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | ID único do log |
| tenant_id | uuid | Empresa que fez a operação |
| action | text | Ação executada (send_order, force_resync_order, sync_all, send_product, etc.) |
| entity_type | text | Tipo de entidade (order, product, contact) |
| entity_id | text | ID da entidade no sistema (order.id, product.id) |
| bling_id | text | ID gerado no Bling |
| status | text | Resultado (success, error, skipped) |
| details | jsonb | Detalhes extras (mensagem de erro, dados enviados, etc.) |
| created_at | timestamptz | Data/hora do log |

## Consultas úteis

```sql
-- Pedidos sincronizados hoje por tenant
SELECT * FROM bling_sync_logs 
WHERE tenant_id = 'TENANT_UUID' 
  AND entity_type = 'order'
  AND created_at >= CURRENT_DATE
ORDER BY created_at DESC;

-- Erros de sincronização
SELECT * FROM bling_sync_logs 
WHERE status = 'error' 
ORDER BY created_at DESC 
LIMIT 50;
```
