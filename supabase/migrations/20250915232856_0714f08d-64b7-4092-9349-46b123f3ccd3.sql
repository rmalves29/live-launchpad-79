-- Remover tabelas não utilizadas

-- 1. Remover sistema de tags de clientes (não implementado na UI)
DROP TABLE IF EXISTS public.customer_tag_assignments CASCADE;
DROP TABLE IF EXISTS public.customer_tags CASCADE;

-- 2. Remover tabela de marketing em massa (não utilizada)
DROP TABLE IF EXISTS public.mkt_mm CASCADE;

-- As tabelas customer_whatsapp_groups, audit_logs e webhook_logs são mantidas pois:
-- - customer_whatsapp_groups: usada em relatórios
-- - audit_logs: essencial para auditoria do sistema
-- - webhook_logs: essencial para monitoramento de webhooks