-- Atualizar a integração existente para ter um loja_id padrão se não tiver
UPDATE bling_integrations 
SET loja_id = '1'  -- ID padrão, usuário pode alterar depois
WHERE loja_id IS NULL AND is_active = true;