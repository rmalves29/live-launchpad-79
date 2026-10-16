-- Gateway do "Assinar" do site passa a ser o Asaas (link de pagamento de assinatura mensal, só cartão).
-- Depende de 20261013120200_assinaturas_pendentes.sql. Aditiva: não remove nada.
-- STATUS: NÃO APLICADA. Aguardando aprovação do Rafael.

begin;

alter table public.assinaturas_pendentes
  add column if not exists asaas_payment_link_id text unique,   -- id do link (checkout hospedado do Asaas)
  add column if not exists asaas_customer_id text,
  add column if not exists asaas_subscription_id text unique,   -- sub_... criada no 1º pagamento
  add column if not exists asaas_last_payment_id text;          -- pay_... mais recente já processada (idempotência)

create index if not exists assinaturas_pendentes_asaas_sub_idx on public.assinaturas_pendentes (asaas_subscription_id);

commit;

-- Rollback: alter table public.assinaturas_pendentes drop column asaas_payment_link_id, drop column asaas_customer_id, drop column asaas_subscription_id, drop column asaas_last_payment_id;
