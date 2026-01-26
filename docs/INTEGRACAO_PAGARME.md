# 💳 Como Configurar o Pagar.me no OrderZap

**Guia passo a passo para receber pagamentos via Pagar.me**

---

## 📖 O que é o Pagar.me?

O **Pagar.me** é uma plataforma de pagamentos brasileira que permite receber pagamentos por:
- ✅ Cartão de crédito
- ✅ Cartão de débito
- ✅ Pix
- ✅ Boleto bancário

Ao integrar o Pagar.me ao OrderZap, seus clientes poderão pagar diretamente pelo link de checkout, e o sistema **marcará automaticamente o pedido como pago** assim que o pagamento for confirmado.

---

## 📋 O que você vai precisar

Antes de começar, tenha em mãos:

| Item | Descrição |
|------|-----------|
| 📧 Email | Um email válido para criar a conta |
| 📄 CNPJ | CNPJ da sua empresa (obrigatório) |
| 🏦 Conta bancária | Dados da conta para receber os pagamentos |
| 📱 Telefone | Para verificação de segurança |

> ⏱️ **Tempo estimado**: 30-45 minutos para configuração completa

---

## 🚀 PARTE 1: Criar sua conta no Pagar.me

### Passo 1.1 - Acessar o site

1. Abra seu navegador (Chrome, Firefox, Edge, etc.)
2. Digite na barra de endereço: **pagar.me**
3. Pressione **Enter**

Você verá a página inicial do Pagar.me.

### Passo 1.2 - Iniciar o cadastro

1. Procure o botão **"Criar conta"** ou **"Começar agora"** (geralmente no canto superior direito)
2. Clique nele

### Passo 1.3 - Preencher seus dados

Você passará por algumas etapas de cadastro:

**📝 Etapa 1 - Dados pessoais:**
- Nome completo
- CPF
- Email
- Telefone celular
- Crie uma senha forte

**📝 Etapa 2 - Dados da empresa:**
- CNPJ
- Razão social
- Nome fantasia
- Endereço comercial

**📝 Etapa 3 - Dados bancários:**
- Banco (ex: Itaú, Bradesco, Nubank, etc.)
- Agência (sem dígito)
- Conta corrente (com dígito)
- Tipo de conta (Corrente ou Poupança)

> ⚠️ **IMPORTANTE**: A conta bancária deve estar no nome da empresa (mesmo CNPJ) para evitar problemas na transferência.

### Passo 1.4 - Aguardar aprovação

Após enviar o cadastro:

1. O Pagar.me vai analisar sua documentação
2. Você receberá um email quando for aprovado
3. Geralmente leva de **1 a 3 dias úteis**

> 📧 Fique de olho no seu email (inclusive na pasta de spam)!

---

## 🔑 PARTE 2: Obter suas chaves de API

Depois que sua conta for aprovada, você precisa pegar as **chaves de API** para conectar ao OrderZap.

### Passo 2.1 - Acessar o Dashboard

1. Acesse: **dashboard.pagar.me**
2. Faça login com seu email e senha

### Passo 2.2 - Ir para Configurações

1. No menu lateral esquerdo, procure por **"Configurações"** (ícone de engrenagem ⚙️)
2. Clique em **"Configurações"**

### Passo 2.3 - Encontrar as Chaves de API

1. Dentro de Configurações, procure por **"Chaves de API"** ou **"API Keys"**
2. Clique nessa opção

Você verá uma tela com suas chaves:

