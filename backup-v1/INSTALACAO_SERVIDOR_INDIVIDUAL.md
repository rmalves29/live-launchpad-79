# 🏢 Servidor WhatsApp Individual por Empresa

Este guia explica como configurar um servidor Node.js **individual para cada empresa** com sistema de templates personalizados para confirmação de pagamento.

## 📋 Características

- ✅ **Um servidor por empresa** (processo Node.js separado)
- ✅ **Templates personalizados** de confirmação de pagamento
- ✅ **Verificação automática** de pedidos pagos sem confirmação
- ✅ **Variáveis dinâmicas** nos templates: `{customer_name}`, `{order_id}`, `{total_amount}`, `{created_at}`
- ✅ **Detecção automática** de códigos de produtos via WhatsApp

## 🚀 Instalação

### 1. Configurar Variáveis de Ambiente

Para **cada empresa**, crie um arquivo `.env` específico (ou use `.env.maniaDeMulther`, `.env.empresa2`, etc.):

```env
# Identificação da Empresa
TENANT_ID=08f2b1b9-3988-489e-8186-c60f0c0b0622
TENANT_SLUG=app

# Porta do Servidor (uma porta diferente para cada empresa)
PORT=3333

# Supabase
SUPABASE_URL=https://hxtbsieodbtzgcvvkeqx.supabase.co
SUPABASE_SERVICE_ROLE=sua_service_role_key_aqui
```

### 2. Instalar Dependências

```bash
npm install
```

ou

```bash
npm install whatsapp-web.js express cors qrcode-terminal dotenv
```

## 🎯 Executar Servidor

### Opção 1: Usando .env padrão

```bash
node server-whatsapp-individual.js
```

### Opção 2: Usando .env específico da empresa

```bash
# Para Mania de Mulher
node --env-file=.env.maniaDeMulther server-whatsapp-individual.js

# Para outra empresa
node --env-file=.env.empresa2 server-whatsapp-individual.js
```

### Opção 3: Definir variáveis inline

```bash
TENANT_ID=08f2b1b9-3988-489e-8186-c60f0c0b0622 TENANT_SLUG=app PORT=3333 node server-whatsapp-individual.js
```

## 📱 Primeira Conexão

1. Execute o servidor
2. **Escaneie o QR Code** que aparecerá no terminal
3. Aguarde a mensagem "WhatsApp conectado!"
4. O sistema verificará automaticamente pedidos pagos pendentes

## 🎨 Configurar Template de Pagamento

### 1. Acessar Banco de Dados

No Supabase, acesse a tabela `whatsapp_templates`:

### 2. Criar Template PAID_ORDER

```sql
INSERT INTO whatsapp_templates (tenant_id, type, title, content)
VALUES (
  '08f2b1b9-3988-489e-8186-c60f0c0b0622',
  'PAID_ORDER',
  'Confirmação de Pagamento',
  '🎉 *Pagamento Confirmado!*

Olá {customer_name}!

✅ Seu pagamento foi confirmado com sucesso!
📄 Pedido: #{order_id}
💰 Valor: {total_amount}
📅 Data: {created_at}

Seu pedido já está sendo preparado! 📦

Obrigado pela preferência! 😊'
);
```

### Variáveis Disponíveis

- `{customer_name}` - Nome do cliente (ou telefone se não tiver nome)
- `{order_id}` - Número do pedido
- `{total_amount}` - Valor formatado (R$ 150,00)
- `{created_at}` - Data formatada (31/12/2025)

## 🔧 Configurar no Frontend

1. Acesse **Integrações > WhatsApp**
2. Configure a URL do servidor:
   - **Local**: `http://localhost:3333`
   - **Servidor**: `http://seu-servidor.com:3333`
3. Marque como **Ativo**
4. Salve

## 📊 Múltiplas Empresas

Para gerenciar **várias empresas** simultaneamente:

### 1. Configure Portas Diferentes

```env
# Empresa 1 - Mania de Mulher (.env.maniaDeMulther)
TENANT_ID=08f2b1b9-3988-489e-8186-c60f0c0b0622
TENANT_SLUG=mania-de-mulher
PORT=3333

# Empresa 2 - Loja X (.env.lojaX)
TENANT_ID=outro-tenant-id-uuid
TENANT_SLUG=loja-x
PORT=3334

# Empresa 3 - Loja Y (.env.lojaY)
TENANT_ID=outro-tenant-id-uuid
TENANT_SLUG=loja-y
PORT=3335
```

