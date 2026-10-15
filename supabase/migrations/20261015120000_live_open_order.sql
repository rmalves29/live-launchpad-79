-- Loja da Live: pedido aberto assim que a cliente adiciona ao carrinho (igual ao fluxo do grupo de WhatsApp).
-- Ligado por loja (padrao desligado): o pedido continua com evento INSTAGRAM_LIVE e origem live_shop, sem nome novo.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS live_open_order boolean NOT NULL DEFAULT false;

-- Com o pedido aberto, a cliente esta NA PAGINA da live: o aviso de WhatsApp "item adicionado" (um por item) so atrapalharia.
-- Para pedidos da Loja da Live de lojas com o modo ligado, nao dispara. Todo o resto continua igual.
CREATE OR REPLACE FUNCTION public.send_whatsapp_on_item_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  payload jsonb;
  v_customer_phone text;
  v_order_id bigint;
  v_source text;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.qty IS DISTINCT FROM NEW.qty OR OLD.product_id IS DISTINCT FROM NEW.product_id)) THEN
    -- Buscar telefone do carrinho e pedido associado (cart_items nao possui essas colunas)
    SELECT customer_phone INTO v_customer_phone FROM public.carts WHERE id = NEW.cart_id;
    SELECT id, source INTO v_order_id, v_source FROM public.orders WHERE cart_id = NEW.cart_id ORDER BY id DESC LIMIT 1;

    -- Loja da Live com pedido aberto ligado: sem aviso por item
    IF v_source = 'live_shop' AND COALESCE((SELECT t.live_open_order FROM public.tenants t WHERE t.id = NEW.tenant_id), false) THEN
      RETURN NEW;
    END IF;

    payload := jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'customer_phone', v_customer_phone,
      'product_name', COALESCE(NEW.product_name, ''),
      'product_code', COALESCE(NEW.product_code, ''),
      'quantity', NEW.qty,
      'unit_price', NEW.unit_price,
      'cart_id', NEW.cart_id,
      'order_id', v_order_id
    );

    -- Disparo assincrono via http_post. A funcao zapi-send-item-added ja roteia
    -- para Zapi ou Evolution conforme o provider configurado no tenant.
    -- Encapsulado em EXCEPTION para que a falha do WhatsApp NUNCA bloqueie a inclusao do item.
    BEGIN
      PERFORM net.http_post(
        url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-send-item-added',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := payload,
        timeout_milliseconds := 1500
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG '[send_whatsapp_on_item_added] http_post falhou (item gravado mesmo assim): %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
