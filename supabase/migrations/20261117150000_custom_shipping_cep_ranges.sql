-- Frete personalizado por CEP ou faixa de CEP (coverage_type = 'cep').
-- Cada item é "INICIO-FIM" com 8 dígitos; CEP único tem início = fim (ex.: '60165270-60165270', '30000000-31999999').
alter table public.custom_shipping_options add column if not exists coverage_cep_ranges text[];
