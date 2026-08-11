UPDATE public.whatsapp_messages
SET delivery_status = 'SENT'
WHERE tenant_id = '365ba33f-40ce-4012-8e28-22f4a279772e'
  AND delivery_status = 'PENDING'
  AND zapi_message_id IS NOT NULL
  AND created_at > NOW() - INTERVAL '4 hours';