```
┌─────────────────────────────────────────────────────────────┐
│  🔐 Chaves de API                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  API Key (Secret Key):                                      │
│  ┌─────────────────────────────────────────────┐            │
│  │ sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx    │  [Copiar]  │
│  └─────────────────────────────────────────────┘            │
│                                                             │
│  Public Key (Chave Pública):                                │
│  ┌─────────────────────────────────────────────┐            │
│  │ pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx    │  [Copiar]  │
│  └─────────────────────────────────────────────┘            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Passo 2.4 - Copiar as chaves

1. **API Key (Secret Key)**: Clique no botão **[Copiar]** ao lado
   - Essa chave começa com `sk_live_` (produção) ou `sk_test_` (testes)
   - **Cole em um bloco de notas** para não perder

2. **Public Key**: Clique no botão **[Copiar]** ao lado
   - Essa chave começa com `pk_live_` (produção) ou `pk_test_` (testes)
   - **Cole também no bloco de notas**

> 🔒 **SEGURANÇA**: A Secret Key (sk_) é como a senha do seu banco. **NUNCA** compartilhe com ninguém!

---

## ⚙️ PARTE 3: Configurar no OrderZap

Agora vamos colocar as chaves no OrderZap.

### Passo 3.1 - Acessar as Integrações

1. No OrderZap, clique em **"Configurações"** no menu superior
2. Clique na aba **"Integrações"**
3. Role a página até encontrar **"Pagar.me"**

### Passo 3.2 - Preencher os campos

Você verá um formulário assim:

```
┌─────────────────────────────────────────────────────────────┐
│  💳 Integração de Pagamento - Pagar.me                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  API Key (Secret Key) *                                     │
│  ┌─────────────────────────────────────────────┐            │
│  │                                             │            │
│  └─────────────────────────────────────────────┘            │
│  Chave secreta obtida no painel do Pagar.me                 │
│                                                             │
│  Public Key (Chave Pública)                                 │
│  ┌─────────────────────────────────────────────┐            │
│  └─────────────────────────────────────────────┘            │
│  Chave pública do Pagar.me                                  │
│                                                             │
│  Webhook Secret                                             │
│  ┌─────────────────────────────────────────────┐            │
│  └─────────────────────────────────────────────┘            │
│  (Será configurado depois)                                  │
│                                                             │
│  ○ Modo Sandbox (Testes)                                    │
│                                                             │
│  [    Salvar e Ativar    ]                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Preencha assim:**

| Campo | O que fazer |
|-------|-------------|
| **API Key** | Cole a chave que começa com `sk_live_` |
| **Public Key** | Cole a chave que começa com `pk_live_` |
| **Webhook Secret** | Deixe vazio por enquanto |
| **Modo Sandbox** | Deixe **desmarcado** para produção |

### Passo 3.3 - Salvar

1. Clique no botão **"Salvar e Ativar"**
2. Aguarde a mensagem de confirmação

> ✅ Se tudo estiver correto, você verá: **"Integração salva com sucesso!"**

> ⚠️ **ATENÇÃO**: Se você tinha o Mercado Pago ativo, ele será desativado automaticamente. Apenas **uma integração de pagamento** pode estar ativa por vez.

---

## 🔔 PARTE 4: Configurar o Webhook (Notificações Automáticas)

O **webhook** é o que permite o OrderZap saber quando um pagamento foi confirmado. **Esta etapa é muito importante!**

### Passo 4.1 - Voltar ao Dashboard do Pagar.me

1. Acesse novamente: **dashboard.pagar.me**
2. Faça login se necessário

### Passo 4.2 - Acessar Webhooks

1. No menu lateral, clique em **"Configurações"** (⚙️)
2. Procure por **"Webhooks"** ou **"Notificações"**
3. Clique nessa opção

### Passo 4.3 - Criar novo Webhook

1. Clique no botão **"Adicionar Webhook"** ou **"+ Novo Webhook"**

Você verá um formulário para preencher:

### Passo 4.4 - Preencher os dados do Webhook

**Campo: URL de destino**
```
https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/pagarme-webhook
```

> 📋 **Copie exatamente** esta URL. Qualquer letra errada e não vai funcionar!

**Campo: Eventos (selecione os seguintes):**

Marque as caixinhas:
- ✅ `charge.paid` - Cobrança paga
- ✅ `order.paid` - Pedido pago

Opcionalmente, você também pode marcar:
- ☐ `charge.payment_failed` - Pagamento falhou (para receber notificação de falhas)

### Passo 4.5 - Salvar o Webhook

1. Clique em **"Salvar"** ou **"Criar Webhook"**
2. O Pagar.me vai exibir um **Webhook Secret** (uma sequência de letras e números)

