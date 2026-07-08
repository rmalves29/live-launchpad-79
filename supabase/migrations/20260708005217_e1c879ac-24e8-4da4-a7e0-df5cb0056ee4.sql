UPDATE public.tenants
SET enabled_integrations = COALESCE(enabled_integrations, '{}'::jsonb) || jsonb_build_object('frenet', true)
WHERE enabled_integrations IS NULL
   OR NOT (enabled_integrations ? 'frenet')
   OR (enabled_integrations->>'frenet') <> 'true';