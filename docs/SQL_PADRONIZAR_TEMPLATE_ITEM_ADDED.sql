-- =====================================================================
-- PADRONIZAÇÃO DO TEMPLATE "ITEM_ADDED" PARA TODAS AS EMPRESAS ATIVAS
-- =====================================================================
-- O nome da empresa e o slug do checkout são substituídos dinamicamente
-- a partir da tabela tenants. Cada loja recebe sua própria mensagem.
--
-- Modelo aplicado:
--
--   Passando para avisar que o item foi adicionado ao seu pedido na <NOME>. 🛍️
--
--   🆔 Código: {{codigo}}
--   📦 Qtd: {{qtd_aleatoria}}
--   💰 Valor: {{preco}}
--
--   Segue o link para pagamento: https://app.orderzaps.com/t/<SLUG>/checkout
--
--   Responda *SIM* continuar recebendo essa mensagem.✨
-- =====================================================================

BEGIN;

-- 1) ATUALIZA templates existentes
UPDATE public.whatsapp_templates wt
SET 
  content = 
    'Passando para avisar que o item foi adicionado ao seu pedido na ' || t.name || '. 🛍️' || E'\n\n' ||
    '🆔 Código: {{codigo}}' || E'\n' ||
    '📦 Qtd: {{qtd_aleatoria}}' || E'\n' ||
    '💰 Valor: {{preco}}' || E'\n\n' ||
    'Segue o link para pagamento: https://app.orderzaps.com/t/' || t.slug || '/checkout' || E'\n\n' ||
    'Responda *SIM* continuar recebendo essa mensagem.✨',
  updated_at = now()
FROM public.tenants t
WHERE wt.tenant_id = t.id
  AND wt.type = 'ITEM_ADDED'
  AND t.is_active = true;

-- 2) INSERE para tenants ativos que ainda não tinham o template ITEM_ADDED
INSERT INTO public.whatsapp_templates (tenant_id, type, title, content, created_at, updated_at)
SELECT 
  t.id,
  'ITEM_ADDED',
  'Item Adicionado ao Pedido',
  'Passando para avisar que o item foi adicionado ao seu pedido na ' || t.name || '. 🛍️' || E'\n\n' ||
    '🆔 Código: {{codigo}}' || E'\n' ||
    '📦 Qtd: {{qtd_aleatoria}}' || E'\n' ||
    '💰 Valor: {{preco}}' || E'\n\n' ||
    'Segue o link para pagamento: https://app.orderzaps.com/t/' || t.slug || '/checkout' || E'\n\n' ||
    'Responda *SIM* continuar recebendo essa mensagem.✨',
  now(),
  now()
FROM public.tenants t
WHERE t.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_templates wt2
    WHERE wt2.tenant_id = t.id AND wt2.type = 'ITEM_ADDED'
  );

-- Verificação rápida
SELECT t.name, t.slug, LEFT(wt.content, 80) AS preview
FROM public.whatsapp_templates wt
JOIN public.tenants t ON t.id = wt.tenant_id
WHERE wt.type = 'ITEM_ADDED' AND t.is_active = true
ORDER BY t.name;

COMMIT;
