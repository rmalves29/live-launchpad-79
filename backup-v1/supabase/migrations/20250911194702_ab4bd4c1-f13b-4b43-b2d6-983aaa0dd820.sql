-- Seed FINALIZAR template for all active tenants
INSERT INTO public.whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
SELECT 
  tenants.id,
  'FINALIZAR'::whatsapp_template_type,
  'Finalização de Compra',
  'Perfeita a sua escolha! 💖 Já deixei separada.
Para pagar agora: clique no link, coloque o seu telefone.
👉 https://app.orderzaps.com/checkout',
  now(),
  now()
FROM public.tenants
WHERE tenants.is_active = true
AND NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates t 
  WHERE t.type = 'FINALIZAR' AND t.tenant_id = tenants.id
);