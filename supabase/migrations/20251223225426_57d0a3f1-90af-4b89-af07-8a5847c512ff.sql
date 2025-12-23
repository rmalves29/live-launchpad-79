-- Remove a integração Z-API duplicada do tenant MANIA DE MULHER
-- mantendo apenas para OF Beauty
DELETE FROM integration_whatsapp 
WHERE tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622' 
AND zapi_instance_id = '3E9C945E4A48419E57601A87054F898A';