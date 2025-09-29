-- Etapa 1: Adicionar o novo valor ao enum
DO $$ 
DECLARE
  enum_name text;
BEGIN
  SELECT t.typname INTO enum_name
  FROM pg_type t
  JOIN pg_attribute a ON a.atttypid = t.oid
  JOIN pg_class c ON a.attrelid = c.oid
  WHERE c.relname = 'whatsapp_templates' 
    AND a.attname = 'type'
    AND t.typtype = 'e';
  
  IF enum_name IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = enum_name AND e.enumlabel = 'MSG_MASSA'
    ) THEN
      EXECUTE format('ALTER TYPE %I ADD VALUE ''MSG_MASSA''', enum_name);
    END IF;
  END IF;
END $$;