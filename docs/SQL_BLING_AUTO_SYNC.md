# Sincronização Automática de Pedidos com Bling

## Objetivo
Este SQL cria um trigger que sincroniza automaticamente os pedidos com a loja virtual do Bling assim que são criados no sistema.

## Como aplicar

1. Acesse o **Supabase Dashboard** do seu projeto
2. Vá em **SQL Editor**
3. Cole e execute o SQL abaixo:

```sql
-- Criar função que sincroniza pedido com Bling ao ser criado
CREATE OR REPLACE FUNCTION public.sync_order_to_bling_on_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_integration RECORD;
  v_supabase_url TEXT;
  v_response http_response;
BEGIN
  -- Buscar integração Bling do tenant
  SELECT * INTO v_integration
  FROM integration_bling
  WHERE tenant_id = NEW.tenant_id
    AND is_active = true
    AND sync_orders = true
    AND access_token IS NOT NULL;
  
  -- Se não há integração ativa, apenas retornar
  IF NOT FOUND THEN
    RAISE LOG 'Bling sync skipped: no active integration for tenant %', NEW.tenant_id;
    RETURN NEW;
  END IF;
  
  v_supabase_url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
  
  -- Chamar edge function para sincronizar pedido
  BEGIN
    SELECT * INTO v_response FROM http_post(
      v_supabase_url || '/functions/v1/bling-sync-orders',
      jsonb_build_object(
        'action', 'send_order',
        'order_id', NEW.id,
        'tenant_id', NEW.tenant_id
      )::text,
      'application/json'
    );
    
    RAISE LOG 'Bling sync triggered for order % - Status: %', NEW.id, v_response.status;
    
  EXCEPTION WHEN OTHERS THEN
    -- Em caso de erro, apenas logar (não bloquear a criação do pedido)
    RAISE LOG 'Bling sync error for order %: %', NEW.id, SQLERRM;
  END;
  
  RETURN NEW;
END;
$function$;

-- Criar trigger que dispara após inserção de pedido
DROP TRIGGER IF EXISTS trg_sync_order_to_bling ON public.orders;

CREATE TRIGGER trg_sync_order_to_bling
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_order_to_bling_on_create();

-- Comentário explicativo
COMMENT ON FUNCTION public.sync_order_to_bling_on_create() IS 
  'Sincroniza automaticamente novos pedidos com a loja virtual do Bling quando criados no sistema';
```

## Como funciona

1. **Quando um pedido é criado** (via WhatsApp, Manual, Live ou qualquer outro método), o trigger é disparado automaticamente
2. O trigger verifica se o tenant possui integração Bling ativa com `sync_orders = true`
3. Se sim, chama a Edge Function `bling-sync-orders` para enviar o pedido ao Bling
4. O pedido aparece na loja virtual do Bling imediatamente

## Pré-requisitos

- Integração Bling configurada e ativa
- `sync_orders` habilitado nas configurações da integração
- Token de acesso válido

## Verificar se está funcionando

Para verificar os logs do trigger:

```sql
SELECT * FROM postgres_logs 
WHERE event_message LIKE '%Bling sync%' 
ORDER BY timestamp DESC 
LIMIT 20;
```

## Remover o trigger (se necessário)

```sql
DROP TRIGGER IF EXISTS trg_sync_order_to_bling ON public.orders;
DROP FUNCTION IF EXISTS public.sync_order_to_bling_on_create();
```
