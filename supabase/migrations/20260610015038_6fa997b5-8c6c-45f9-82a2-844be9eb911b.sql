ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS batch_id uuid;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant_type_batch
  ON public.whatsapp_messages (tenant_id, type, batch_id, created_at DESC)
  WHERE batch_id IS NOT NULL;