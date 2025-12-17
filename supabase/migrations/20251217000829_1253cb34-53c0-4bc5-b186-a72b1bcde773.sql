-- Atualizar pedidos com formato [FRETE] para incluir o valor do frete no total
-- Apenas para pedidos onde o total claramente não inclui o frete

UPDATE orders
SET total_amount = total_amount + CAST(
  REPLACE(
    REPLACE(
      (regexp_match(observation, 'R\$\s*([\d.,]+)'))[1],
      ',', '.'
    ),
    ' ', ''
  ) AS NUMERIC
)
WHERE observation LIKE '%[FRETE]%' 
  AND observation ~ 'R\$'
  AND id IN (234, 198, 235);  -- Apenas os pedidos identificados que precisam correção