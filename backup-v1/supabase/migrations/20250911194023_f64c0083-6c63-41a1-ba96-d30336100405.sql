-- Inserir template FINALIZAR se não existir
INSERT INTO public.whatsapp_templates (type, title, content, tenant_id, created_at, updated_at)
SELECT 
  'FINALIZAR',
  'Finalização de Compra',
  'Perfeita a sua escolha! 💖 Já deixei separada.
Para pagar agora: clique no link, coloque o seu telefone.
👉 https://app.orderzaps.com/checkout',
  id,
  now(),
  now()
FROM public.tenants
WHERE is_active = true
AND NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates 
  WHERE type = 'FINALIZAR' AND tenant_id = tenants.id
);