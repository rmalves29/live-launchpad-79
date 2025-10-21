-- Verificar se a tabela customers tem a constraint correta para phone
-- Adicionar índice único para melhor performance na busca por telefone
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_phone 
ON customers(tenant_id, phone);

-- Adicionar comentário explicativo na tabela
COMMENT ON TABLE customers IS 'Tabela para armazenar dados dos clientes para carregamento automático no checkout';
COMMENT ON COLUMN customers.phone IS 'Telefone do cliente (chave de identificação)';
COMMENT ON COLUMN customers.name IS 'Nome completo do cliente';
COMMENT ON COLUMN customers.cpf IS 'CPF do cliente';
COMMENT ON COLUMN customers.cep IS 'CEP do endereço de entrega';
COMMENT ON COLUMN customers.street IS 'Rua/logradouro do endereço';
COMMENT ON COLUMN customers.number IS 'Número do endereço';
COMMENT ON COLUMN customers.complement IS 'Complemento do endereço';
COMMENT ON COLUMN customers.city IS 'Cidade do endereço';
COMMENT ON COLUMN customers.state IS 'Estado (UF) do endereço';