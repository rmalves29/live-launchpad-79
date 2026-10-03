-- Loja da Live (página pública /t/:slug/live): configurações e reserva de carrinho.

-- Cupom: vale (ou não) sobre produtos que já estão em promoção.
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS apply_to_promotional boolean NOT NULL DEFAULT true;

-- Brinde: aplicado automaticamente ao bater o valor mínimo (ou só manualmente pelo lojista).
ALTER TABLE public.gifts
  ADD COLUMN IF NOT EXISTS auto_apply boolean NOT NULL DEFAULT true;

-- Reserva de estoque da Loja da Live: 'order' = só ao fazer o pedido; 'cart' = ao adicionar no carrinho.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS live_reserve_mode text NOT NULL DEFAULT 'order',
  ADD COLUMN IF NOT EXISTS live_cart_minutes integer NOT NULL DEFAULT 15;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_live_reserve_mode_check') THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_live_reserve_mode_check CHECK (live_reserve_mode IN ('order', 'cart'));
  END IF;
END $$;

-- Reservas de carrinho (modo 'cart'). Só a service role acessa (RLS ligado, sem policies).
CREATE TABLE IF NOT EXISTS public.live_cart_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  product_id bigint NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, session_id, product_id)
);
ALTER TABLE public.live_cart_reservations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_live_cart_reservations_expires ON public.live_cart_reservations (expires_at);

-- Devolve ao estoque as reservas vencidas (numa única instrução, sem corrida).
CREATE OR REPLACE FUNCTION public.live_release_expired_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer := 0;
BEGIN
  WITH d AS (
    DELETE FROM public.live_cart_reservations
     WHERE expires_at < now()
    RETURNING product_id, qty
  ), s AS (
    SELECT product_id, sum(qty)::integer AS q FROM d GROUP BY product_id
  )
  UPDATE public.products p
     SET stock = p.stock + s.q
    FROM s
   WHERE p.id = s.product_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.live_release_expired_reservations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.live_release_expired_reservations() TO service_role;

-- Roda a cada minuto.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-release-expired-reservations') THEN
    PERFORM cron.schedule('live-release-expired-reservations', '* * * * *', 'select public.live_release_expired_reservations()');
  END IF;
END $$;
