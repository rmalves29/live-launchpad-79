-- Inserir configuração de integração WhatsApp de exemplo
-- IMPORTANTE: Ajuste o api_url para o endereço real do seu servidor Node.js
-- e o tenant_id para o seu tenant correto

-- Exemplo de inserção (ajuste os valores conforme necessário):
-- INSERT INTO integration_whatsapp (tenant_id, instance_name, api_url, is_active, webhook_secret)
-- VALUES (
--   '08f2b1b9-3988-489e-8186-c60f0c0b0622'::uuid,
--   'Instância Principal',
--   'http://localhost:3333',
--   true,
--   'seu_webhook_secret_aqui'
-- );

-- Para visualizar tenants disponíveis:
-- SELECT id, name FROM tenants WHERE is_active = true;