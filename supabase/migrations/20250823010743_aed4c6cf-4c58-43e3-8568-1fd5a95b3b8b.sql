-- Remove colunas relacionadas aos Correios da tabela app_settings
ALTER TABLE app_settings 
DROP COLUMN IF EXISTS correios_origin_cep,
DROP COLUMN IF EXISTS correios_service_pac,
DROP COLUMN IF EXISTS correios_service_sedex;

-- Adicionar campos específicos do Melhor Envio
ALTER TABLE app_settings 
ADD COLUMN melhor_envio_from_cep text DEFAULT '31575060',
ADD COLUMN melhor_envio_env text DEFAULT 'sandbox';