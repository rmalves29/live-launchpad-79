
-- 0) Add enum value (must be in its own statement, committed before use)
ALTER TYPE whatsapp_template_type ADD VALUE IF NOT EXISTS 'WAITLIST_AVAILABLE';
