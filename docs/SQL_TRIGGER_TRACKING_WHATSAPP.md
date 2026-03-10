# Trigger: Envio automático de rastreio via WhatsApp

Execute o SQL abaixo no SQL Editor do Supabase para criar o trigger que envia automaticamente o código de rastreio via WhatsApp quando qualquer integração (Bling, Melhor Envio, Mandae, etc.) atualizar o campo `melhor_envio_tracking_code` na tabela `orders`.

```sql
-- Função que dispara o envio de rastreio via WhatsApp
CREATE OR REPLACE FUNCTION public.send_tracking_whatsapp_on_update()
RETURNS trigger AS $$
BEGIN
  -- Só dispara quando o tracking_code muda de vazio/null para um valor
  IF (OLD.melhor_envio_tracking_code IS NULL OR OLD.melhor_envio_tracking_code = '')
     AND NEW.melhor_envio_tracking_code IS NOT NULL 
     AND NEW.melhor_envio_tracking_code != ''
  THEN
    PERFORM http_post(
      'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-send-tracking',
      jsonb_build_object(
        'order_id', NEW.id,
        'tenant_id', NEW.tenant_id,
        'tracking_code', NEW.melhor_envio_tracking_code,
        'shipped_at', now()::text
      )::text,
      'application/json'
    );
    
    RAISE LOG '[TRACKING-TRIGGER] Disparado envio WhatsApp para pedido #% - rastreio: %', NEW.id, NEW.melhor_envio_tracking_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger na tabela orders
DROP TRIGGER IF EXISTS trg_send_tracking_whatsapp ON public.orders;
CREATE TRIGGER trg_send_tracking_whatsapp
  AFTER UPDATE OF melhor_envio_tracking_code ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.send_tracking_whatsapp_on_update();
```

## Como funciona

1. Qualquer integração (Bling, Melhor Envio, Mandae, manual) atualiza o campo `melhor_envio_tracking_code`
2. O trigger detecta a mudança automaticamente
3. Chama a Edge Function `zapi-send-tracking` via HTTP
4. A função envia a mensagem de rastreio via Z-API para o WhatsApp da cliente
