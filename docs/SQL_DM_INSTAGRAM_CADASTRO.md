# SQL: DM Instagram Cadastro

Execute o seguinte SQL no Supabase SQL Editor para adicionar a flag de controle da DM de cadastro no Instagram:

```sql
-- Adicionar flag para controlar envio de DM de cadastro
ALTER TABLE integration_instagram 
ADD COLUMN IF NOT EXISTS send_cadastro_dm BOOLEAN NOT NULL DEFAULT false;

-- Adicionar tipo de template
ALTER TYPE whatsapp_template_type ADD VALUE IF NOT EXISTS 'DM_INSTAGRAM_CADASTRO';

COMMENT ON COLUMN integration_instagram.send_cadastro_dm IS 'Ativa envio de DM pedindo cadastro quando cliente não está registrado';
```

## Como funciona

- **Flag desativado** (padrão): Todos os clientes recebem a DM padrão com link de checkout
- **Flag ativado**: Clientes **não cadastrados** recebem uma DM pedindo para se cadastrar primeiro. Clientes já cadastrados continuam recebendo o link de checkout normalmente.

## Onde configurar

A flag pode ser ativada/desativada em:
- **Integrações > Instagram > Configuração > DM Instagram Cadastro**
