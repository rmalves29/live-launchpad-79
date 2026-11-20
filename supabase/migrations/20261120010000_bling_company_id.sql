-- Etapa 3 · 3.4 — Bling: empresa (companyId dos avisos) por integração.
-- Duas lojas podem usar o mesmo aplicativo do Bling; a assinatura bate nas duas e o companyId decide.
-- Valores conferidos em 19/11/2026 pelos avisos de pedido (pedido do Bling ↔ pedido da loja no Cartzy).
alter table public.integration_bling add column if not exists bling_company_id text;
create unique index if not exists integration_bling_company_uidx
  on public.integration_bling (bling_company_id) where bling_company_id is not null;

update public.integration_bling set bling_company_id = 'e056cd502823e256fd5554983521a9d1'
 where tenant_id = '08f2b1b9-3988-489e-8186-c60f0c0b0622' and bling_company_id is null; -- MANIA DE MULHER
update public.integration_bling set bling_company_id = '86be12594b433e63514b3a78a249c4cd'
 where tenant_id = '5aed0ba3-18a8-4066-a1a0-823123d5429b' and bling_company_id is null; -- Pabeli
