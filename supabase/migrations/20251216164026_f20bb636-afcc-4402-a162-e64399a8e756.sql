-- Atualizar pedido #201 com informação do frete PAC
UPDATE orders 
SET observation = '[FRETE] Correios - PAC | R$ 25.11'
WHERE id = 201;