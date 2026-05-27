## Diagnóstico

Verifiquei no banco e o trigger **já está com a lógica correta** (envia apenas o delta):

- `INSERT` em `cart_items` → envia `NEW.qty`
- `UPDATE OF qty` em `cart_items` (com `NEW.qty > OLD.qty`) → envia `NEW.qty - OLD.qty`

E a edge function `zapi-send-item-added` substitui `{{quantidade}}` por esse mesmo valor recebido.

Ou seja: se o cliente tinha 2 e adicionou +1, a mensagem mostra **1**, não 3.

## Possíveis causas de o cliente ainda ver o valor "somado"

1. A mensagem que ele recebeu é **anterior** à correção do trigger.
2. O cliente realmente pediu aquela quantidade num único evento (ex.: mandou `C123x3` → INSERT direto com qty=3 → mensagem mostra "3", o que está correto pela regra atual).
3. O template em uso não tem `{{quantidade}}` — outra variável (ex.: `{{qtd_aleatoria}}`, que sorteia 2 a 4) está aparecendo no lugar.

## Plano

1. **Reaplicar o SQL do trigger** (idempotente — não quebra nada se já estiver atualizado), garantindo que está com a regra do delta.
2. **Rodar SQL de verificação** para confirmar que o trigger ativo no banco é exatamente o que esperamos.
3. **Consultar as últimas mensagens `item_added`** do tenant Roanne/FL para ver o texto exato enviado e a `qty` registrada — isso elimina a dúvida se o problema é dado antigo ou regra nova.
4. Conferir se o template `ITEM_ADDED` da Roanne não está usando `{{qtd_aleatoria}}` por engano (essa variável é anti-bloqueio e sorteia 2 a 4 — pode ser a fonte do "3" visto antes).

## SQL para aplicar no Supabase SQL Editor

### 1) Reaplicar trigger com delta

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
  INTO v_product FROM products WHERE id = NEW.product_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT customer_phone, tenant_id
  INTO v_cart FROM carts WHERE id = NEW.cart_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

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
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Erro Z-API item added: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
```

### 2) Verificar últimas mensagens da Roanne / FL (substituir o `tenant_id`)

```sql
SELECT sent_at, product_name, message
FROM whatsapp_messages
WHERE tenant_id = '<UUID_DA_ROANNE_OU_FL>'
  AND type = 'item_added'
ORDER BY sent_at DESC
LIMIT 20;
```

### 3) Verificar template ITEM_ADDED em uso

```sql
SELECT content
FROM whatsapp_templates
WHERE tenant_id = '<UUID_DA_ROANNE_OU_FL>'
  AND type = 'ITEM_ADDED';
```
Se aparecer `{{qtd_aleatoria}}` no conteúdo, esse é o número "estranho" que sorteia 2 a 4 — basta o cliente trocar por `{{quantidade}}`.

## Resultado esperado

Após reaplicar o SQL acima, qualquer novo item adicionado dispara mensagem com a quantidade exata daquele evento (1 quando o cliente acrescentou 1, 3 quando ele mandou C123x3, etc.) — nunca o acumulado do carrinho.