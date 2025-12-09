-- Create complete freight configuration table
CREATE TABLE public.frete_config (
  id SERIAL PRIMARY KEY,
  api_base_url TEXT NOT NULL DEFAULT 'https://melhorenvio.com.br/api',
  localidade_retirada_url TEXT,
  client_id TEXT,
  client_secret TEXT,
  redirect_uri TEXT,
  cep_origem TEXT DEFAULT '31575060',
  remetente_nome TEXT,
  remetente_documento TEXT,
  remetente_endereco_rua TEXT,
  remetente_endereco_numero TEXT,
  remetente_endereco_comp TEXT,
  remetente_bairro TEXT,
  remetente_cidade TEXT,
  remetente_uf TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.frete_config ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public can manage frete config" 
ON public.frete_config 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create frete quotations table
CREATE TABLE public.frete_cotacoes (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT,
  cep_destino TEXT NOT NULL,
  peso NUMERIC NOT NULL,
  altura INTEGER NOT NULL,
  largura INTEGER NOT NULL,
  comprimento INTEGER NOT NULL,
  valor_declarado NUMERIC,
  servico_escolhido TEXT,
  valor_frete NUMERIC,
  prazo INTEGER,
  transportadora TEXT,
  raw_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.frete_cotacoes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public can manage frete cotacoes" 
ON public.frete_cotacoes 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create freight shipments table
CREATE TABLE public.frete_envios (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT,
  shipment_id TEXT,
  status TEXT DEFAULT 'pending',
  label_url TEXT,
  tracking_code TEXT,
  raw_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.frete_envios ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Public can manage frete envios" 
ON public.frete_envios 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create triggers for updated_at
CREATE TRIGGER update_frete_config_updated_at
BEFORE UPDATE ON public.frete_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_frete_envios_updated_at
BEFORE UPDATE ON public.frete_envios
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default config row
INSERT INTO public.frete_config (api_base_url, cep_origem) 
VALUES ('https://melhorenvio.com.br/api', '31575060');