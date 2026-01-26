# Integração Pagar.me - Guia Completo

Este guia detalha como configurar a integração de pagamentos via **Pagar.me** no OrderZap.

---

## 📋 Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Criar Conta no Pagar.me](#criar-conta-no-pagarme)
3. [Obter Credenciais](#obter-credenciais)
4. [Configurar no OrderZap](#configurar-no-orderzap)
5. [Configurar Webhook](#configurar-webhook)
6. [Testar a Integração](#testar-a-integração)
7. [Troubleshooting](#troubleshooting)

---

## 1. Pré-requisitos

Antes de iniciar, certifique-se de ter:

- ✅ Conta ativa no [Pagar.me](https://pagar.me)
- ✅ Documentação da empresa aprovada no Pagar.me
- ✅ Acesso administrativo ao OrderZap

---

## 2. Criar Conta no Pagar.me

### Passo 2.1: Acesse o site

1. Acesse [https://pagar.me](https://pagar.me)
2. Clique em **"Criar conta"** ou **"Começar agora"**

### Passo 2.2: Preencha os dados

1. Informe seus dados pessoais e da empresa
2. Complete o cadastro com CNPJ e dados bancários
3. Aguarde a aprovação (geralmente 1-3 dias úteis)

### Passo 2.3: Ative sua conta

1. Após aprovação, você receberá um email de confirmação
2. Acesse o **Dashboard** do Pagar.me

---

## 3. Obter Credenciais

### Passo 3.1: Acesse o Dashboard

1. Faça login em [https://dashboard.pagar.me](https://dashboard.pagar.me)
2. No menu lateral, clique em **"Configurações"**

### Passo 3.2: Localize as Chaves de API

1. Vá em **Configurações → Chaves de API** (ou **API Keys**)
2. Você verá duas chaves principais:

| Chave | Formato | Uso |
|-------|---------|-----|
| **API Key (Secret Key)** | `sk_live_...` ou `sk_test_...` | Backend - NÃO expor no frontend |
| **Public Key** | `pk_live_...` ou `pk_test_...` | Frontend - pode ser exposta |

### Passo 3.3: Copie as Chaves

1. **Para Produção**: Use as chaves que começam com `_live_`
2. **Para Testes**: Use as chaves que começam com `_test_`

> ⚠️ **IMPORTANTE**: Nunca compartilhe sua Secret Key (sk_) publicamente!

---

## 4. Configurar no OrderZap

### Passo 4.1: Acesse as Integrações

1. No OrderZap, vá em **Configurações → Integrações**
2. Localize a seção **"Pagar.me"**

### Passo 4.2: Preencha as Credenciais

| Campo | O que preencher |
|-------|-----------------|
| **API Key (Secret Key)** | Cole a chave `sk_live_...` ou `sk_test_...` |
| **Public Key** | Cole a chave `pk_live_...` ou `pk_test_...` |
| **Webhook Secret** | (Opcional) Token para validar webhooks |
| **Modo Sandbox** | Ative para usar ambiente de testes |

### Passo 4.3: Salvar e Ativar

1. Clique em **"Salvar e Ativar"**
2. O Pagar.me será ativado automaticamente
3. **Importante**: O Mercado Pago será desativado (apenas uma integração de pagamento pode estar ativa)

---

## 5. Configurar Webhook

O webhook é **essencial** para que o OrderZap receba notificações de pagamentos confirmados automaticamente.

### Passo 5.1: Acesse Webhooks no Pagar.me

1. No Dashboard do Pagar.me, vá em **Configurações → Webhooks**
2. Clique em **"Adicionar Webhook"** ou **"Criar Webhook"**

### Passo 5.2: Configure a URL

Preencha os campos:

| Campo | Valor |
|-------|-------|
| **URL** | `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/pagarme-webhook` |
| **Eventos** | Selecione os eventos abaixo |

### Passo 5.3: Selecione os Eventos Obrigatórios

Marque os seguintes eventos:

- ✅ `charge.paid` - Quando uma cobrança é paga
- ✅ `order.paid` - Quando um pedido é pago
- ✅ `charge.payment_failed` - (Opcional) Para notificar falhas

### Passo 5.4: Copie o Webhook Secret

1. Após criar, o Pagar.me exibirá um **Webhook Secret**
2. Copie esse token
3. Cole no campo **"Webhook Secret"** no OrderZap (opcional, mas recomendado para segurança)

### Passo 5.5: Salve o Webhook

1. Clique em **"Salvar"**
2. O webhook está configurado!

---

## 6. Testar a Integração

### Passo 6.1: Use o Modo Sandbox

1. No OrderZap, ative **"Modo Sandbox"** na integração Pagar.me
2. Use cartões de teste do Pagar.me

### Passo 6.2: Cartões de Teste

O Pagar.me fornece cartões para teste:

| Resultado | Número do Cartão | CVV | Validade |
|-----------|------------------|-----|----------|
| ✅ Aprovado | `4000000000000010` | `123` | Qualquer futura |
| ❌ Recusado | `4000000000000028` | `123` | Qualquer futura |
| ⏳ Pendente | `4000000000000036` | `123` | Qualquer futura |

### Passo 6.3: Faça um Pedido de Teste

1. Crie um pedido no OrderZap
2. Acesse o link de checkout
3. Pague com um cartão de teste
4. Verifique se o pedido foi marcado como **"Pago"** automaticamente

---

## 7. Troubleshooting

### ❌ Erro: "Credenciais inválidas"

**Causas possíveis:**
- Chave copiada incorretamente (espaços extras, caracteres faltando)
- Usando chave de sandbox em produção (ou vice-versa)

**Solução:**
1. Copie a chave novamente do Dashboard do Pagar.me
2. Certifique-se de que o modo sandbox corresponde à chave

### ❌ Erro: "Pagamento não está atualizando automaticamente"

**Causas possíveis:**
- Webhook não configurado
- URL do webhook incorreta
- Eventos não selecionados

**Solução:**
1. Verifique se o webhook está ativo no Dashboard do Pagar.me
2. Confira se a URL é exatamente: `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/pagarme-webhook`
3. Certifique-se de que `charge.paid` e `order.paid` estão selecionados

### ❌ Erro: "Webhook retornando 500"

**Solução:**
1. Verifique os logs da Edge Function no Supabase
2. Acesse: [Logs do Webhook Pagar.me](https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx/functions/pagarme-webhook/logs)

### ❌ Pedido não encontrado no webhook

**Causa:**
O `external_reference` não está sendo enviado corretamente.

**Formato esperado:**
```
tenant:{TENANT_ID};orders:{ORDER_IDS}
```

Exemplo:
```
tenant:08f2b1b9-3988-489e-8186-c60f0c0b0622;orders:123,124
```

---

## 📞 Suporte

### Pagar.me
- Central de Ajuda: [https://docs.pagar.me](https://docs.pagar.me)
- Suporte: suporte@pagar.me

### OrderZap
- Contate o administrador do sistema

---

## 🔗 Links Úteis

- [Dashboard Pagar.me](https://dashboard.pagar.me)
- [Documentação API Pagar.me](https://docs.pagar.me)
- [Logs do Webhook](https://supabase.com/dashboard/project/hxtbsieodbtzgcvvkeqx/functions/pagarme-webhook/logs)

---

*Última atualização: Janeiro 2026*
