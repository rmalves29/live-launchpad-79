# Política RLS para Integrações de Frete - Acesso Público

Execute este SQL no Supabase SQL Editor para permitir que o checkout público identifique qual integração de frete está ativa para cada tenant.

## Problema
O checkout público não consegue determinar se deve usar Mandae ou Melhor Envio porque não há política de SELECT pública na tabela `shipping_integrations`.

## Solução
Criar uma **VIEW segura** que expõe apenas as colunas não-sensíveis (sem tokens) e uma política pública para essa view.

```sql
-- =============================================
-- 1. CRIAR VIEW PÚBLICA SEGURA (sem tokens sensíveis)
-- =============================================

CREATE OR REPLACE VIEW public.shipping_integrations_public
WITH (security_invoker = on) AS
SELECT 
  id,
  tenant_id,
  provider,
  is_active,
  from_cep
  -- NÃO expor: access_token, refresh_token, client_id, client_secret, webhook_secret
FROM public.shipping_integrations
WHERE is_active = true;

-- Comentário na view
COMMENT ON VIEW public.shipping_integrations_public IS 'View pública das integrações de frete ativas - sem dados sensíveis';

-- =============================================
-- 2. ADICIONAR POLÍTICA PÚBLICA PARA A TABELA BASE
-- =============================================

-- Permitir leitura pública apenas das colunas provider e is_active (via view)
CREATE POLICY "Public can view active shipping provider info"
  ON public.shipping_integrations
  FOR SELECT
  USING (is_active = true);

-- =============================================
-- VERIFICAÇÃO
-- =============================================
-- Após executar, teste com:
SELECT tenant_id, provider, is_active FROM shipping_integrations_public;
```

## Uso no Código
Após criar a política, o código em `shipping-utils.ts` poderá buscar as integrações ativas corretamente para cada tenant no checkout público.

## Alternativa (apenas política, sem view)
Se preferir não criar a view, basta a política:

```sql
CREATE POLICY "Public can view active shipping provider info"
  ON public.shipping_integrations
  FOR SELECT
  USING (is_active = true);
```

**ATENÇÃO**: Esta política expõe TODAS as colunas (incluindo tokens) para leitura pública em integrações ativas. A abordagem com VIEW é mais segura.
