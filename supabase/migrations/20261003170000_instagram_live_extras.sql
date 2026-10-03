ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS auto_cancel_live_minutes integer;

ALTER TABLE public.integration_instagram
  ADD COLUMN IF NOT EXISTS auto_reply_added boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_reply_added_text text,
  ADD COLUMN IF NOT EXISTS auto_reply_out_of_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_reply_out_of_stock_text text;

ALTER TABLE public.instagram_dm_log
  ADD COLUMN IF NOT EXISTS resent_at timestamptz;
