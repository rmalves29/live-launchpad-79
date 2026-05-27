# Ajuste da variável `{{quantidade}}` no template de Item Adicionado

## Objetivo
A variável `{{quantidade}}` deve refletir **exatamente** a quantidade enviada pelo cliente naquele evento (ex.: `C100` → 1, `C100x3` → 3) e **só aparecer se o lojista a incluir no template**. O sistema nunca deve injetar quantidade por conta própria.

## O que está acontecendo hoje
1. O trigger `send_whatsapp_on_item_added` **já envia o delta correto** (`NEW.qty - OLD.qty` em UPDATE, `NEW.qty` em INSERT). ✅
2. A função `zapi-send-item-added` substitui `{{quantidade}}` pela qty recebida — então se o template não tiver `{{quantidade}}`, nada é injetado. ✅
3. **Porém**, a função ainda suporta `{{qtd_aleatoria}}` que gera um número aleatório entre 2 e 4 (anti‑bloqueio antigo). 12 templates de tenants existentes ainda usam essa variável, então o cliente recebe "3 unidades" quando comprou só 1. ❌

## Mudanças

### 1. Remover a injeção de quantidade aleatória do código
**Arquivo:** `supabase/functions/zapi-send-item-added/index.ts` (função `formatMessage`)

- Apagar a geração de `randomQty` e a substituição de `{{qtd_aleatoria}}`.
- Manter apenas a substituição de `{{quantidade}}` pelo valor real (delta) recebido do trigger.
- Resultado: se o template não contém `{{quantidade}}`, nada referente a quantidade aparece na mensagem.

### 2. Migrar templates dos tenants existentes
SQL para rodar manualmente no SQL Editor:

```sql
UPDATE whatsapp_templates
SET content = REPLACE(content, '{{qtd_aleatoria}}', '{{quantidade}}'),
    updated_at = now()
WHERE type = 'ITEM_ADDED'
  AND content LIKE '%qtd_aleatoria%';
```

Isso converte os 12 templates existentes para usar a quantidade real. Se algum lojista preferir não exibir quantidade, ele edita o template manualmente e remove `{{quantidade}}` — o sistema vai respeitar.

### 3. Tenants futuros
A função `create_default_whatsapp_templates` (criada quando uma empresa nova é cadastrada) já usa `{{quantidade}}` no template padrão. ✅ Sem alteração necessária.

## Resultado esperado
- Cliente envia `C100` no grupo → mensagem mostra **1** (ou só "item adicionado" se o lojista não usar a variável).
- Cliente envia `C100x3` → mensagem mostra **3**.
- Cliente adiciona o mesmo código duas vezes → recebe duas mensagens, cada uma com a quantidade incremental daquele evento (nunca o acumulado do carrinho).
- Nenhum número aleatório é injetado pelo sistema.

## Não está no escopo
- Mexer no trigger (já está correto).
- Mexer na lógica de anti‑bloqueio de delays/emojis — só a quantidade aleatória sai.
- Outras funções (`zapi-send-paid-order`, `zapi-send-tracking`, etc.) — não usam `{{qtd_aleatoria}}`.
