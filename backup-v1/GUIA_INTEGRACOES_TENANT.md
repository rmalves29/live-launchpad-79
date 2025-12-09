# 🔌 Guia de Integrações Multi-Tenant
## Mercado Pago e Melhor Envio por Tenant

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Como Usar](#como-usar)
4. [Integrações Disponíveis](#integrações-disponíveis)
5. [APIs Backend](#apis-backend)
6. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

Sistema completo de integrações multi-tenant que permite cada tenant configurar suas próprias credenciais de:

- **💳 Mercado Pago**: Processar pagamentos (PIX, Cartão, Boleto)
- **📦 Melhor Envio**: Calcular frete e gerar etiquetas

### ✨ Características

- ✅ **Isolamento por Tenant**: Cada tenant tem suas próprias credenciais
- ✅ **Segurança**: Credenciais criptografadas no banco de dados
- ✅ **Validação**: Verificação automática de credenciais
- ✅ **RLS (Row Level Security)**: Políticas de acesso no Supabase
- ✅ **Sandbox e Produção**: Suporte para ambos ambientes
- ✅ **Interface Amigável**: Componente React com validação em tempo real

---

## 🏗️ Arquitetura

```
Frontend (React)
    ↓
Backend Express (server-main.js)
    ↓
Rotas de Integração (/api/integrations)
    ↓
Serviços (mercado-pago.service.js, melhor-envio.service.js)
    ↓
APIs Externas (Mercado Pago, Melhor Envio)
    ↓
Supabase (tenant_payment_integrations, tenant_shipping_integrations)
```

### 📁 Arquivos Criados

#### Frontend
- `frontend/src/types/integrations.ts` - Tipos TypeScript
- `frontend/src/components/TenantIntegrationsPage.tsx` - Página de configuração

#### Backend
- `backend/services/mercado-pago.service.js` - Serviço Mercado Pago
- `backend/services/melhor-envio.service.js` - Serviço Melhor Envio
- `backend/routes/integrations.routes.js` - Rotas da API
- `backend/server-main.js` - Servidor principal integrado

#### Banco de Dados
- `supabase/migrations/20251206_tenant_integrations.sql` - Estrutura do banco

---

## 🚀 Como Usar

### 1️⃣ Acessar a Página de Integrações

No frontend, acesse: `/integracoes`

Ou adicione um link no menu:
```tsx
<Link to="/integracoes">Integrações</Link>
```

### 2️⃣ Configurar Mercado Pago

1. Acesse o [Painel de Desenvolvedores do Mercado Pago](https://www.mercadopago.com.br/developers/panel)
2. Copie o **Access Token** (começando com `APP_USR-...`)
3. Cole no campo **Access Token** na página de integrações
4. Escolha se é **Sandbox** (teste) ou **Produção**
5. Clique em **Salvar Integração**
6. Clique em **Verificar Conexão** para validar

### 3️⃣ Configurar Melhor Envio

1. Acesse o [Painel do Melhor Envio](https://melhorenvio.com.br/painel/gerenciar/tokens)
2. Copie o **API Token** (começando com `eyJ0eXAiOiJKV1QiLCJhbGc...`)
3. Cole no campo **API Token** na página de integrações
4. Preencha os **Dados do Remetente** (Nome, Telefone, Email)
5. Escolha se é **Sandbox** (teste) ou **Produção**
6. Clique em **Salvar Integração**
7. Clique em **Verificar Conexão** para validar

---

## 💳 Integrações Disponíveis

### Mercado Pago

#### Funcionalidades

- ✅ Validar credenciais
- ✅ Criar preferências de pagamento
- ✅ Processar pagamentos PIX
- ✅ Buscar informações de pagamento
- ✅ Estornar pagamentos
- ✅ Processar webhooks

#### Exemplo de Uso no Backend

```javascript
// Importar serviço
const mercadoPagoService = require('./services/mercado-pago.service');

// Verificar credenciais
const result = await mercadoPagoService.verifyCredentials(
  'APP_USR-1234567890-121212-abcdef1234567890-123456789',
  true // isSandbox
);

// Criar pagamento PIX
const pixPayment = await mercadoPagoService.createPixPayment(
  accessToken,
  {
    amount: 100.50,
    description: 'Pedido #123',
    payer_email: 'cliente@example.com',
    payer_name: 'João Silva',
    external_reference: 'order_123'
  },
  false // produção
);
```

### Melhor Envio

#### Funcionalidades

- ✅ Validar credenciais
- ✅ Calcular frete
- ✅ Criar pedido de envio
- ✅ Comprar etiqueta
- ✅ Gerar etiqueta para impressão
- ✅ Rastrear envio
- ✅ Cancelar envio
- ✅ Consultar saldo

#### Exemplo de Uso no Backend

```javascript
// Importar serviço
const melhorEnvioService = require('./services/melhor-envio.service');

// Verificar credenciais
const result = await melhorEnvioService.verifyCredentials(
  'eyJ0eXAiOiJKV1QiLCJhbGc...',
  true // isSandbox
);

// Calcular frete
const shippingQuote = await melhorEnvioService.calculateShipping(
  apiToken,
  {
    from_postal_code: '01310-100',
    to_postal_code: '04567-890',
    weight: 0.5, // kg
    width: 12,   // cm
    height: 4,   // cm
    length: 17,  // cm
    insurance_value: 50.00
  },
  false // produção
);
```

---

## 🔌 APIs Backend

### Mercado Pago

#### `GET /api/integrations/payment/:tenantId`
Busca a integração de pagamento do tenant.

**Resposta:**
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "provider": "mercado_pago",
  "access_token": "••••••••",
  "public_key": "••••••••",
  "is_active": true,
  "is_sandbox": false,
  "last_verified_at": "2024-12-07T10:30:00Z"
}
```

#### `POST /api/integrations/payment/:tenantId`
Cria ou atualiza a integração de pagamento.

**Body:**
```json
{
  "access_token": "APP_USR-...",
  "public_key": "APP_USR-...",
  "is_sandbox": true
}
```

#### `POST /api/integrations/payment/:tenantId/verify`
Verifica as credenciais do Mercado Pago.

**Resposta:**
```json
{
  "success": true,
  "message": "Credenciais válidas",
  "data": {
    "user_id": 123456789,
    "email": "vendedor@example.com",
    "nickname": "MINHA_LOJA"
  }
}
```

### Melhor Envio

#### `GET /api/integrations/shipping/:tenantId`
Busca a integração de envio do tenant.

#### `POST /api/integrations/shipping/:tenantId`
Cria ou atualiza a integração de envio.

**Body:**
```json
{
  "api_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "is_sandbox": true,
  "sender_config": {
    "name": "Minha Loja",
    "phone": "(11) 99999-9999",
    "email": "contato@minhaloja.com"
  }
}
```

#### `POST /api/integrations/shipping/:tenantId/verify`
Verifica as credenciais do Melhor Envio.

#### `POST /api/integrations/shipping/:tenantId/calculate`
Calcula o frete para um endereço.

**Body:**
```json
{
  "from_postal_code": "01310-100",
  "to_postal_code": "04567-890",
  "weight": 0.5,
  "width": 12,
  "height": 4,
  "length": 17,
  "insurance_value": 50.00
}
```

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "PAC",
      "price": "15.50",
      "delivery_time": 5
    },
    {
      "id": 2,
      "name": "SEDEX",
      "price": "25.00",
      "delivery_time": 2
    }
  ]
}
```

---

## 🔧 Configuração do Servidor

### Opção 1: Usar servidor integrado (Recomendado)

```bash
cd backend
node server-main.js
```

Variáveis de ambiente necessárias:
```env
# Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=seu-service-key

# Evolution API (WhatsApp)
EVOLUTION_API_URL=https://sua-evolution-api.railway.app
EVOLUTION_API_KEY=seu-api-key

# Servidor
PORT=3333
```

### Opção 2: Railway (Deploy)

No `package.json` do backend, adicione:
```json
{
  "scripts": {
    "start": "node server-main.js"
  }
}
```

Configure as variáveis de ambiente no Railway:
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `PORT=8080`

---

## 🐛 Troubleshooting

### Erro: "Integração não encontrada"

**Causa:** Tenant não configurou a integração ainda.

**Solução:** Acesse `/integracoes` e configure as credenciais.

### Erro: "Access token não configurado"

**Causa:** Credenciais não foram salvas ou estão vazias.

**Solução:** 
1. Verifique se o Access Token foi preenchido corretamente
2. Clique em "Salvar Integração" antes de "Verificar Conexão"

### Erro: "Credenciais inválidas"

**Causa:** Access Token ou API Token incorretos ou expirados.

**Solução:**
1. Gere novas credenciais nos painéis:
   - [Mercado Pago](https://www.mercadopago.com.br/developers/panel)
   - [Melhor Envio](https://melhorenvio.com.br/painel/gerenciar/tokens)
2. Atualize na página de integrações

### Erro: "Cannot find module './routes/integrations.routes.js'"

**Causa:** Rotas de integração não foram carregadas.

**Solução:**
```bash
# Verificar se o arquivo existe
ls backend/routes/integrations.routes.js

# Se não existir, criar novamente ou usar git pull
git pull origin main
```

### Problema: Credenciais aparecem como "••••••••"

**Comportamento esperado:** Por segurança, as credenciais são ocultadas na interface.

**Para atualizar:** Digite a nova credencial completa (não o placeholder).

---

## 🔐 Segurança

### Políticas RLS (Row Level Security)

O sistema usa RLS do Supabase para garantir que:

- ✅ Cada tenant vê apenas suas próprias integrações
- ✅ Apenas admins podem modificar integrações
- ✅ Credenciais sensíveis são ocultadas no frontend

### Boas Práticas

1. **Nunca compartilhe suas credenciais**
2. **Use Sandbox para testes**
3. **Regenere tokens periodicamente**
4. **Configure webhooks para segurança extra**

---

## 📚 Links Úteis

### Mercado Pago
- [Documentação](https://www.mercadopago.com.br/developers/pt/docs)
- [Painel de Desenvolvedores](https://www.mercadopago.com.br/developers/panel)
- [Credenciais de Teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/test-cards)

### Melhor Envio
- [Documentação da API](https://docs.melhorenvio.com.br/)
- [Painel de Tokens](https://melhorenvio.com.br/painel/gerenciar/tokens)
- [Ambiente Sandbox](https://sandbox.melhorenvio.com.br/)

---

## ✅ Checklist de Implementação

- [x] Migração do banco de dados criada
- [x] Tipos TypeScript definidos
- [x] Serviços backend implementados
- [x] Rotas da API criadas
- [x] Componente React criado
- [x] Rota adicionada no App.tsx
- [x] Documentação completa
- [ ] Testes em ambiente de produção
- [ ] Validação com tenants reais

---

## 🎉 Pronto!

Agora cada tenant pode configurar suas próprias integrações de forma independente e segura!

**Dúvidas ou problemas?** Entre em contato ou abra uma issue no GitHub.
