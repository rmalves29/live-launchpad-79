ALTER TABLE public.fe_group_events ADD COLUMN campaign_id uuid NULL REFERENCES public.fe_campaigns(id) ON DELETE SET NULL, ADD COLUMN click_id uuid NULL REFERENCES public.fe_link_clicks(id) ON DELETE SET NULL;
ALTER TABLE public.fe_link_clicks ADD COLUMN matched_event_id uuid NULL REFERENCES public.fe_group_events(id) ON DELETE SET NULL;
CREATE INDEX fe_group_events_campaign_metrics_idx ON public.fe_group_events(tenant_id, campaign_id, event_type, created_at);
CREATE INDEX fe_link_clicks_redirect_time_idx ON public.fe_link_clicks(redirected_group_id, clicked_at);
CREATE UNIQUE INDEX fe_group_events_click_once_idx ON public.fe_group_events(click_id) WHERE click_id IS NOT NULL;
CREATE UNIQUE INDEX fe_link_clicks_event_once_idx ON public.fe_link_clicks(matched_event_id) WHERE matched_event_id IS NOT NULL;
CREATE INDEX fe_group_events_last_join_idx ON public.fe_group_events(tenant_id, group_id, phone, created_at DESC) WHERE event_type = 'join' AND campaign_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fe_attribute_join(event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev public.fe_group_events%ROWTYPE;
  chosen public.fe_link_clicks%ROWTYPE;
  previous_campaign uuid;
BEGIN
  SELECT * INTO ev FROM public.fe_group_events WHERE id = event_id FOR UPDATE;
  IF NOT FOUND OR ev.campaign_id IS NOT NULL OR ev.group_id IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fe_groups g WHERE g.id = ev.group_id AND g.tenant_id = ev.tenant_id) THEN RETURN; END IF;
  IF ev.event_type = 'join' THEN
    SELECT cl.* INTO chosen
    FROM public.fe_link_clicks cl
    JOIN public.fe_campaigns c ON c.id = cl.campaign_id AND c.tenant_id = ev.tenant_id
    WHERE cl.redirected_group_id = ev.group_id
      AND cl.clicked_at BETWEEN ev.created_at - interval '10 minutes' AND ev.created_at
      AND cl.matched_event_id IS NULL
    ORDER BY cl.clicked_at DESC, cl.id DESC
    LIMIT 1 FOR UPDATE OF cl SKIP LOCKED;
    IF NOT FOUND THEN RETURN; END IF;
    UPDATE public.fe_group_events SET campaign_id = chosen.campaign_id, click_id = chosen.id WHERE id = ev.id;
    UPDATE public.fe_link_clicks SET matched_event_id = ev.id WHERE id = chosen.id;
  ELSIF ev.event_type = 'leave' AND ev.phone IS NOT NULL THEN
    SELECT j.campaign_id INTO previous_campaign
    FROM public.fe_group_events j
    JOIN public.fe_campaigns c ON c.id = j.campaign_id AND c.tenant_id = ev.tenant_id
    WHERE j.tenant_id = ev.tenant_id AND j.group_id = ev.group_id AND j.phone = ev.phone
      AND j.event_type = 'join' AND j.campaign_id IS NOT NULL AND j.created_at <= ev.created_at
    ORDER BY j.created_at DESC, j.id DESC LIMIT 1;
    IF FOUND THEN
      UPDATE public.fe_group_events SET campaign_id = previous_campaign WHERE id = ev.id;
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.fe_attribute_join(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fe_attribute_join(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fe_attribute_group_event_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fe_attribute_join(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fe_attribute_group_event_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fe_attribute_group_event_trigger() TO service_role;
CREATE TRIGGER fe_attribute_group_event_after_insert AFTER INSERT ON public.fe_group_events
FOR EACH ROW WHEN (NEW.event_type IN ('join', 'leave')) EXECUTE FUNCTION public.fe_attribute_group_event_trigger();

DO $$
DECLARE event_row record;
BEGIN
  FOR event_row IN SELECT id FROM public.fe_group_events WHERE event_type = 'join' AND campaign_id IS NULL ORDER BY created_at ASC, id ASC LOOP
    PERFORM public.fe_attribute_join(event_row.id);
  END LOOP;
  FOR event_row IN SELECT id FROM public.fe_group_events WHERE event_type = 'leave' AND campaign_id IS NULL ORDER BY created_at ASC, id ASC LOOP
    PERFORM public.fe_attribute_join(event_row.id);
  END LOOP;
END;
$$;