ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS auto_cancel_unpaid_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_cancel_unpaid_hours integer NOT NULL DEFAULT 24;

COMMENT ON COLUMN public.tenants.auto_cancel_unpaid_enabled IS 'Se true, pedidos nao pagos sao cancelados automaticamente apos o prazo configurado.';
COMMENT ON COLUMN public.tenants.auto_cancel_unpaid_hours IS 'Prazo em horas que um pedido pode aguardar pagamento antes do cancelamento automatico.';