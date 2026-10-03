-- 1) Validade do token do Instagram (renovação automática + aviso na tela)
ALTER TABLE public.integration_instagram
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_refreshed_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_last_error text;

-- 2) Ao concluir o cadastro (@instagram + telefone), atualiza pedidos/carrinhos abertos
--    criados no comentário, que estavam identificados só por "@usuario".
CREATE OR REPLACE FUNCTION public.link_instagram_orders(
  p_tenant_id uuid,
  p_instagram text,
  p_phone text,
  p_name text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handle text := lower('@' || regexp_replace(trim(p_instagram), '^@', ''));
  v_orders integer := 0;
BEGIN
  UPDATE public.carts
     SET customer_phone = p_phone
   WHERE tenant_id = p_tenant_id
     AND status = 'OPEN'
     AND lower(customer_phone) = v_handle;

  UPDATE public.orders
     SET customer_phone = p_phone,
         customer_name = COALESCE(NULLIF(trim(p_name), ''), customer_name)
   WHERE tenant_id = p_tenant_id
     AND is_paid = false
     AND COALESCE(is_cancelled, false) = false
     AND lower(customer_phone) = v_handle;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  RETURN v_orders;
END;
$$;

REVOKE ALL ON FUNCTION public.link_instagram_orders(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_instagram_orders(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.public_register_instagram(
  p_tenant_slug text, p_instagram text, p_phone text, p_name text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_clean_instagram text;
  v_clean_phone text;
  v_clean_name text;
  v_existing_by_ig bigint;
  v_existing_by_phone record;
  v_linked integer := 0;
BEGIN
  IF p_tenant_slug IS NULL OR p_instagram IS NULL OR p_phone IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Campos obrigatórios não preenchidos');
  END IF;

  v_clean_instagram := trim(regexp_replace(p_instagram, '^@', ''));
  IF v_clean_instagram = '' OR length(v_clean_instagram) > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Instagram inválido');
  END IF;

  v_clean_phone := trim(regexp_replace(p_phone, '\D', '', 'g'));
  IF length(v_clean_phone) < 10 OR length(v_clean_phone) > 15 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Telefone inválido');
  END IF;

  v_clean_name := CASE WHEN p_name IS NOT NULL AND trim(p_name) != '' THEN left(trim(p_name), 200) ELSE NULL END;

  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = p_tenant_slug AND is_active = true;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Loja não encontrada');
  END IF;

  SELECT id INTO v_existing_by_ig FROM public.customers
    WHERE tenant_id = v_tenant_id AND lower(instagram) = lower(v_clean_instagram);
  IF v_existing_by_ig IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Instagram já cadastrado');
  END IF;

  SELECT id, instagram INTO v_existing_by_phone FROM public.customers
    WHERE tenant_id = v_tenant_id AND phone = v_clean_phone;

  IF v_existing_by_phone.id IS NOT NULL THEN
    IF v_existing_by_phone.instagram IS NULL OR trim(v_existing_by_phone.instagram) = '' THEN
      UPDATE public.customers
        SET instagram = v_clean_instagram,
            name = COALESCE(v_clean_name, name),
            updated_at = now()
        WHERE id = v_existing_by_phone.id;
      v_linked := public.link_instagram_orders(v_tenant_id, v_clean_instagram, v_clean_phone, v_clean_name);
      RETURN jsonb_build_object('success', true, 'updated', true, 'orders_linked', v_linked);
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Telefone já cadastrado');
    END IF;
  END IF;

  INSERT INTO public.customers (tenant_id, instagram, phone, name)
    VALUES (v_tenant_id, v_clean_instagram, v_clean_phone, COALESCE(v_clean_name, v_clean_instagram));

  v_linked := public.link_instagram_orders(v_tenant_id, v_clean_instagram, v_clean_phone, v_clean_name);
  RETURN jsonb_build_object('success', true, 'updated', false, 'orders_linked', v_linked);
END;
$function$;

-- 3) Cron diário de renovação do token (reaproveita a autenticação do cron do auto-cancel).
DO $$
DECLARE
  v_cmd text;
BEGIN
  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'orders-auto-cancel-unpaid' LIMIT 1;
  IF v_cmd IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'instagram-refresh-tokens-daily') THEN
    PERFORM cron.schedule(
      'instagram-refresh-tokens-daily',
      '0 8 * * *',
      replace(v_cmd, 'orders-auto-cancel', 'instagram-refresh-tokens')
    );
  END IF;
END $$;
