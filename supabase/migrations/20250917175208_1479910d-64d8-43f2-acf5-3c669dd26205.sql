-- Criar tabela de cache de contatos do Bling
CREATE TABLE IF NOT EXISTS public.bling_contacts (
  tenant_id UUID NOT NULL,
  customer_key TEXT NOT NULL,           -- use CPF (limpo) ou email normalizado
  bling_contact_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, customer_key)
);

-- Enable RLS
ALTER TABLE public.bling_contacts ENABLE ROW LEVEL SECURITY;

-- Policies para acesso dos tenants
CREATE POLICY "Super admin can manage all bling contacts" 
ON public.bling_contacts 
FOR ALL 
USING (is_super_admin());

CREATE POLICY "Tenant users can manage their bling contacts" 
ON public.bling_contacts 
FOR ALL 
USING (tenant_id = get_current_tenant_id());