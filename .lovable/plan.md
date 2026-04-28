## Objetivo

Copiar os 8 templates de WhatsApp da **Mania de Mulher** (`08f2b1b9...`) para:
- **Cabello Mania** → link `https://app.orderzaps.com/t/cabellomania/checkout`
- **Revele Semi Jóias** → link `https://app.orderzaps.com/t/revelesemijoias/checkout`
- **La Grandame** → link `https://app.orderzaps.com/t/lagrandame/checkout`

A única diferença entre os tenants é a substituição do link de checkout `https://app.orderzaps.com/t/app/checkout` (Mania de Mulher) e da menção "Mania de Mulher" no template ITEM_ADDED, que será trocada pelo nome de cada empresa.

## Templates a replicar (8 tipos)

1. `ITEM_ADDED` — Item Adicionado ao Pedido (contém link e nome da loja)
2. `PRODUCT_CANCELED` — produto cancelado
3. `PAID_ORDER` — Pedido Pago
4. `MSG_MASSA` — Mensagem em Massa (contém link)
5. `SENDFLOW` — SendFlow Divulgação em Grupos
6. `TRACKING` — Código de Rastreio
7. `BLOCKED_CUSTOMER` — Mensagem de Cliente Bloqueado
8. `DM_INSTAGRAM_CADASTRO` — Cadastro Sistema

## Como será aplicado (técnico)

Migration SQL única que para cada tenant destino:

1. **Apaga** todos os templates existentes daqueles 8 tipos (limpa também as duplicatas de `MSG_MASSA` já presentes — ver memória `persistencia-e-deduplicacao-templates`).
2. **Insere** as 8 novas linhas copiadas do tenant Mania de Mulher, aplicando `REPLACE` no campo `content`:
   - `https://app.orderzaps.com/t/app/checkout` → link do tenant destino
   - Em `ITEM_ADDED`, substituir "Mania de Mulher" pelo nome da loja destino (Cabello Mania / Revele Semi Jóias / La Grandame).
3. Mantém os mesmos `title` e `type`. Define `updated_at = now()`.

Resultado: cada tenant destino fica com exatamente 1 template por tipo (8 no total), idêntico ao original exceto pelo link e nome da loja.

## Observações

- Não há alteração de código (frontend/edge functions). Apenas SQL.
- Operação é idempotente: pode ser reexecutada com segurança.
- Nenhum template da Mania de Mulher é alterado.
