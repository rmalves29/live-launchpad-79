# Guia do Sistema Multi-Tenant

## Visão Geral

O sistema agora suporta múltiplas empresas (tenants) com separação completa de dados e instâncias WhatsApp independentes.

## Criação de Empresas

### 1. Através do Super Administrador

Como super administrador, você pode criar empresas que automaticamente criam um usuário administrador:

1. Acesse o painel de Super Administrador
2. Clique em "Nova Empresa"
3. Preencha:
   - **Nome da Empresa**: Nome completo da empresa
   - **Slug**: Identificador único (usado para URLs)
   - **Email do Administrador**: Email do usuário que será criado
   - **Senha do Administrador**: Senha inicial do usuário

### 2. Através do Gerenciador de Empresas

No componente `TenantsManager`, o mesmo processo se aplica - ao criar uma empresa, um usuário administrador é criado automaticamente.

## Separação de Dados

### Como Funciona

Cada empresa (tenant) possui um `tenant_id` único que é usado para:

1. **Filtrar dados**: Todas as consultas são automaticamente filtradas pelo `tenant_id` do usuário logado
2. **Isolar informações**: Empresas não conseguem ver dados de outras empresas
3. **Controlar acesso**: RLS (Row Level Security) garante que apenas dados da empresa do usuário sejam acessíveis

### Tabelas Separadas por Tenant

- `products` - Produtos da empresa
- `customers` - Clientes da empresa  
- `orders` - Pedidos da empresa
- `carts` - Carrinhos da empresa
- `cart_items` - Itens dos carrinhos
- `whatsapp_messages` - Mensagens WhatsApp
- `whatsapp_templates` - Templates de mensagem
- `payment_integrations` - Integrações de pagamento
- `shipping_integrations` - Integrações de envio
- `integration_whatsapp` - Configurações WhatsApp

### Funções de Segurança

O sistema usa duas funções principais:

- `get_current_tenant_id()`: Retorna o tenant_id do usuário logado
- `is_super_admin()`: Verifica se o usuário é super administrador

## Servidor WhatsApp Multi-Tenant

### Novo Servidor

O arquivo `server-whatsapp-multitenant.js` substitui o servidor anterior com suporte completo a multi-tenancy:

#### Características:

1. **Instâncias Separadas**: Cada empresa tem sua própria instância WhatsApp
2. **Autenticação Isolada**: Cada empresa mantém sua própria sessão
3. **Storage Separado**: Dados de autenticação ficam em pastas separadas
4. **APIs por Tenant**: Todas as APIs requerem identificação do tenant

### Configuração do Servidor

#### 1. Instalar Dependências

```bash
npm install whatsapp-web.js express cors qrcode-terminal node-fetch
```

#### 2. Executar o Servidor

```bash
# Desenvolvimento
node server-whatsapp-multitenant.js

# Produção com PM2
pm2 start server-whatsapp-multitenant.js --name "whatsapp-multitenant"
```

#### 3. Variáveis de Ambiente

```bash
PORT=3333
SUPABASE_SERVICE_KEY=sua_service_key_aqui
```

### APIs do Servidor Multi-Tenant

#### Status Geral
```
GET /status
```

#### Status por Tenant
```
GET /status/:tenantId
```

#### Enviar Mensagem
```
POST /send
Headers: X-Tenant-ID: uuid_do_tenant

{
  "phone": "5511999999999",
  "message": "Sua mensagem aqui"
}
```

#### Broadcast
```
POST /broadcast
Headers: X-Tenant-ID: uuid_do_tenant

{
  "phones": ["5511999999999", "5511888888888"],
  "message": "Mensagem para todos"
}
```

#### Reinicializar Cliente
```
POST /restart/:tenantId
```

### Integração com o Sistema

#### 1. Configurar Integração WhatsApp

Para cada empresa, configure a integração na tabela `integration_whatsapp`:

```sql
INSERT INTO integration_whatsapp (
  tenant_id,
  instance_name,
  api_url,
  webhook_secret,
  is_active
) VALUES (
  'uuid-da-empresa',
  'instancia_empresa',
  'http://localhost:3333',
  'webhook-secret-seguro',
  true
);
```

