## Problema identificado

A mensagem de "Item Adicionado" está chegando colada com saudações como "Olá tudo bem ?" e "Oi, tudo bem ?" (visível no print).

A causa está em `supabase/functions/zapi-send-item-added/index.ts`, nas linhas 559, 598 e 609, onde a função chama:

```ts
message = addMessageVariation(baseMessage);
```

Sem passar o segundo parâmetro `isBulk`. O default de `addMessageVariation` é `isBulk = true`, e quando bulk está ativo a função **adiciona uma saudação aleatória** (`BULK_GREETINGS` em `_shared/anti-block-delay.ts`) no início da mensagem:

- "Olá tudo bem ? "
- "Oi, tudo bem ? "
- "Olá como vai ? "

Item adicionado é uma mensagem **transacional individual**, não disparo em massa, então não deveria receber esse prefixo.

## Correção

Alterar as 3 chamadas em `zapi-send-item-added/index.ts` para:

```ts
message = addMessageVariation(baseMessage, false);
```

Isso:
- Mantém a variação invisível (zero-width space) anti-spam.
- Mantém troca sutil de emoji desligada (segue `isBulk`).
- **Remove** o prefixo de saudação indesejado.

A função `zapi-proxy` (usada por disparo em massa real) continua chamando com `isBulk = true`, então o comportamento de massa não muda.

## Arquivos afetados

- `supabase/functions/zapi-send-item-added/index.ts` (3 linhas)

Sem mudança de schema, sem migration, sem nova função.
