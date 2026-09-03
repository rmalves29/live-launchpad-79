# Trigger: Envio automático de rastreio via WhatsApp

Execute o SQL abaixo no SQL Editor do Supabase para criar o trigger que envia automaticamente o código de rastreio via WhatsApp somente quando uma integração confirmar a postagem em `tracking_posted`. Receber ou salvar apenas o código não dispara mensagem.

```sql
-- Função que dispara o envio de rastreio via WhatsApp
CREATE OR REPLACE FUNCTION public.send_tracking_whatsapp_on_update()
RETURNS trigger AS $$
BEGIN
  -- Só dispara com código e confirmação explícita de postagem
  IF NEW.melhor_envio_tracking_code IS NOT NULL
     AND NEW.melhor_envio_tracking_code <> ''
     AND NEW.tracking_posted = true
     AND (
       OLD.melhor_envio_tracking_code IS NULL
       OR OLD.melhor_envio_tracking_code = ''
       OR OLD.tracking_posted = false
     )
  THEN
    PERFORM net.http_post(
      url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/zapi-send-tracking',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'order_id', NEW.id,
        'tenant_id', NEW.tenant_id,
        'tracking_code', NEW.melhor_envio_tracking_code,
        'shipped_at', now()::text
      )
    );
    
    RAISE LOG '[TRACKING-TRIGGER] Postagem confirmada; envio WhatsApp para pedido #% - rastreio: %', NEW.id, NEW.melhor_envio_tracking_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger na tabela orders
DROP TRIGGER IF EXISTS trg_send_tracking_whatsapp ON public.orders;
CREATE TRIGGER trg_send_tracking_whatsapp
  AFTER UPDATE OF melhor_envio_tracking_code, tracking_posted ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.send_tracking_whatsapp_on_update();
```

## Como funciona

1. A integração grava `melhor_envio_tracking_code`, sem enviar mensagem
2. Quando a transportadora confirmar postagem, a integração marca `tracking_posted = true`
3. O trigger chama a Edge Function `zapi-send-tracking`
4. A função reconfirma no banco que o pedido está postado e só então envia Push/WhatsApp

Integrações atuais e futuras devem tratar geração de etiqueta e confirmação de postagem como eventos separados.
