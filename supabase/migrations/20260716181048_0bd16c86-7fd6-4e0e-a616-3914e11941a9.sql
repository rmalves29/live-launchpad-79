ALTER TABLE public.fe_campaign_groups
  ADD COLUMN IF NOT EXISTS weight_percent numeric(6,2) DEFAULT NULL,
  ADD CONSTRAINT fe_campaign_groups_weight_range
    CHECK (weight_percent IS NULL OR (weight_percent >= 0 AND weight_percent <= 100));