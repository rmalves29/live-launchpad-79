-- Adicionar coluna para armazenar o nome amigável do grupo
ALTER TABLE customer_whatsapp_groups 
ADD COLUMN IF NOT EXISTS group_display_name TEXT;

-- Criar índice para melhorar performance nas buscas
CREATE INDEX IF NOT EXISTS idx_customer_whatsapp_groups_display_name 
ON customer_whatsapp_groups(group_display_name);

-- Comentário explicativo
COMMENT ON COLUMN customer_whatsapp_groups.group_display_name IS 'Nome amigável/display do grupo de WhatsApp';