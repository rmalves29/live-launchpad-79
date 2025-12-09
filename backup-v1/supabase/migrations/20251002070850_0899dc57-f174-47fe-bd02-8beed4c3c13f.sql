-- Adicionar coluna para armazenar faixas de desconto progressivo
ALTER TABLE coupons
ADD COLUMN progressive_tiers jsonb DEFAULT NULL;

-- Comentário explicando a estrutura esperada:
-- progressive_tiers será um array de objetos com a estrutura:
-- [
--   { "min_value": 0, "max_value": 100, "discount": 5 },
--   { "min_value": 100, "max_value": 200, "discount": 10 },
--   { "min_value": 200, "max_value": null, "discount": 15 }
-- ]
-- onde max_value = null significa "sem limite superior"

COMMENT ON COLUMN coupons.progressive_tiers IS 'Faixas de desconto progressivo: array de objetos com min_value, max_value e discount';