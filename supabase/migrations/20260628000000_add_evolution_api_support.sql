-- Migration: adiciona suporte à Evolution API na tabela integration_whatsapp
-- O campo provider (já existente) controla o roteamento:
--   'zapi'      -> usa zapi_instance_id + zapi_token + zapi_client_token
--   'evolution' -> usa evolution_instance_name + EVOLUTION_API_KEY (variável de ambiente)

ALTER TABLE integration_whatsapp
  ADD COLUMN IF NOT EXISTS evolution_instance_name TEXT;

COMMENT ON COLUMN integration_whatsapp.evolution_instance_name 
  IS 'Nome da instância na Evolution API (usado quando provider = evolution)';