#### 2. Conectar WhatsApp

1. Execute o servidor multi-tenant
2. O servidor carregará automaticamente todas as empresas ativas
3. Para cada empresa com integração configurada, uma instância WhatsApp será criada
4. Use os QR codes exibidos no console para conectar cada instância

## Fluxo de Trabalho

### Para Super Administradores

1. **Criar Empresa**: Use o painel para criar nova empresa com administrador
2. **Configurar Integração**: Configure as integrações necessárias (pagamento, envio, WhatsApp)
3. **Ativar Empresa**: Certifique-se de que a empresa está ativa

### Para Administradores de Empresa

1. **Login**: Use as credenciais fornecidas pelo Super Admin
2. **Configurar Sistema**: Configure produtos, clientes, templates, etc.
3. **Conectar WhatsApp**: Aguarde o QR code e conecte o WhatsApp da empresa
4. **Operar**: Use o sistema normalmente - todos os dados ficam isolados

### Para Funcionários

1. **Login**: Use as credenciais fornecidas pelo Admin da empresa
2. **Trabalhar**: Acesse apenas os dados da sua empresa
3. **Limitações**: Não pode ver ou modificar dados de outras empresas

## Monitoramento

### Logs do Sistema

- Todas as ações são registradas na tabela `audit_logs`
- Mensagens WhatsApp ficam em `whatsapp_messages`
- Webhooks são registrados em `webhook_logs`

### Status das Instâncias

Use a API `/status` para monitorar o status de todas as instâncias WhatsApp.

## Troubleshooting

### Problema: Empresa não aparece dados

**Solução**: Verifique se o usuário está vinculado ao `tenant_id` correto:

```sql
SELECT * FROM profiles WHERE id = 'uuid-do-usuario';
```

### Problema: WhatsApp não conecta

**Soluções**:
1. Verifique se a integração está configurada e ativa
2. Reinicie a instância: `POST /restart/:tenantId`
3. Verifique os logs do servidor

### Problema: Erro de permissão

**Solução**: Verifique as políticas RLS e se o usuário tem o papel correto:

```sql
SELECT role, tenant_id FROM profiles WHERE id = auth.uid();
```

## Segurança

### Princípios

1. **Isolamento Completo**: Empresas não acessam dados de outras
2. **RLS Automático**: Políticas aplicadas automaticamente
3. **Auditoria**: Todas as ações são registradas
4. **Controle de Acesso**: Baseado em papéis e tenant

### Boas Práticas

1. **Senhas Fortes**: Use senhas complexas para administradores
2. **Webhooks Seguros**: Use secrets únicos para cada empresa
3. **Monitoramento**: Acompanhe logs regularmente
4. **Backups**: Faça backups regulares dos dados

## Migração

### De Sistema Single-Tenant

Se você estava usando o sistema anterior (single-tenant), será necessário:

1. **Criar Empresa Principal**: Crie uma empresa para os dados existentes
2. **Vincular Usuários**: Associe usuários existentes à empresa
3. **Migrar Dados**: Execute migration para adicionar `tenant_id` aos dados existentes
4. **Testar**: Verifique se tudo funciona corretamente antes de usar em produção

### Script de Migração

```sql
-- Criar empresa principal
INSERT INTO tenants (name, slug, is_active) VALUES ('Empresa Principal', 'principal', true);

-- Obter ID da empresa
SELECT id FROM tenants WHERE slug = 'principal';

-- Vincular usuários existentes (substitua o UUID)
UPDATE profiles SET tenant_id = 'uuid-da-empresa-principal' WHERE tenant_id IS NULL;

-- Vincular dados existentes (execute para cada tabela)
UPDATE products SET tenant_id = 'uuid-da-empresa-principal' WHERE tenant_id IS NULL;
UPDATE customers SET tenant_id = 'uuid-da-empresa-principal' WHERE tenant_id IS NULL;
-- ... e assim por diante
```