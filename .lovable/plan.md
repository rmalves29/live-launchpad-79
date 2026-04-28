## Problema

O template do SendFlow é cadastrado com **linhas em branco** entre os blocos (nome/código, cor/tamanho, valores, observação, instrução final), mas a mensagem chega no grupo com tudo grudado, sem respeitar o espaçamento.

## Diagnóstico

Confirmado no banco — o template salvo tem inclusive duas linhas em branco entre alguns blocos:

```
{{nome}} ({{codigo}})
                            ← 1 linha em branco
Cor: {{cor}}
Tamanho: {{tamanho}}
                            ← 1 linha em branco
De: {{valor_original}}  Por: {{valor_promo}}
                            ← 2 linhas em branco
*{{observacao}}*
                            ← 2 linhas em branco
Para comprar, digite apenas o código: *{{codigo}}*
```

Três pontos no `supabase/functions/sendflow-process/index.ts` destroem a estrutura:

1. **Linha 134** — `message.replace(/\n{3,}/g, '\n\n')` colapsa qualquer sequência de 3+ quebras (ou seja, 2+ linhas em branco) para apenas 1 linha em branco. As "duas linhas em branco" propositais do template viram uma só.
2. **Linhas 117/123/130** — quando `cor`, `tamanho` ou `observacao` estão vazios, a regex `^.*\{\{...\}\}.*$/gim` apaga o conteúdo da linha mas deixa um `\n` órfão, que somado às quebras vizinhas gera mais quebras do que o template original — depois sofre o colapso da linha 134 e perde estrutura.
3. **Envio como legenda de imagem** (`send-image` com `caption`) — a Z-API normaliza whitespace em legendas, removendo quebras múltiplas. É a causa principal da mensagem chegar "grudada" mesmo quando o texto enviado tem `\n\n`.

## Solução

Reescrever o pipeline de personalização para **preservar 100% as quebras de linha do template original**, e contornar a normalização da Z-API em legendas usando um caractere invisível como "âncora" de linha em branco.

### Mudanças em `supabase/functions/sendflow-process/index.ts`

1. **Remover variáveis vazias sem destruir a estrutura**: ao detectar `{{cor}}`, `{{tamanho}}` ou `{{observacao}}` sem valor, remover a **linha inteira incluindo o `\n` final** (regex com `\n?` no final), em vez de deixar a linha vazia.
2. **Eliminar o colapso `\n{3,}` → `\n\n`**: respeitar exatamente o número de linhas em branco que o usuário cadastrou. Se ele quis 2 linhas em branco entre dois blocos, mantemos 2.
3. **Anti-colapso da Z-API em legendas**: para qualquer linha que ficar **vazia** (entre dois blocos de conteúdo), inserir um caractere invisível (zero-width space `\u200B`) nessa linha. WhatsApp/Z-API só colapsam linhas **completamente vazias**; uma linha contendo `\u200B` é tratada como linha "com conteúdo" e a quebra é mantida na renderização — sem aparecer nada visível para o destinatário.
4. **Manter o `addMessageVariation` apenas com `invisibleVariation: true`**, mas garantir que a inserção do zero-width space aleatório não caia em cima de uma quebra de linha (já é o caso atual).

### Verificação

Reenviar o mesmo produto (Anel Dourado Love – C4090810) sem observação para um grupo de teste e confirmar que a mensagem chega com a mesma estrutura visual do template cadastrado: 1 linha em branco após o nome, 1 linha em branco antes de "De:", e como não há observação, o bloco de observação some inteiro (sem deixar buraco extra).

## Arquivos

- `supabase/functions/sendflow-process/index.ts` — refatorar `personalizeMessage` e `applyPromotionalPriceFallback` conforme acima e redeployar a função.

Sem alterações no frontend, no banco ou em outras integrações.