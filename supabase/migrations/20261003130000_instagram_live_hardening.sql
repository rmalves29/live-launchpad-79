-- Endurecimento do fluxo comentário -> venda do Instagram Live.

-- 1) Idempotência: um comentário (tenant + comment_id) só pode ser registrado uma vez.
--    Remove duplicados antigos (mantém o mais antigo) antes de criar o índice.
DELETE FROM public.instagram_live_comments a
USING public.instagram_live_comments b
WHERE a.comment_id IS NOT NULL
  AND a.tenant_id = b.tenant_id
  AND a.comment_id = b.comment_id
  AND (a.created_at, a.id) > (b.created_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_instagram_live_comments_tenant_comment
  ON public.instagram_live_comments (tenant_id, comment_id)
  WHERE comment_id IS NOT NULL;

-- 2) Reserva atômica de estoque: o primeiro comentário que chega leva a peça.
--    O UPDATE condicional serializa as disputas pela mesma linha; quem chega depois recebe NULL.
CREATE OR REPLACE FUNCTION public.reserve_product_stock(p_product_id bigint, p_qty integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_stock integer;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 THEN
    RETURN NULL;
  END IF;

  UPDATE public.products
     SET stock = stock - p_qty
   WHERE id = p_product_id
     AND stock >= p_qty
  RETURNING stock INTO v_new_stock;

  RETURN v_new_stock; -- NULL = estoque insuficiente
END;
$$;

CREATE OR REPLACE FUNCTION public.release_product_stock(p_product_id bigint, p_qty integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_stock integer;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 THEN
    RETURN NULL;
  END IF;

  UPDATE public.products
     SET stock = stock + p_qty
   WHERE id = p_product_id
  RETURNING stock INTO v_new_stock;

  RETURN v_new_stock;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_product_stock(bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_product_stock(bigint, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_product_stock(bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_product_stock(bigint, integer) TO service_role;

-- 3) Log de DM: registra por qual canal a mensagem saiu (private reply ou DM padrão).
ALTER TABLE public.instagram_dm_log ADD COLUMN IF NOT EXISTS channel text;
