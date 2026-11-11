-- Criação automática da remessa dos Correios quando o pedido é pago.
-- Controle por pedido: reserva o pedido antes de processar (nunca cria duas remessas) e guarda o motivo quando falha.
CREATE TABLE IF NOT EXISTS public.correios_auto_remessa_log (
  order_id bigint PRIMARY KEY,
  tenant_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'processando',   -- processando | criada | erro
  attempts integer NOT NULL DEFAULT 0,
  error text,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.correios_auto_remessa_log ENABLE ROW LEVEL SECURITY;
-- sem políticas: só a função do servidor (service role) lê e grava

CREATE INDEX IF NOT EXISTS correios_auto_remessa_log_tenant_idx ON public.correios_auto_remessa_log (tenant_id, status);
