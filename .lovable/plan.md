## Plano

1. Atualizar a função SQL `public.send_whatsapp_on_item_added()` para calcular a quantidade correta antes de chamar a Edge Function.
2. Em `INSERT`, manter o envio de `NEW.qty`, pois é a primeira quantidade adicionada do produto.
3. Em `UPDATE`, enviar apenas o acréscimo real: `NEW.qty - OLD.qty`.
4. Ignorar o envio quando a alteração não representar aumento de quantidade, evitando mensagens indevidas.
5. Manter o restante do payload igual: produto, código, preço unitário, preço original, telefone e tenant.

## SQL que será aplicado

```sql
CREATE OR REPLACE FUNCTION public.send_whatsapp_on_item_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product RECORD;
  v_cart RECORD;
  v_supabase_url TEXT;
  v_response http_response;
  v_qty_to_send integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_qty_to_send := COALESCE(NEW.qty, 0) - COALESCE(OLD.qty, 0);
    IF v_qty_to_send <= 0 THEN
      RETURN NEW;
    END IF;
  ELSE
    v_qty_to_send := COALESCE(NEW.qty, 0);
    IF v_qty_to_send <= 0 THEN
      RETURN NEW;
    END IF;
  END IF;

  v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';

  SELECT id, name, code, price, promotional_price
  INTO v_product
  FROM products
  WHERE id = NEW.product_id;

  IF NOT FOUND THEN
    RAISE LOG 'Produto não encontrado: %', NEW.product_id;
    RETURN NEW;
  END IF;

  SELECT customer_phone, tenant_id
  INTO v_cart
  FROM carts
  WHERE id = NEW.cart_id;

  IF NOT FOUND THEN
    RAISE LOG 'Carrinho não encontrado: %', NEW.cart_id;
    RETURN NEW;
  END IF;

  RAISE LOG 'Enviando WhatsApp Z-API - Produto: %, Telefone: %, Tenant: %, Qtd enviada: %',
    v_product.code, v_cart.customer_phone, v_cart.tenant_id, v_qty_to_send;

  BEGIN
    SELECT * INTO v_response FROM http_post(
      v_supabase_url || '/functions/v1/zapi-send-item-added',
      jsonb_build_object(
        'tenant_id', v_cart.tenant_id,
        'customer_phone', v_cart.customer_phone,
        'product_name', v_product.name,
        'product_code', v_product.code,
        'quantity', v_qty_to_send,
        'unit_price', NEW.unit_price,
        'original_price', v_product.price
      )::text,
      'application/json'
    );

    RAISE LOG 'Z-API Item Added - Status: %, Response: %',
      v_response.status,
      COALESCE(substring(v_response.content, 1, 200), 'N/A');

  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Erro ao chamar Z-API item added: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
```

## Resultado esperado

Se a cliente já tinha 2 unidades no carrinho e adicionou mais 1, a mensagem passa a mostrar `Qtd: 1`, não `Qtd: 3`.