### 2. Executar Cada Servidor

```bash
# Terminal 1 - Mania de Mulher
node --env-file=.env.maniaDeMulther server-whatsapp-individual.js

# Terminal 2 - Loja X
node --env-file=.env.lojaX server-whatsapp-individual.js

# Terminal 3 - Loja Y
node --env-file=.env.lojaY server-whatsapp-individual.js
```

### 3. Configurar URLs no Frontend

Cada empresa deve ter sua **própria URL** configurada:

- **Mania de Mulher**: `http://localhost:3333`
- **Loja X**: `http://localhost:3334`
- **Loja Y**: `http://localhost:3335`

## 🔄 Processo de Confirmação de Pagamento

### Automático (ao conectar)

1. Servidor conecta ao WhatsApp
2. Busca template `PAID_ORDER` da empresa
3. Busca pedidos com `is_paid=true` e `payment_confirmation_sent=null`
4. Envia mensagens usando o template
5. Marca pedidos como `payment_confirmation_sent=true`

### Manual (via botão no frontend)

1. Usuário marca pedido como **Pago**
2. Frontend chama `/send` com `order_id`
3. Servidor busca template e dados do pedido
4. Substitui variáveis no template
5. Envia mensagem via WhatsApp
6. Marca pedido como confirmação enviada

## 📝 API Endpoints

### GET /status

Verifica status do servidor:

```bash
curl http://localhost:3333/status
```

Resposta:
```json
{
  "tenant": {
    "id": "08f2b1b9-3988-489e-8186-c60f0c0b0622",
    "slug": "app"
  },
  "whatsapp": {
    "ready": true
  },
  "timestamp": "2025-01-10T12:00:00.000Z"
}
```

### POST /send

Enviar mensagem (com ou sem template):

```bash
# Mensagem simples
curl -X POST http://localhost:3333/send \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "31999999999",
    "message": "Olá, teste!"
  }'

# Confirmação de pagamento (usa template)
curl -X POST http://localhost:3333/send \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "31999999999",
    "order_id": 123
  }'
```

## 🛠️ Solução de Problemas

### Servidor não conecta ao WhatsApp

1. Verifique se o WhatsApp Web está desconectado no celular
2. Delete a pasta `.wwebjs_auth` e tente novamente
3. Certifique-se de que o `TENANT_SLUG` está correto

### Mensagem não envia

1. Verifique logs do servidor no terminal
2. Confirme que `clientReady` está `true` em `/status`
3. Teste com o endpoint `/send` manualmente

### Template não encontrado

1. Verifique se o template existe no banco:
   ```sql
   SELECT * FROM whatsapp_templates 
   WHERE tenant_id = 'seu-tenant-id' 
   AND type = 'PAID_ORDER';
   ```
2. Se não existir, crie o template
3. Reinicie o servidor para recarregar o cache

### Erro 401 ou 42501 (RLS)

1. Use a **service_role_key** do Supabase (não a anon key)
2. Defina a variável `SUPABASE_SERVICE_ROLE` no .env

## 🔐 Segurança

⚠️ **IMPORTANTE**:
- Nunca exponha o servidor diretamente na internet sem autenticação
- Use a **service_role_key** apenas no servidor (nunca no frontend)
- Configure firewall para permitir apenas conexões autorizadas
- Use HTTPS em produção

## 📦 Estrutura de Arquivos

```
projeto/
├── server-whatsapp-individual.js    # Servidor individual
├── .env                              # Config empresa padrão
├── .env.maniaDeMulther              # Config Mania de Mulher
├── .env.lojaX                        # Config Loja X
└── .wwebjs_auth/                     # Sessões WhatsApp
    ├── session-mania-de-mulher/
    ├── session-loja-x/
    └── session-loja-y/
```

## ✅ Checklist de Configuração

- [ ] Variáveis de ambiente configuradas
- [ ] Dependências instaladas (`npm install`)
- [ ] Porta disponível (diferente para cada empresa)
- [ ] Service role key do Supabase configurada
- [ ] Template PAID_ORDER criado no banco
- [ ] Servidor iniciado e QR Code escaneado
- [ ] URL configurada no frontend (Integrações > WhatsApp)
- [ ] Teste de envio realizado

## 🆘 Suporte

Verifique os logs do servidor no terminal para mensagens detalhadas de:
- ✅ Sucesso
- ⚠️ Avisos
- ❌ Erros

Todos os eventos são logados com emojis para fácil identificação.
