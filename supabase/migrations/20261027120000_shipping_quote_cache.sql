-- Cache de cotação de frete por prefixo de CEP (5 primeiros dígitos) + faixa de peso. Só a service role acessa (RLS ligada, sem policy).
create table if not exists public.shipping_quote_cache (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  cep_prefix text not null,
  weight_key text not null,
  options jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, provider, cep_prefix, weight_key)
);
create index if not exists shipping_quote_cache_created_idx on public.shipping_quote_cache (created_at);
alter table public.shipping_quote_cache enable row level security;
