-- Limpar dados fake inseridos anteriormente
DELETE FROM customer_whatsapp_groups; -- remover exemplos

-- Remover preenchimentos artificiais em orders/whatsapp_messages
UPDATE orders SET whatsapp_group_name = NULL WHERE whatsapp_group_name IN ('Grupo Bazar','Grupo Manual','Grupo Geral');
UPDATE whatsapp_messages SET whatsapp_group_name = NULL WHERE whatsapp_group_name IN ('Grupo Bazar','Grupo Manual','Grupo Geral');