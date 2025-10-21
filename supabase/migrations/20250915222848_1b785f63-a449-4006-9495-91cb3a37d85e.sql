-- Criar tabela de integração Bling
CREATE TABLE IF NOT EXISTS public.bling_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  client_id TEXT,
  client_secret TEXT,
  access_token TEXT,
  refresh_token TEXT,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.bling_integrations ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Super admin can manage all bling integrations" 
ON public.bling_integrations 
FOR ALL 
USING (is_super_admin());

CREATE POLICY "Tenant users can manage their bling integrations" 
ON public.bling_integrations 
FOR ALL 
USING (tenant_id = get_current_tenant_id());

-- Trigger para updated_at
CREATE TRIGGER update_bling_integrations_updated_at
  BEFORE UPDATE ON public.bling_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();