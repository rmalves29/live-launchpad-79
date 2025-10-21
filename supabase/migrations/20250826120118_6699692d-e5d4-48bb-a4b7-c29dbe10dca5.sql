-- Atualiza endereço do remetente conforme dados informados pelo usuário
UPDATE public.frete_config
SET 
  remetente_nome = 'Mania de Mulher Acessórios',
  remetente_endereco_rua = 'Rua Gávea',
  remetente_endereco_numero = '337',
  remetente_endereco_comp = NULL,
  remetente_bairro = 'Lagoinha Leblon',
  remetente_cidade = 'Belo Horizonte',
  remetente_uf = 'MG',
  cep_origem = '31575060',
  updated_at = now()
WHERE id = (SELECT id FROM public.frete_config ORDER BY updated_at DESC LIMIT 1);

-- Opcional: garante que api_base_url não esteja vazia
UPDATE public.frete_config
SET api_base_url = COALESCE(api_base_url, 'https://melhorenvio.com.br/api')
WHERE id = (SELECT id FROM public.frete_config ORDER BY updated_at DESC LIMIT 1);