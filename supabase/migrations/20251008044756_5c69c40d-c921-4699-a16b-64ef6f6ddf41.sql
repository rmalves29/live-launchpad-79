-- Configuração da integração WhatsApp para o servidor Node.js unificado
-- Corrigido: criar constraint UNIQUE antes do INSERT

-- Primeiro, adicionar constraint de unicidade se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'integration_whatsapp_tenant_id_key'
  ) THEN
    ALTER TABLE public.integration_whatsapp 
    ADD CONSTRAINT integration_whatsapp_tenant_id_key 
    UNIQUE (tenant_id);
  END IF;
END $$;

-- Garantir que a coluna tenant_id não seja nula
ALTER TABLE public.integration_whatsapp 
ALTER COLUMN tenant_id SET NOT NULL;

-- Agora inserir ou atualizar a integração WhatsApp para o tenant principal (app)
INSERT INTO public.integration_whatsapp (
  id,
  tenant_id,
  instance_name,
  api_url,
  webhook_secret,
  is_active,
  created_at,
  updated_at
)
VALUES (
  gen_random_uuid(),
  '08f2b1b9-3988-489e-8186-c60f0c0b0622'::uuid, -- Tenant ID padrão (app)
  'app', -- Nome da instância (TENANT_SLUG)
  'http://localhost:3333', -- URL do servidor Node.js
  'whatsapp-webhook-secret-2024', -- Secret para validação de webhooks
  true, -- Ativo por padrão
  now(),
  now()
)
ON CONFLICT (tenant_id) 
DO UPDATE SET
  instance_name = EXCLUDED.instance_name,
  api_url = EXCLUDED.api_url,
  is_active = true,
  updated_at = now();

-- Criar índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_integration_whatsapp_tenant_id 
ON public.integration_whatsapp(tenant_id) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_integration_whatsapp_instance_name 
ON public.integration_whatsapp(instance_name) 
WHERE is_active = true;

-- Inserir configuração para outros tenants ativos
INSERT INTO public.integration_whatsapp (
  id,
  tenant_id,
  instance_name,
  api_url,
  webhook_secret,
  is_active,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  t.id,
  t.slug,
  'http://localhost:' || (3333 + ROW_NUMBER() OVER (ORDER BY t.created_at))::text, -- Porta diferente para cada tenant
  'whatsapp-webhook-secret-2024',
  true,
  now(),
  now()
FROM public.tenants t
WHERE t.is_active = true
  AND t.id != '08f2b1b9-3988-489e-8186-c60f0c0b0622'::uuid -- Excluir tenant principal já inserido
  AND NOT EXISTS (
    SELECT 1 FROM public.integration_whatsapp 
    WHERE tenant_id = t.id
  )
ON CONFLICT (tenant_id) DO NOTHING;