-- ═════════════════════════════════════════════════════════════════════════════
-- Assinatura direta pelo site (cartzy.com.br/assinar) · cadastro pendente até o pagamento
-- STATUS: NÃO APLICADA. Aguardando aprovação do Rafael.
--
-- Regra do Rafael: "antes de pagar, abre e pede os dados para acesso; ela paga e libera o acesso.
-- O acesso SÓ é criado após o pagamento."
--   1. /assinar grava aqui um cadastro PENDENTE (sem auth user, sem tenant, sem senha).
--   2. A função assinar-site cria um LINK DE PAGAMENTO de assinatura no Pagar.me (checkout hospedado:
--      a cliente paga na página do Pagar.me; nenhum dado de pagamento passa pelo site) e guarda o link aqui.
--   3. O webhook pagarme-subscription-webhook, no 1º pagamento aprovado, provisiona a conta
--      (tenant + auth user + profile, mesmo padrão da tela Empresas) e grava tenant_id/user_id aqui.
--
-- Tabelas existentes usadas (leitura em 13/10/2026): tenants, profiles (role user_role:
-- super_admin|tenant_admin|staff), subscription_recurrences (interval_months 1|6|12), webhook_logs.
-- Esta migração NÃO altera nenhuma delas.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.assinaturas_pendentes (
  id                      uuid primary key default gen_random_uuid(),
  token                   text not null unique,              -- 32 bytes hex; acompanha a cliente no navegador
  status                  text not null default 'pending',
  -- dados de acesso (sem senha: ela define pelo link depois do pagamento)
  nome                    text not null,
  email                   text not null,                     -- minúsculo
  whatsapp                text not null,                     -- 55DDNÚMERO
  loja_nome               text not null,
  documento               text not null,                     -- só dígitos (CPF 11 ou CNPJ 14)
  documento_tipo          text not null,
  aceite_termos_em        timestamptz not null,
  -- oferta decidida NO SERVIDOR (nunca vem do corpo da requisição)
  plano_preco             numeric not null default 499,
  implantacao_valor       numeric not null default 0,        -- 0 com promoção ligada, 600 desligada
  -- Pagar.me
  pagarme_payment_link_id text unique,                       -- pl_... (checkout hospedado do Pagar.me)
  checkout_url            text,                              -- https://payment-link.pagar.me/pl_...
  pagarme_customer_code   text unique,                       -- ctz-site-<id>: liga o webhook a este cadastro
  pagarme_customer_id     text,
  pagarme_card_id         text,
  pagarme_subscription_id text unique,
  pagarme_code            text unique,
  pagarme_order_id        text,
  card_brand              text,
  card_last4              text,
  tentativas_pagamento    integer not null default 0,
  falha_motivo            text,
  -- provisionamento (preenchido só pelo webhook, depois do pagamento)
  tenant_id               uuid references public.tenants(id) on delete set null,
  user_id                 uuid,
  paid_at                 timestamptz,
  provisioned_at          timestamptz,
  link_senha_enviado_em   timestamptz,
  -- atribuição e eventos (03-ads-trafego.md)
  attribution             jsonb not null default '{}'::jsonb, -- utm_*, gclid, gbraid, wbraid, fbclid, fbp, fbc, ga_client_id
  event_id                text,                              -- base dos event_id de InitiateCheckout/Subscribe
  ip_hash                 text,
  user_agent              text,
  expires_at              timestamptz not null default (now() + interval '24 hours'),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint assinaturas_pendentes_status_check
    check (status in ('pending','checkout','processing','failed','paid','provisioning','provisioned','needs_review','expired','canceled')),
  constraint assinaturas_pendentes_doc_check
    check ((documento_tipo = 'CPF' and documento ~ '^[0-9]{11}$') or (documento_tipo = 'CNPJ' and documento ~ '^[0-9]{14}$')),
  constraint assinaturas_pendentes_email_check check (email = lower(email))
);

comment on table public.assinaturas_pendentes is
  'Cadastro de quem assina pelo site, antes do pagamento. Nenhum acesso é criado aqui; o webhook do Pagar.me provisiona depois do 1º pagamento aprovado.';
comment on column public.assinaturas_pendentes.status is
  'pending: dados preenchidos · checkout: link do Pagar.me gerado, cliente pagando lá · processing: assinatura criada, aguardando a cobrança · failed: pagamento recusado (pode tentar de novo) · paid/provisioning: pago, criando a conta · provisioned: conta criada · needs_review: e-mail já existia ou erro no provisionamento (Rafael resolve) · expired/canceled';

create index if not exists assinaturas_pendentes_status_idx on public.assinaturas_pendentes (status, created_at desc);
create index if not exists assinaturas_pendentes_email_idx on public.assinaturas_pendentes (email);

create or replace function public.assinaturas_pendentes_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists assinaturas_pendentes_touch on public.assinaturas_pendentes;
create trigger assinaturas_pendentes_touch before update on public.assinaturas_pendentes
  for each row execute function public.assinaturas_pendentes_touch();

-- Só o servidor (service role) lê e grava. Sem policies de propósito.
alter table public.assinaturas_pendentes enable row level security;
revoke all on public.assinaturas_pendentes from anon, authenticated;
revoke all on function public.assinaturas_pendentes_touch() from public, anon, authenticated;

commit;

-- Rollback: drop table public.assinaturas_pendentes; drop function public.assinaturas_pendentes_touch();
