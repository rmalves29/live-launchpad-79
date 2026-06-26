
# Reduzir contagem do Z-API no SendFlow (imagem + texto = 1 mensagem)

## Diagnóstico

O envio do SendFlow já faz **uma única chamada** para o Z-API (`POST /send-image` com `caption`). Não existe envio duplicado no código.

O "2 mensagens" que você vê é **regra de cobrança/contagem do próprio Z-API**: toda chamada para `/send-image` é faturada/contada como 2 (1 do tipo *mídia* + 1 da *caption*), independente de chegar como bolha única no WhatsApp do cliente. Isso é definido pela Z-API, não tem como pedir pra eles "cobrarem 1" — precisamos mudar o tipo de envio.

## Solução proposta

Trocar `/send-image` por **`/send-link`** no `sendflow-process`. Esse endpoint do Z-API manda 1 mensagem de texto contendo a URL da imagem, e o WhatsApp automaticamente renderiza um **preview com miniatura da foto, título e descrição**. Visualmente fica parecido com a foto + legenda, mas o Z-API conta como **1 única mensagem**.

### Comparação

```text
HOJE (/send-image)             PROPOSTA (/send-link)
┌──────────────────┐           ┌──────────────────┐
│   [foto grande]  │           │ ┌──────────────┐ │
│                  │           │ │[mini][título]│ │
│ Texto da legenda │           │ │   [descr]    │ │
│ com variáveis... │           │ └──────────────┘ │
└──────────────────┘           │ Texto completo   │
2 msgs no Z-API                │ com variáveis... │
                               └──────────────────┘
                               1 msg no Z-API
```

### Trade-offs (você decide)

- ✅ **Reduz pela metade** a contagem do Z-API → economia direta no plano e menor risco de bloqueio.
- ✅ Texto e preview chegam como bolha única no WhatsApp.
- ⚠️ A foto aparece como **miniatura** (cerca de 1/3 do tamanho de uma foto enviada normalmente), não em tela cheia. Cliente precisa tocar para abrir grande.
- ⚠️ Depende do WhatsApp do destinatário ter renderização de link preview ativada (padrão em ~99% dos casos).
- ⚠️ A primeira linha do `caption` vira o "título" do preview; precisamos garantir que o template fique legível nesse formato.

## Mudanças técnicas

**Arquivo:** `supabase/functions/sendflow-process/index.ts`

Na função `sendGroupMessage` (linhas ~190-232), quando `imageUrl` existir, trocar:

```typescript
// ANTES
url = `${ZAPI_BASE_URL}/.../send-image`;
body = { phone: groupId, image: imageUrl, caption: variedMessage };

// DEPOIS
url = `${ZAPI_BASE_URL}/.../send-link`;
body = {
  phone: groupId,
  message: variedMessage,           // texto completo
  image: imageUrl,                  // thumb do preview
  linkUrl: imageUrl,                // URL clicável
  title: product.name,              // título do card
  linkDescription: `Código ${product.code}`,
};
```

Para passar `product.name` e `product.code`, ajustar a assinatura de `sendGroupMessage` pra receber o `product` (ou só os 2 campos).

Quando **não houver imagem**, mantém `/send-text` exatamente como hoje.

## Validação

1. Após deploy, abrir o SendFlow, selecionar 1 produto com foto + 1 grupo de teste e disparar.
2. Conferir no WhatsApp se chegou como bolha única com preview da foto.
3. Conferir no painel do Z-API se o contador subiu **+1** (e não +2) para esse envio.

## Alternativas (caso não goste do preview reduzido)

- **Manter como está** (foto grande, conta 2) — sem mudança no código.
- **Enviar só texto sem foto** (conta 1, mas perde a imagem completamente).
