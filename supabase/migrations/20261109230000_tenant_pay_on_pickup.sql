-- "Pagar na retirada": o dono da loja liga nas Configurações; no checkout a opção só aparece com frete Retirada.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS pay_on_pickup_enabled boolean NOT NULL DEFAULT false;

-- O checkout público lê a chave pela view tenants_public (colunas novas entram no fim da lista).
CREATE OR REPLACE VIEW public.tenants_public WITH (security_invoker = false) AS
 SELECT id,
    name,
    slug,
    logo_url,
    primary_color,
    secondary_color,
    is_active,
    enable_live,
    enable_sendflow,
    max_whatsapp_groups,
    company_name,
    company_address,
    company_number,
    company_complement,
    company_district,
    company_city,
    company_state,
    company_cep,
    pay_on_pickup_enabled
   FROM public.tenants
  WHERE is_active = true;
