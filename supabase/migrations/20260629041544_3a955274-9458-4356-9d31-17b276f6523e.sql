CREATE INDEX IF NOT EXISTS idx_fe_messages_tenant_created_at_desc
ON public.fe_messages (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fe_messages_pending_scheduled_at
ON public.fe_messages (status, scheduled_at)
WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fe_group_events_recent_dedupe
ON public.fe_group_events (tenant_id, group_jid, phone, event_type, created_at DESC);