-- Add enum value for FINALIZAR in separate transaction
ALTER TYPE public.whatsapp_template_type ADD VALUE IF NOT EXISTS 'FINALIZAR';