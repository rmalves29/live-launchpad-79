-- Add whatsapp_group_name field to carts table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'carts' 
                   AND column_name = 'whatsapp_group_name') THEN
        ALTER TABLE carts ADD COLUMN whatsapp_group_name TEXT;
    END IF;
END $$;