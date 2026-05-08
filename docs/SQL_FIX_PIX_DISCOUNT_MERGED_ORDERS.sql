-- ============================================================
-- CORREÇÃO: Pedidos mesclados que receberam o valor cheio
-- de [PIX_DISCOUNT] em CADA pedido (em vez de rateado).
--
-- EXECUTE NO SQL EDITOR DO SUPABASE.
-- ============================================================

-- Grupo 6347/6744 (pix_total=R$ 4,55, subs=71,80/79,90, frete=17,13)
UPDATE orders SET observation = regexp_replace(observation, '\[PIX_DISCOUNT\] R\$\s*[\d.,]+', '[PIX_DISCOUNT] R$ 2.15'), total_amount = 86.78 WHERE id = 6347;
UPDATE orders SET observation = regexp_replace(observation, '\[PIX_DISCOUNT\] R\$\s*[\d.,]+', '[PIX_DISCOUNT] R$ 2.40'), total_amount = 94.63 WHERE id = 6744;

-- Grupo 6258/6706 (pix_total=R$ 5,61, subs=117,00/69,90, frete=13,24)
UPDATE orders SET observation = regexp_replace(observation, '\[PIX_DISCOUNT\] R\$\s*[\d.,]+', '[PIX_DISCOUNT] R$ 3.51'), total_amount = 126.73 WHERE id = 6258;
UPDATE orders SET observation = regexp_replace(observation, '\[PIX_DISCOUNT\] R\$\s*[\d.,]+', '[PIX_DISCOUNT] R$ 2.10'), total_amount = 81.04 WHERE id = 6706;

-- Grupo 6640/6708 (pix_total=R$ 9,12, subs=234,00/69,90, frete=19,08)
UPDATE orders SET observation = regexp_replace(observation, '\[PIX_DISCOUNT\] R\$\s*[\d.,]+', '[PIX_DISCOUNT] R$ 7.02'), total_amount = 246.06 WHERE id = 6640;
UPDATE orders SET observation = regexp_replace(observation, '\[PIX_DISCOUNT\] R\$\s*[\d.,]+', '[PIX_DISCOUNT] R$ 2.10'), total_amount = 86.88 WHERE id = 6708;

-- Grupo 6430/6508 (pix_total=R$ 38,67, subs=223,20/53,00, frete=25,00)
UPDATE orders SET observation = regexp_replace(observation, '\[PIX_DISCOUNT\] R\$\s*[\d.,]+', '[PIX_DISCOUNT] R$ 31.25'), total_amount = 216.95 WHERE id = 6430;
UPDATE orders SET observation = regexp_replace(observation, '\[PIX_DISCOUNT\] R\$\s*[\d.,]+', '[PIX_DISCOUNT] R$ 7.42'), total_amount = 70.58 WHERE id = 6508;

-- Grupo 6044/6058 (pix_total=R$ 15,96, subs=61,00/53,00, frete=25,00)
UPDATE orders SET observation = regexp_replace(observation, '\[PIX_DISCOUNT\] R\$\s*[\d.,]+', '[PIX_DISCOUNT] R$ 8.54'), total_amount = 77.46 WHERE id = 6044;
UPDATE orders SET observation = regexp_replace(observation, '\[PIX_DISCOUNT\] R\$\s*[\d.,]+', '[PIX_DISCOUNT] R$ 7.42'), total_amount = 70.58 WHERE id = 6058;
