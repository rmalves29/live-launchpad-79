-- Atualizar todos os templates FINALIZAR para usar a URL correta
UPDATE public.whatsapp_templates 
SET content = REPLACE(content, 'https://app.orderzaps.com/checkout', 'https://live-launchpad-79.lovable.app/checkout')
WHERE type = 'FINALIZAR' AND content LIKE '%app.orderzaps.com%';

-- Atualizar outros conteúdos que possam ter a URL antiga
UPDATE public.whatsapp_templates 
SET content = REPLACE(content, 'app.orderzaps.com', 'live-launchpad-79.lovable.app')
WHERE content LIKE '%app.orderzaps.com%';