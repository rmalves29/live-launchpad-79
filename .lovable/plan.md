# Corrigir baixa de estoque na edição de pedidos

## Objetivo
Garantir que adicionar um produto ou aumentar sua quantidade em um pedido sempre desconte o estoque, sem permitir quantidade acima do disponível.

## Implementação
1. Criar uma função segura e atômica no banco para reservar ou devolver estoque, validando empresa, produto e saldo disponível em uma única operação.
2. Alterar a janela de edição do pedido para usar essa função antes de incluir ou aumentar itens.
3. Se a gravação do item falhar, devolver automaticamente o estoque reservado.
4. Ao diminuir ou remover um item, devolver a quantidade ao estoque pela mesma função.
5. Exibir erro claro e manter a quantidade anterior quando não houver saldo suficiente.

## Validação
- Repetir o cenário do teste: incluir 1 unidade, aumentar pela seta até o limite e tentar ultrapassá-lo.
- Conferir simultaneamente quantidade do pedido, estoque do produto e histórico de movimentação.
- Confirmar que falhas não deixam item e estoque divergentes.

## Observação técnica
A correção deixa de depender de uma leitura seguida de atualização no navegador. A alteração condicional acontece diretamente no PostgreSQL, evitando concorrência e falhas silenciosas.
