-- Adicionar flags de funcionalidades e limite de grupos na tabela tenants
ALTER TABLE tenants 
ADD COLUMN enable_live boolean NOT NULL DEFAULT true,
ADD COLUMN enable_sendflow boolean NOT NULL DEFAULT true,
ADD COLUMN max_whatsapp_groups integer DEFAULT NULL;

COMMENT ON COLUMN tenants.enable_live IS 'Flag para habilitar/desabilitar a funcionalidade Live';
COMMENT ON COLUMN tenants.enable_sendflow IS 'Flag para habilitar/desabilitar a funcionalidade SendFlow';
COMMENT ON COLUMN tenants.max_whatsapp_groups IS 'Limite máximo de grupos WhatsApp que aparecem no SendFlow (NULL = sem limite)';