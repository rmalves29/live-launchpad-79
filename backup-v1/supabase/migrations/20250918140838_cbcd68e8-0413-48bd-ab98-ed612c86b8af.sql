-- Remover trigger e função primeiro
DROP TRIGGER IF EXISTS sync_company_data_trigger ON tenants;
DROP FUNCTION IF EXISTS sync_company_data_to_integrations() CASCADE;

-- Remover tabelas relacionadas ao Melhor Envio e Bling
DROP TABLE IF EXISTS bling_contacts CASCADE;
DROP TABLE IF EXISTS bling_integrations CASCADE;
DROP TABLE IF EXISTS integration_me CASCADE;
DROP TABLE IF EXISTS frete_config CASCADE;
DROP TABLE IF EXISTS frete_cotacoes CASCADE;
DROP TABLE IF EXISTS frete_envios CASCADE;

-- Remover colunas da tabela app_settings relacionadas ao Melhor Envio
ALTER TABLE app_settings 
DROP COLUMN IF EXISTS melhor_envio_env,
DROP COLUMN IF EXISTS melhor_envio_from_cep;

-- Limpar dados da tabela webhook_logs relacionados
DELETE FROM webhook_logs WHERE webhook_type IN ('bling', 'melhor_envio', 'melhor_envio_tracking');

-- Limpar mensagens do WhatsApp relacionadas aos sistemas removidos
DELETE FROM whatsapp_messages WHERE type = 'system_log' AND (
  message LIKE '%Melhor Envio%' OR 
  message LIKE '%Bling%' OR
  message LIKE '%ME %'
);