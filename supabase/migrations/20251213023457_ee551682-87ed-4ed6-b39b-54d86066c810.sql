-- Atualizar public_base_url para o domínio de produção
UPDATE app_settings SET public_base_url = 'https://app.orderzaps.com' WHERE id = 1;

-- Se não existir registro, inserir
INSERT INTO app_settings (id, public_base_url) 
VALUES (1, 'https://app.orderzaps.com')
ON CONFLICT (id) DO UPDATE SET public_base_url = 'https://app.orderzaps.com';