-- Atualizar client_id correto para todas as integrações Bling
UPDATE bling_integrations 
SET 
  client_id = 'd1f9ca5cbaa7fd131da159a9afcf98a92d96c64',
  updated_at = now()
WHERE client_id IS NULL OR client_id != 'd1f9ca5cbaa7fd131da159a9afcf98a92d96c64';