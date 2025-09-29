-- Criar template MSG_MASSA para todos os tenants existentes
INSERT INTO whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
SELECT 
  t.id as tenant_id,
  'MSG_MASSA' as type,
  'Mensagem em Massa' as title,
  'Olá! Esta é uma mensagem em massa.' as content,
  now() as created_at,
  now() as updated_at
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_templates wt 
  WHERE wt.tenant_id = t.id AND wt.type = 'MSG_MASSA'
);

-- Criar função para criar template MSG_MASSA automaticamente quando novo tenant é criado
CREATE OR REPLACE FUNCTION create_default_msg_massa_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
  VALUES (
    NEW.id,
    'MSG_MASSA',
    'Mensagem em Massa',
    'Olá! Esta é uma mensagem em massa.',
    now(),
    now()
  );
  
  RETURN NEW;
END;
$$;

-- Criar trigger para executar função ao inserir novo tenant
DROP TRIGGER IF EXISTS trigger_create_msg_massa_template ON tenants;
CREATE TRIGGER trigger_create_msg_massa_template
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION create_default_msg_massa_template();