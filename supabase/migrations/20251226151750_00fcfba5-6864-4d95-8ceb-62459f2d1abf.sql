-- Tabela para integração com Bling ERP
CREATE TABLE public.integration_bling (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Credenciais OAuth2 do Bling
  client_id TEXT,
  client_secret TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Flags de funcionalidades ativas
  sync_orders BOOLEAN NOT NULL DEFAULT false,
  sync_products BOOLEAN NOT NULL DEFAULT false,
  sync_stock BOOLEAN NOT NULL DEFAULT false,
  sync_invoices BOOLEAN NOT NULL DEFAULT false,
  sync_marketplaces BOOLEAN NOT NULL DEFAULT false,
  sync_ecommerce BOOLEAN NOT NULL DEFAULT false,
  sync_logistics BOOLEAN NOT NULL DEFAULT false,
  
  -- Configurações adicionais
  environment TEXT NOT NULL DEFAULT 'production',
  webhook_secret TEXT,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Apenas uma integração Bling por tenant
  CONSTRAINT integration_bling_tenant_unique UNIQUE (tenant_id)
);

-- Habilitar RLS
ALTER TABLE public.integration_bling ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança
CREATE POLICY "Tenant users can manage their Bling integration"
ON public.integration_bling
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.tenant_id = integration_bling.tenant_id OR profiles.role = 'super_admin')
  )
);

CREATE POLICY "Tenant users can view their Bling integration"
ON public.integration_bling
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.tenant_id = integration_bling.tenant_id OR profiles.role = 'super_admin')
  )
);

-- Trigger para updated_at
CREATE TRIGGER update_integration_bling_updated_at
BEFORE UPDATE ON public.integration_bling
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();