### Passo 4.6 - Copiar o Webhook Secret (Opcional mas recomendado)

1. Copie o **Webhook Secret** que apareceu
2. Volte ao OrderZap → Configurações → Integrações → Pagar.me
3. Clique em **"Editar Configurações"**
4. Cole no campo **"Webhook Secret"**
5. Clique em **"Salvar"**

> 🔐 O Webhook Secret adiciona uma camada extra de segurança, garantindo que apenas o Pagar.me pode enviar notificações.

---

## 🧪 PARTE 5: Testar a Integração

Antes de usar com clientes reais, faça um teste!

### Opção A: Teste com valor real (recomendado)

1. Crie um pedido de teste no OrderZap (pode ser R$ 1,00)
2. Acesse o link de checkout
3. Pague com seu próprio cartão
4. Verifique se o pedido foi marcado como **"Pago"** automaticamente
5. Depois, você pode estornar o pagamento no Dashboard do Pagar.me

### Opção B: Modo Sandbox (ambiente de testes)

Se preferir testar sem dinheiro real:

1. No OrderZap, edite a integração Pagar.me
2. Ative a opção **"Modo Sandbox"**
3. Troque as chaves pelas versões de teste:
   - Use `sk_test_...` em vez de `sk_live_...`
   - Use `pk_test_...` em vez de `pk_live_...`

**Cartões de teste do Pagar.me:**

| Resultado | Número do Cartão | CVV | Validade |
|-----------|------------------|-----|----------|
| ✅ Aprovado | `4000 0000 0000 0010` | `123` | Qualquer data futura |
| ❌ Recusado | `4000 0000 0000 0028` | `123` | Qualquer data futura |

> ⚠️ **LEMBRE-SE**: Após os testes, volte para as chaves de **produção** (`_live_`) para receber pagamentos reais!

---

## ❓ Problemas Comuns e Soluções

### ❌ "Credenciais inválidas" ou "Chave incorreta"

**Possíveis causas:**
- Você copiou a chave com espaços extras no início ou fim
- Está usando chave de sandbox (`_test_`) no modo produção (ou vice-versa)

**Como resolver:**
1. Volte ao Dashboard do Pagar.me
2. Copie a chave novamente com cuidado
3. Cole diretamente no campo, sem adicionar nada

---

### ❌ Pagamento confirmado, mas pedido não foi marcado como pago

**Possíveis causas:**
- O webhook não está configurado
- A URL do webhook está errada
- Os eventos não estão selecionados

**Como resolver:**
1. Acesse Pagar.me → Configurações → Webhooks
2. Verifique se o webhook existe
3. Confirme se a URL é exatamente:
   ```
   https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/pagarme-webhook
   ```
4. Confirme se `charge.paid` e `order.paid` estão marcados

---

### ❌ Erro ao processar pagamento

**Possíveis causas:**
- API Key incorreta
- Conta ainda não aprovada
- Problema temporário no Pagar.me

**Como resolver:**
1. Verifique se recebeu o email de aprovação da conta
2. Acesse o Dashboard e veja se há algum aviso
3. Tente novamente em alguns minutos

---

## 📞 Precisa de Ajuda?

### Suporte Pagar.me
- 📧 Email: suporte@pagar.me
- 📚 Documentação: [docs.pagar.me](https://docs.pagar.me)
- 💬 Chat: Disponível no Dashboard

### Suporte OrderZap
- Entre em contato com o administrador do sistema

---

## ✅ Checklist Final

Antes de começar a vender, confirme:

- [ ] Conta no Pagar.me aprovada
- [ ] API Key configurada no OrderZap
- [ ] Public Key configurada no OrderZap
- [ ] Webhook criado no Pagar.me com a URL correta
- [ ] Eventos `charge.paid` e `order.paid` selecionados
- [ ] Teste de pagamento realizado com sucesso
- [ ] Modo Sandbox **desativado** (para receber pagamentos reais)

---

**🎉 Parabéns! Sua integração está configurada!**

Agora seus clientes podem pagar pelo checkout e os pedidos serão marcados como pagos automaticamente.

---

*Última atualização: Janeiro 2026*
