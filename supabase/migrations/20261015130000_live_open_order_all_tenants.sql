-- Pedido aberto na Loja da Live passa a valer para todas as lojas (e para as novas). Ninguem tinha pedido da live nos ultimos 7 dias.
ALTER TABLE public.tenants ALTER COLUMN live_open_order SET DEFAULT true;
UPDATE public.tenants SET live_open_order = true WHERE live_open_order IS DISTINCT FROM true;
