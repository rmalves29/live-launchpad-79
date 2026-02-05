# SQL - Sistema de Proteção por Consentimento

Execute este SQL no Supabase SQL Editor para habilitar o sistema de proteção por consentimento.

## 1. Adicionar campos na tabela customers

```sql
-- Adiciona campos de consentimento na tabela customers
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS consentimento_ativo BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS data_permissao TIMESTAMPTZ;

-- Índice para consultas de consentimento
CREATE INDEX IF NOT EXISTS idx_customers_consentimento ON customers(tenant_id, consentimento_ativo, data_permissao);

-- Comentários
COMMENT ON COLUMN customers.consentimento_ativo IS 'Indica se o cliente deu permissão para receber mensagens com link';
COMMENT ON COLUMN customers.data_permissao IS 'Data/hora em que o cliente deu a permissão (expira em 3 dias)';
```

## 2. Adicionar campos na tabela integration_whatsapp

```sql
-- Adiciona campos de proteção por consentimento
ALTER TABLE integration_whatsapp
ADD COLUMN IF NOT EXISTS consent_protection_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS template_solicitacao TEXT,
ADD COLUMN IF NOT EXISTS template_com_link TEXT;

-- Comentários
COMMENT ON COLUMN integration_whatsapp.consent_protection_enabled IS 'Ativa o modo de proteção por consentimento (2 etapas)';
COMMENT ON COLUMN integration_whatsapp.template_solicitacao IS 'Template A - Mensagem de solicitação de permissão';
COMMENT ON COLUMN integration_whatsapp.template_com_link IS 'Template B - Mensagem com link de checkout';
```

## 3. Script completo para execução única

```sql
-- ============================================================
-- SISTEMA DE PROTEÇÃO POR CONSENTIMENTO
-- Execute este bloco inteiro no SQL Editor do Supabase
-- ============================================================

-- 1. Tabela customers
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS consentimento_ativo BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS data_permissao TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_consentimento 
ON customers(tenant_id, consentimento_ativo, data_permissao);

-- 2. Tabela integration_whatsapp
ALTER TABLE integration_whatsapp
ADD COLUMN IF NOT EXISTS consent_protection_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS template_solicitacao TEXT,
ADD COLUMN IF NOT EXISTS template_com_link TEXT;

-- Confirmação
SELECT 'Campos de consentimento adicionados com sucesso!' as status;
```

## Como funciona o sistema

1. **Toggle desativado** (padrão): Funciona como antes - envia mensagem padrão e espera "SIM" para enviar link
2. **Toggle ativado** (Modo de Proteção):
   - Verifica se `consentimento_ativo = TRUE` E `data_permissao` < 3 dias
   - **Se válido**: Envia Template B (com link direto)
   - **Se inválido/expirado**: Envia Template A (pede permissão)
   - Ao receber "SIM": Atualiza apenas o DB, NÃO envia resposta

## Templates padrão

### Template A (Solicitação)
```
🛒 *Item adicionado ao pedido*

✅ {{produto}}
Qtd: *{{quantidade}}*
Valor: *R$ {{valor}}*

Posso te enviar o link para finalizar o pedido por aqui?

Responda *SIM* para receber o link. ✨
```

### Template B (Com Link)
```
🛒 *Item adicionado ao pedido*

✅ {{produto}}
Qtd: *{{quantidade}}*
Valor: *R$ {{valor}}*

👉 Finalize seu pedido: {{link_checkout}}

Qualquer dúvida, estou à disposição! ✨
```
