# Integração Instagram Live - Guia Completo

Este guia explica como configurar a integração do Instagram Live para capturar automaticamente pedidos de comentários em transmissões ao vivo.

## Visão Geral

A integração permite que:
- Clientes comentem o **código do produto** durante uma live
- O sistema identifique o produto automaticamente
- Um carrinho seja criado/atualizado para o cliente
- Uma DM seja enviada confirmando o item adicionado

---

## Pré-requisitos

1. **Conta Business no Instagram** (não funciona com conta pessoal)
2. **Página do Facebook** vinculada ao Instagram Business
3. **Acesso de Administrador** à Página do Facebook
4. **Conta de desenvolvedor** no Meta for Developers

---

## Passo 1: Criar um App no Meta for Developers

### 1.1 Acessar o Portal de Desenvolvedores

1. Acesse [developers.facebook.com](https://developers.facebook.com)
2. Faça login com sua conta do Facebook (mesma que administra a Página)
3. Clique em **"Meus Apps"** no canto superior direito

### 1.2 Criar Novo App

1. Clique em **"Criar App"**
2. Selecione **"Empresa"** como tipo de app
3. Preencha:
   - **Nome do App**: Ex: "OrderZap Instagram Live"
   - **Email de contato**: Seu email profissional
4. Clique em **"Criar App"**

---

## Passo 2: Configurar Produtos do App

### 2.1 Adicionar Instagram Graph API

1. No painel do app, clique em **"Adicionar Produto"**
2. Encontre **"Instagram Graph API"** e clique em **"Configurar"**
3. Isso adicionará o Instagram ao seu app

### 2.2 Adicionar Webhooks

1. No painel do app, clique em **"Adicionar Produto"**
2. Encontre **"Webhooks"** e clique em **"Configurar"**

---

## Passo 3: Configurar Permissões

### 3.1 Permissões Necessárias

No menu lateral, vá em **"Análise do App" > "Permissões e Recursos"** e solicite:

| Permissão | Descrição |
|-----------|-----------|
| `instagram_basic` | Acesso básico ao perfil do Instagram |
| `instagram_manage_comments` | Ler e responder comentários (inclui lives) |
| `pages_messaging` | Enviar mensagens diretas |
| `pages_read_engagement` | Ler engajamento da página |
| `pages_manage_metadata` | Gerenciar configurações da página |

> ⚠️ **Importante**: Algumas permissões requerem **análise do app** pelo Meta. Isso pode levar alguns dias.

### 3.2 Modo de Desenvolvimento

Enquanto aguarda aprovação, você pode testar com:
- Seu próprio perfil de Instagram
- Perfis adicionados como "Testadores" no app

Para adicionar testadores:
1. Vá em **"Funções" > "Funções"**
2. Clique em **"Adicionar pessoas"**
3. Adicione os Instagram usernames dos testadores

---

## Passo 4: Configurar o Webhook

### 4.1 Dados do Webhook OrderZap

Use estas informações para configurar o webhook:

| Campo | Valor |
|-------|-------|
| **URL de Callback** | `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/instagram-webhook` |
| **Token de Verificação** | `orderzap_instagram_verify` |

### 4.2 Configurar no Meta

1. No painel do app, vá em **"Webhooks"**
2. Selecione **"Instagram"** no dropdown
3. Clique em **"Editar assinatura"**
4. Preencha:
   - **URL de Callback**: Cole a URL acima
   - **Token de Verificação**: `orderzap_instagram_verify`
5. Clique em **"Verificar e Salvar"**

### 4.3 Assinar Eventos

Após verificação, marque os seguintes campos para assinar:

- [x] `comments` - Comentários em posts
- [x] `live_comments` - Comentários em lives
- [x] `mentions` - Menções em stories
- [x] `messages` - Mensagens diretas

Clique em **"Salvar"** para confirmar.

---

## Passo 5: Obter Tokens de Acesso

### 5.1 Gerar Token da Página

1. Vá em **"Ferramentas" > "Explorador da Graph API"**
2. Selecione seu app no dropdown
3. Clique em **"Gerar Token de Acesso"**
4. Selecione a Página do Facebook vinculada ao Instagram
5. Marque as permissões:
   - `pages_messaging`
   - `pages_read_engagement`
   - `instagram_basic`
   - `instagram_manage_comments`
6. Clique em **"Gerar Token de Acesso"**
7. **Copie e salve o token** (você vai precisar dele)

### 5.2 Converter para Token de Longa Duração

O token gerado expira em ~2 horas. Para obter um token de longa duração:

1. Acesse a URL (substitua os valores):

```
https://graph.facebook.com/v18.0/oauth/access_token?
  grant_type=fb_exchange_token&
  client_id=SEU_APP_ID&
  client_secret=SEU_APP_SECRET&
  fb_exchange_token=TOKEN_CURTO_AQUI
```

2. A resposta conterá o `access_token` de longa duração (~60 dias)

### 5.3 Obter Page Access Token Permanente

Para um token que nunca expira:

1. Use o token de longa duração obtido acima
2. Acesse:

```
https://graph.facebook.com/v18.0/me/accounts?access_token=TOKEN_LONGA_DURACAO
```

3. Na resposta, encontre sua página e copie o `access_token` dela
4. Este é o **Page Access Token permanente**

---

## Passo 6: Obter o Instagram Account ID

### 6.1 Via Graph API

1. No Explorador da Graph API, faça a requisição:

```
GET /me/accounts?fields=instagram_business_account
```

2. Isso retornará algo como:

```json
{
  "data": [
    {
      "instagram_business_account": {
        "id": "17841400123456789"
      },
      "id": "123456789012345"
    }
  ]
}
```

3. O `instagram_business_account.id` é o que você precisa

---

## Passo 7: Configurar no OrderZap

### 7.1 Acessar Configurações

1. Acesse o painel administrativo do OrderZap
2. Vá em **"Integrações"**
3. Encontre **"Instagram Live"**

### 7.2 Preencher Credenciais

| Campo | Valor |
|-------|-------|
| **Instagram Account ID** | O ID obtido no Passo 6 (ex: `17841400123456789`) |
| **Page Access Token** | O token permanente obtido no Passo 5.3 |
| **Webhook Verify Token** | `orderzap_instagram_verify` (ou seu token personalizado) |

### 7.3 Ativar a Integração

1. Ative o switch **"Ativo"**
2. Clique em **"Salvar"**

---

## Passo 8: Testar a Integração

### 8.1 Teste de Webhook

1. No Meta Developers, vá em **"Webhooks"**
2. Clique em **"Testar"** ao lado de `live_comments`
3. Verifique os logs no Supabase Edge Functions

### 8.2 Teste Real

1. Inicie uma Live no Instagram
2. Com outra conta, comente um código de produto (ex: `ABC123`)
3. Verifique se:
   - O pedido foi criado no OrderZap
   - A DM de confirmação foi enviada

---

## Formato dos Códigos de Produto

O sistema reconhece códigos no formato:

| Formato | Exemplo | Válido? |
|---------|---------|---------|
| Letras + Números | `ABC123` | ✅ |
| Com hífen | `ABC-123` | ✅ |
| Minúsculas | `abc123` | ✅ |
| Só números | `123456` | ❌ |
| Só letras | `ABCDEF` | ❌ |

**Regex utilizado**: `/\b([A-Za-z]{2,4}[-]?[0-9]{2,6})\b/i`

---

## Solução de Problemas

### Webhook não recebe eventos

1. Verifique se o app está em modo **"Ativo"** (não apenas Desenvolvimento)
2. Confirme que os campos estão assinados corretamente
3. Teste a URL do webhook manualmente

### DM não é enviada

1. Verifique se o `page_access_token` está correto
2. Confirme que as permissões `pages_messaging` estão aprovadas
3. Verifique os logs no Supabase

### Produto não encontrado

1. Confirme que o código do produto existe no OrderZap
2. Verifique se o produto está ativo
3. Confirme que o tenant_id está correto na integração

### Token expirado

1. Gere um novo token seguindo o Passo 5
2. Atualize nas configurações do OrderZap

---

## Limites e Considerações

| Aspecto | Limite |
|---------|--------|
| **Janela de mensagem** | 24 horas após interação do cliente |
| **Rate limit Graph API** | ~200 chamadas/hora/usuário |
| **Tamanho máximo DM** | 1.000 caracteres |

---

## Links Úteis

- [Meta for Developers](https://developers.facebook.com)
- [Instagram Graph API Docs](https://developers.facebook.com/docs/instagram-api)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer)
- [Webhook Reference](https://developers.facebook.com/docs/graph-api/webhooks)

---

## Suporte

Em caso de dúvidas:
1. Verifique os logs em: `Supabase Dashboard > Edge Functions > instagram-webhook > Logs`
2. Entre em contato com o suporte técnico OrderZap

---

*Última atualização: Janeiro 2026*
