
-- 1) Para pares (legacy `-group` + canonical `@g.us`) do mesmo tenant: preserva invite_link do legacy quando o canonical está vazio, e apaga o legacy.
WITH pairs AS (
  SELECT l.id AS legacy_id, c.id AS canonical_id, l.invite_link AS legacy_link, c.invite_link AS canonical_link
  FROM public.fe_groups l
  JOIN public.fe_groups c
    ON c.tenant_id = l.tenant_id
   AND c.group_jid = regexp_replace(l.group_jid, '-group$', '') || '@g.us'
  WHERE l.group_jid LIKE '%-group'
)
UPDATE public.fe_groups g
SET invite_link = p.legacy_link
FROM pairs p
WHERE g.id = p.canonical_id
  AND (g.invite_link IS NULL OR g.invite_link = '')
  AND p.legacy_link IS NOT NULL
  AND p.legacy_link <> '';

DELETE FROM public.fe_groups l
USING public.fe_groups c
WHERE l.group_jid LIKE '%-group'
  AND c.tenant_id = l.tenant_id
  AND c.group_jid = regexp_replace(l.group_jid, '-group$', '') || '@g.us';

-- 2) Legacy remanescente sem par canônico: renomeia para o formato canônico
UPDATE public.fe_groups
SET group_jid = regexp_replace(group_jid, '-group$', '') || '@g.us'
WHERE group_jid LIKE '%-group';
