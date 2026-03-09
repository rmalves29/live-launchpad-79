# 📦 Manual Completo — Integração Olist ERP (Tiny)

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Passo 1 — Criar a Tabela no Banco de Dados](#3-passo-1--criar-a-tabela-no-banco-de-dados)
4. [Passo 2 — Criar o App OAuth no Olist ERP](#4-passo-2--criar-o-app-oauth-no-olist-erp)
5. [Passo 3 — Configurar no Painel do OrderZap](#5-passo-3--configurar-no-painel-do-orderzap)
6. [Passo 4 — Autorizar a Conexão OAuth](#6-passo-4--autorizar-a-conexão-oauth)
7. [Passo 5 — Sincronizar Pedidos](#7-passo-5--sincronizar-pedidos)
8. [Passo 6 — Sincronizar Produtos](#8-passo-6--sincronizar-produtos)
9. [Arquitetura Técnica](#9-arquitetura-técnica)
10. [Mapeamento de Dados](#10-mapeamento-de-dados)
11. [Renovação de Token](#11-renovação-de-token)
12. [Troubleshooting](#12-troubleshooting)
13. [Limites e Rate Limiting](#13-limites-e-rate-limiting)
14. [FAQ](#14-faq)

---

## 1. Visão Geral

A integração com o **Olist ERP (antigo Tiny ERP)** permite sincronizar automaticamente **pedidos** e **produtos** entre o Olist e o OrderZap. O fluxo utiliza autenticação **OAuth2** (OpenID Connect) para conectar de forma segura.

### Funcionalidades

| Módulo | Descrição |
|--------|-----------|
| **Pedidos** | Importa pedidos do Olist para o OrderZap |
| **Produtos** | Sincroniza catálogo de produtos (nome, preço, código, estoque) |
| **Estoque** | Atualização de estoque (planejado) |
| **NF-e** | Sincronização de notas fiscais (planejado) |

### Fluxo Resumido

```
OrderZap → OAuth2 → Olist ERP → API v3 → Dados sincronizados
```

---

## 2. Pré-requisitos

Antes de iniciar, certifique-se de ter:

- ✅ **Conta ativa no Olist ERP** (antigo Tiny) — [https://erp.tiny.com.br](https://erp.tiny.com.br)
- ✅ **Acesso de administrador** ao painel do Olist ERP
- ✅ **Tenant configurado** no OrderZap
- ✅ **Acesso ao Supabase Dashboard** para rodar a migration SQL

---

## 3. Passo 1 — Criar a Tabela no Banco de Dados

### 3.1 Acessar o SQL Editor

1. Acesse o **Supabase Dashboard**:
   👉 [https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx/sql/new](https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx/sql/new)

2. Cole o seguinte SQL e clique em **Run**:

```sql
-- =============================================================
-- Migration: integration_olist table + RLS
-- =============================================================

CREATE TABLE IF NOT EXISTS public.integration_olist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id text,
  client_secret text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  sync_orders boolean NOT NULL DEFAULT false,
  sync_products boolean NOT NULL DEFAULT false,
  sync_stock boolean NOT NULL DEFAULT false,
  sync_invoices boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'production',
  is_active boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- Habilitar RLS
ALTER TABLE public.integration_olist ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Tenant users can manage their Olist integration"
  ON public.integration_olist
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.tenant_id = integration_olist.tenant_id OR profiles.role = 'super_admin')
    )
  );

CREATE POLICY "Tenant users can view their Olist integration"
  ON public.integration_olist
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.tenant_id = integration_olist.tenant_id OR profiles.role = 'super_admin')
    )
  );

-- Trigger updated_at
CREATE TRIGGER set_integration_olist_updated_at
  BEFORE UPDATE ON public.integration_olist
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

### 3.2 Verificar

Após executar, confirme que a tabela aparece em **Table Editor** → `integration_olist`.

---

## 4. Passo 2 — Criar o App OAuth no Olist ERP

### 4.1 Acessar o Painel do Olist

1. Faça login no Olist ERP: [https://erp.tiny.com.br](https://erp.tiny.com.br)
2. Vá até **Configurações** → **Integrações** → **Aplicativos OAuth**
   - Ou acesse diretamente: **Configurações** → aba **Geral** → seção **API / Integrações**

### 4.2 Criar Novo Aplicativo

1. Clique em **"Criar novo aplicativo"** ou **"Nova integração"**
2. Preencha os campos:

| Campo | Valor |
|-------|-------|
| **Nome do App** | `OrderZap` |
| **Descrição** | `Integração com o sistema OrderZap para gestão de pedidos` |
| **Redirect URI** | `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/olist-oauth-callback` |
| **Tipo de acesso** | `Confidential` |
| **Escopo** | `openid` |

3. Clique em **Salvar**

### 4.3 Copiar as Credenciais

Após criar o app, o Olist irá gerar:

- **Client ID** — exemplo: `abc123def456`
- **Client Secret** — exemplo: `secret_xyz789`

> ⚠️ **IMPORTANTE:** Guarde essas credenciais em local seguro. O Client Secret só é exibido uma vez!

### 4.4 URL de Redirect (Callback)

A URL de callback é fixa e deve ser exatamente:

```
https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/olist-oauth-callback
```

Certifique-se de que essa URL está cadastrada corretamente no app do Olist.

---

## 5. Passo 3 — Configurar no Painel do OrderZap

### 5.1 Acessar Integrações

1. Faça login no OrderZap
2. No menu lateral, clique em **Integrações**
3. Selecione a aba **"Olist ERP"**

### 5.2 Inserir Credenciais

1. Cole o **Client ID** no campo correspondente
2. Cole o **Client Secret** no campo correspondente
3. Clique em **"Salvar Credenciais"**

> ✅ Uma mensagem de sucesso aparecerá confirmando que as credenciais foram salvas.

---

## 6. Passo 4 — Autorizar a Conexão OAuth

### 6.1 Iniciar Autorização

1. Após salvar as credenciais, clique no botão **"🔗 Autorizar com Olist"**
2. Você será redirecionado para a página de login do Olist ERP
3. Faça login com sua conta do Olist (se não estiver logado)
4. Autorize o acesso do aplicativo "OrderZap"

### 6.2 Retorno Automático

Após autorizar, você será redirecionado automaticamente de volta ao OrderZap com um dos seguintes resultados:

| Status | Descrição |
|--------|-----------|
| ✅ **Sucesso** | Token salvo com sucesso. A integração está ativa! |
| ❌ **Erro** | Verifique as credenciais e tente novamente |

### 6.3 Verificar Status

Na aba Olist ERP, você verá:

- **Badge verde** "Ativo" — integração conectada
- **Badge vermelho** "Inativo" — integração desconectada
- **Data de expiração do token** — tokens expiram em ~4 horas

---

## 7. Passo 5 — Sincronizar Pedidos

### 7.1 Ativar Módulo

1. Na aba Olist ERP, ative o toggle **"Sincronizar Pedidos"**
2. Clique em **"Salvar Módulos"**

### 7.2 Sincronização Manual

1. Clique no botão **"📦 Sincronizar Pedidos"**
2. Aguarde o processo (pode levar alguns minutos dependendo do volume)
3. Um resumo será exibido: `X pedidos sincronizados, Y erros`

### 7.3 Como Funciona

- A sincronização busca os **últimos 100 pedidos** do Olist
- Para cada pedido, busca os detalhes (cliente, itens, endereço)
- Pedidos já sincronizados são ignorados (controle por ID na observação)
- Pedidos sem telefone do cliente são pulados
- O campo `event_type` é definido como `"olist"`

### 7.4 Mapeamento de Status

| Status Olist | Ação no OrderZap |
|-------------|------------------|
| Situação 3 (Aprovado) | `is_paid = true` |
| Outros | `is_paid = false` |

---

## 8. Passo 6 — Sincronizar Produtos

### 8.1 Ativar Módulo

1. Ative o toggle **"Sincronizar Produtos"**
2. Clique em **"Salvar Módulos"**

### 8.2 Sincronização Manual

1. Clique no botão **"🏷️ Sincronizar Produtos"**
2. Aguarde a conclusão
3. Resumo: `X produtos sincronizados, Y erros`

### 8.3 Como Funciona

- Busca até **100 produtos** do Olist
- Para cada produto, busca detalhes completos
- Produtos existentes (mesmo código) são **atualizados** (preço, nome, estoque)
- Produtos novos são **inseridos**
- O campo `sale_type` é definido como `"BAZAR"`

### 8.4 Mapeamento de Campos

| Campo Olist | Campo OrderZap |
|------------|----------------|
| `nome` | `name` |
| `codigo` | `code` |
| `preco` | `price` |
| `estoque` / `saldo` | `stock` |
| `imagem.url` | `image_url` |
| `situacao = 'A'` | `is_active = true` |

---

## 9. Arquitetura Técnica

### 9.1 Edge Functions

| Função | Endpoint | Descrição |
|--------|----------|-----------|
| `olist-oauth` | `/functions/v1/olist-oauth?action=authorize` | Gera URL de autorização OAuth |
| `olist-oauth` | `/functions/v1/olist-oauth?action=status` | Verifica status do token |
| `olist-oauth` | `/functions/v1/olist-oauth?action=refresh` | Renova token expirado |
| `olist-oauth-callback` | `/functions/v1/olist-oauth-callback` | Callback OAuth (troca code por token) |
| `olist-sync-orders` | `/functions/v1/olist-sync-orders` | Sincroniza pedidos |
| `olist-sync-products` | `/functions/v1/olist-sync-products` | Sincroniza produtos |

### 9.2 URLs da API do Olist

| Serviço | URL |
|---------|-----|
| **Autorização OAuth** | `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth` |
| **Token OAuth** | `https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token` |
| **API REST v3** | `https://api.tiny.com.br/public-api/v3` |

### 9.3 Fluxo OAuth2 Completo

```
1. Usuário clica "Autorizar com Olist"
   ↓
2. Frontend chama olist-oauth?action=authorize
   ↓
3. Edge Function retorna URL de autorização
   ↓
4. Usuário é redirecionado para Olist (login + autorização)
   ↓
5. Olist redireciona para olist-oauth-callback com ?code=xxx&state=yyy
   ↓
6. Callback troca o code por access_token + refresh_token
   ↓
7. Tokens são salvos na tabela integration_olist
   ↓
8. Usuário é redirecionado de volta ao OrderZap com ?olist=success
```

### 9.4 Tabela no Banco

```
integration_olist
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── client_id (text)
├── client_secret (text)
├── access_token (text)
├── refresh_token (text)
├── token_expires_at (timestamptz)
├── sync_orders (boolean)
├── sync_products (boolean)
├── sync_stock (boolean)
├── sync_invoices (boolean)
├── environment (text)
├── is_active (boolean)
├── last_sync_at (timestamptz)
├── created_at (timestamptz)
└── updated_at (timestamptz)
```

---

## 10. Mapeamento de Dados

### 10.1 Pedidos (Olist → OrderZap)

| Campo Olist | Campo OrderZap | Observação |
|------------|----------------|------------|
| `cliente.celular` / `cliente.telefone` | `customer_phone` | Somente dígitos |
| `cliente.nome` | `customer_name` | — |
| `cliente.endereco.cep` | `customer_cep` | — |
| `cliente.endereco.endereco` | `customer_street` | — |
| `cliente.endereco.numero` | `customer_number` | — |
| `cliente.endereco.complemento` | `customer_complement` | — |
| `cliente.endereco.bairro` | `customer_neighborhood` | — |
| `cliente.endereco.cidade` | `customer_city` | — |
| `cliente.endereco.uf` | `customer_state` | — |
| `itens[].quantidade * itens[].valor` | `total_amount` | Soma de todos os itens |
| `situacao == 3` | `is_paid` | Situação "Aprovado" |
| `id` + `numeroPedido` | `observation` | Formato: `[OLIST] ID: xxx \| Nº: yyy` |

### 10.2 Produtos (Olist → OrderZap)

| Campo Olist | Campo OrderZap |
|------------|----------------|
| `nome` | `name` |
| `codigo` | `code` |
| `preco` | `price` |
| `estoque` ou `saldo` | `stock` |
| `imagem.url` | `image_url` |
| `situacao == 'A'` | `is_active` |

---

## 11. Renovação de Token

### 11.1 Expiração

Os tokens do Olist expiram em **4 horas (14400 segundos)**.

### 11.2 Renovação Manual

1. Na aba Olist ERP, clique em **"🔄 Renovar Token"**
2. O sistema usa o `refresh_token` para obter um novo `access_token`
3. Os novos tokens são salvos automaticamente

### 11.3 Renovação Automática (Recomendado)

Para renovação automática, configure um **CRON job** no Supabase:

```sql
-- Criar extensão pg_cron (se não existir)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- CRON a cada 3 horas para renovar tokens
SELECT cron.schedule(
  'olist-token-refresh',
  '0 */3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/olist-oauth',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := (
      SELECT jsonb_build_object('tenant_id', tenant_id)
      FROM integration_olist
      WHERE is_active = true
        AND token_expires_at < (now() + interval '1 hour')
      LIMIT 1
    )
  );
  $$
);
```

> ⚠️ Para múltiplos tenants, ajuste o CRON para iterar sobre todos.

---

## 12. Troubleshooting

### 12.1 Erro "Integração não encontrada"

**Causa:** As credenciais (Client ID / Secret) não foram salvas.
**Solução:** Vá até a aba Olist ERP e salve as credenciais primeiro.

### 12.2 Erro "Falha ao obter tokens"

**Causa:** Client ID ou Client Secret incorretos, ou Redirect URI não bate.
**Solução:**
1. Verifique as credenciais no painel do Olist
2. Confirme que a Redirect URI é exatamente: `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/olist-oauth-callback`

### 12.3 Erro "Token expirado" (401)

**Causa:** O access_token expirou (validade: 4h).
**Solução:** Clique em "Renovar Token" ou re-autorize a conexão.

### 12.4 Pedidos não aparecem após sync

**Causas possíveis:**
1. Pedidos sem telefone do cliente são ignorados
2. Pedidos já sincronizados são pulados
3. Módulo "Sincronizar Pedidos" não está ativado

**Solução:** Verifique os logs da Edge Function:
👉 [Logs olist-sync-orders](https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx/functions/olist-sync-orders/logs)

### 12.5 Produtos duplicados

**Causa:** Produtos com o mesmo `code` para o mesmo tenant não são duplicados — são atualizados (upsert por código).

### 12.6 Rate Limiting (429)

**Causa:** Excesso de requisições à API do Olist (~30 req/min).
**Solução:** O sistema já implementa delay de 2 segundos entre requisições. Se persistir, aguarde 1 minuto e tente novamente.

---

## 13. Limites e Rate Limiting

| Recurso | Limite |
|---------|--------|
| Requisições à API | ~30 por minuto |
| Token access_token | Expira em 4 horas |
| Pedidos por sync | Últimos 100 |
| Produtos por sync | Últimos 100 |
| Delay entre requisições | 2 segundos |

---

## 14. FAQ

### Preciso de uma conta paga no Olist?

Sim, é necessário ter uma conta ativa no Olist ERP com acesso à API.

### A sincronização é automática?

Atualmente a sincronização é **manual** (botão). Para automatizar, configure um CRON job conforme descrito na seção 11.3.

### Posso usar em ambiente de testes (sandbox)?

O campo `environment` suporta valores como `production` e `sandbox`, mas o Olist não oferece um ambiente de sandbox separado oficialmente.

### O que acontece se eu desconectar a integração?

Os dados já sincronizados (pedidos e produtos) permanecem no OrderZap. Apenas a conexão é desativada.

### Posso ter Olist e Bling conectados ao mesmo tempo?

Sim! As integrações são independentes. No entanto, tome cuidado para não duplicar pedidos se ambos os ERPs gerenciam os mesmos dados.

### Onde vejo os logs de erro?

Acesse os logs das Edge Functions no Supabase Dashboard:
- [olist-oauth logs](https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx/functions/olist-oauth/logs)
- [olist-sync-orders logs](https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx/functions/olist-sync-orders/logs)
- [olist-sync-products logs](https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx/functions/olist-sync-products/logs)

---

## Checklist Final

- [ ] Tabela `integration_olist` criada no Supabase
- [ ] App OAuth criado no painel do Olist ERP
- [ ] Redirect URI configurada corretamente
- [ ] Client ID e Client Secret salvos no OrderZap
- [ ] Autorização OAuth realizada com sucesso
- [ ] Módulos de sincronização ativados
- [ ] Primeira sincronização de pedidos executada
- [ ] Primeira sincronização de produtos executada
- [ ] (Opcional) CRON de renovação de token configurado

---

*Última atualização: Março 2026*
