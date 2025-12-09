-- Atualiza configuração do frete com CNPJ e dados obrigatórios
UPDATE public.frete_config
SET 
  remetente_documento = '23059503000171',
  updated_at = now()
WHERE id = (SELECT id FROM public.frete_config ORDER BY updated_at DESC LIMIT 1);

-- Adiciona colunas para telefone e email do remetente se não existirem
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'frete_config' AND column_name = 'remetente_telefone') THEN
        ALTER TABLE public.frete_config ADD COLUMN remetente_telefone text;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'frete_config' AND column_name = 'remetente_email') THEN
        ALTER TABLE public.frete_config ADD COLUMN remetente_email text;
    END IF;
END $$;

-- Atualiza com telefone e email padrão (você pode alterar depois)
UPDATE public.frete_config
SET 
  remetente_telefone = '31999999999',
  remetente_email = 'contato@maniademulheracessorios.com.br',
  updated_at = now()
WHERE id = (SELECT id FROM public.frete_config ORDER BY updated_at DESC LIMIT 1);