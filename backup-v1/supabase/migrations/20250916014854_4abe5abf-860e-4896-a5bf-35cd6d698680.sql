-- Garantir que as tabelas de integração tenham a estrutura correta e RLS configurado

-- Verificar e criar table integration_whatsapp se não existir
CREATE TABLE IF NOT EXISTS public.integration_whatsapp (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES auth.users(id),
  api_url TEXT,
  instance_name TEXT,
  webhook_secret TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Verificar e criar table payment_integrations se não existir
CREATE TABLE IF NOT EXISTS public.payment_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES auth.users(id),
  provider TEXT DEFAULT 'mercado_pago',
  access_token TEXT,
  public_key TEXT,
  client_id TEXT,
  client_secret TEXT,
  webhook_secret TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Verificar e criar table shipping_integrations se não existir
CREATE TABLE IF NOT EXISTS public.shipping_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES auth.users(id),
  provider TEXT DEFAULT 'melhor_envio',
  access_token TEXT,
  client_id TEXT,
  client_secret TEXT,
  webhook_secret TEXT,
  from_cep TEXT DEFAULT '31575060',
  sandbox BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Verificar e criar table bling_integrations se não existir
CREATE TABLE IF NOT EXISTS public.bling_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES auth.users(id),
  client_id TEXT,
  client_secret TEXT,
  access_token TEXT,
  refresh_token TEXT,
  environment TEXT DEFAULT 'sandbox',
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.integration_whatsapp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_integrations ENABLE ROW LEVEL SECURITY;

-- Criar políticas RLS para integration_whatsapp
DROP POLICY IF EXISTS "Users can manage their own WhatsApp integration" ON public.integration_whatsapp;
CREATE POLICY "Users can manage their own WhatsApp integration"
  ON public.integration_whatsapp
  FOR ALL
  USING (auth.uid() = tenant_id);

-- Criar políticas RLS para payment_integrations
DROP POLICY IF EXISTS "Users can manage their own payment integration" ON public.payment_integrations;
CREATE POLICY "Users can manage their own payment integration"
  ON public.payment_integrations
  FOR ALL
  USING (auth.uid() = tenant_id);

-- Criar políticas RLS para shipping_integrations
DROP POLICY IF EXISTS "Users can manage their own shipping integration" ON public.shipping_integrations;
CREATE POLICY "Users can manage their own shipping integration"
  ON public.shipping_integrations
  FOR ALL
  USING (auth.uid() = tenant_id);

-- Criar políticas RLS para bling_integrations
DROP POLICY IF EXISTS "Users can manage their own bling integration" ON public.bling_integrations;
CREATE POLICY "Users can manage their own bling integration"
  ON public.bling_integrations
  FOR ALL
  USING (auth.uid() = tenant_id);

-- Criar triggers para update automático do campo updated_at
CREATE OR REPLACE FUNCTION update_integration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar triggers em todas as tabelas de integração
DROP TRIGGER IF EXISTS update_integration_whatsapp_updated_at ON public.integration_whatsapp;
CREATE TRIGGER update_integration_whatsapp_updated_at
    BEFORE UPDATE ON public.integration_whatsapp
    FOR EACH ROW
    EXECUTE FUNCTION update_integration_updated_at();

DROP TRIGGER IF EXISTS update_payment_integrations_updated_at ON public.payment_integrations;
CREATE TRIGGER update_payment_integrations_updated_at
    BEFORE UPDATE ON public.payment_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_integration_updated_at();

DROP TRIGGER IF EXISTS update_shipping_integrations_updated_at ON public.shipping_integrations;
CREATE TRIGGER update_shipping_integrations_updated_at
    BEFORE UPDATE ON public.shipping_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_integration_updated_at();

DROP TRIGGER IF EXISTS update_bling_integrations_updated_at ON public.bling_integrations;
CREATE TRIGGER update_bling_integrations_updated_at
    BEFORE UPDATE ON public.bling_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_integration_updated_at();