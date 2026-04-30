## Contexto

Por causa do bug de roteamento Z-API (chip físico compartilhado), 53 pedidos do dia 30/04/2026 foram criados na **MANIA DE MULHER** quando deveriam ter sido criados na **OF Beauty**. O catálogo das duas empresas usa o mesmo padrão de código (`C111`, `C178`, etc.), mas os produtos por trás de cada code são **completamente diferentes** (MdM = bijuteria, OF Beauty = cosméticos).

## Decisões já tomadas pelo usuário

1. Mover os pedidos para OF Beauty.
2. Remapear cada `cart_item` por `product_code` para o produto correspondente da OF Beauty (recalculando preço, nome, product_id, image_url).
3. **Manter na MdM** o pedido `#6565` (Maria Madalena, R$ 67, **PAGO**) — não mexer.
4. Pedido `#6567` (Marina Bessas, código C282 inexistente na OF Beauty) será movido mesmo assim, mantendo o item original (workaround pontual).
5. O pedido cancelado (`#6587`) também será movido junto.

## Escopo final

- **52 pedidos** a serem transferidos (todos do dia 30/04 exceto `#6565`).
- **Carts** correspondentes (52) também migram.
- **Cart_items** (≈52+) serão remapeados pelo `product_code` em produtos da OF Beauty.
- C282 do pedido `#6567` será mantido como está (não existe na OF Beauty), mas o `tenant_id` do item será atualizado.

## Plano de execução (em uma migration única, transacional)

```text
BEGIN

1) Para cada cart_item dos 52 pedidos:
     - Buscar produto da OF Beauty pelo product_code do item.
     - Se encontrado:
         UPDATE cart_items SET
           tenant_id = OF_BEAUTY,
           product_id = p_of.id,
           product_name = p_of.name,
           unit_price = COALESCE(p_of.promotional_price, p_of.price),
           product_image_url = p_of.image_url
     - Se NÃO encontrado (caso C282):
         UPDATE cart_items SET tenant_id = OF_BEAUTY  -- mantém snapshot original

2) UPDATE carts SET tenant_id = OF_BEAUTY WHERE id IN (...)

3) Para cada order, recalcular total_amount baseado nos novos cart_items
   (mantendo frete/pix_discount/coupon do observation, se houver):
     UPDATE orders SET
       tenant_id = OF_BEAUTY,
       total_amount = (novo_subtotal - desc_pix - desc_cupom) + frete

4) INSERT em audit_logs: registro completo da operação por pedido
   (tenant_origem, tenant_destino, total_anterior, total_novo, items_remapeados)

COMMIT
```

## Salvaguardas

- Tudo dentro de uma única transação — se algo falhar, rollback completo.
- Pedido pago `#6565` **explicitamente excluído** do escopo.
- Backup/snapshot via `audit_logs` com payload completo de cada item antes/depois.
- Trigger `validate_order_total_on_payment` não dispara (pedidos não estão sendo marcados como pagos).
- Trigger `set_tenant_id` não atrapalha (só roda em INSERT, não UPDATE).

## Impactos esperados

- Os 52 pedidos somem do painel da MdM e aparecem no painel da OF Beauty.
- **Os valores dos pedidos vão mudar drasticamente**, porque os preços da OF Beauty são muito menores que os da MdM (ex: C111 vai de R$ 55 → R$ 0,99). A maioria dos pedidos abertos hoje somando R$ ~3.000 deve cair para R$ ~500 após o remapeamento.
- Clientes (`customers`) **não serão movidos** — eles continuam vinculados à MdM. Se desejar replicar o cliente na OF Beauty, é uma etapa separada.
- Carrinhos abertos: os pagamentos pendentes referenciarão o tenant novo. Se o cliente clicar no link antigo, o pagamento vai cair como OF Beauty.
- Não vou disparar nenhum WhatsApp como efeito colateral (operação é só `UPDATE` em tabelas de dados).

## Confirmação final necessária

Antes de eu executar, me confirma duas coisas:

1. **Os preços vão mudar drasticamente** (cair muito). Tudo bem? Ou prefere **manter os preços/nomes originais** que foram cobrados (snapshot de bijuteria) e só trocar o `tenant_id` para a OF Beauty?
2. **Quero gravar um audit_log completo** do estado anterior pra você poder reverter caso necessário. Pode ser?

