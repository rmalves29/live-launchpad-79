## Objetivo

Trocar a lógica atual de ranking de clientes (score normalizado 40% volume + 60% receita) por um modelo **RFM** com 3 pilares pontuados de 1 a 5, somando um score final de **3 a 15**.

## Os 3 pilares

1. **Valor (V)** — soma de `paid_revenue` do cliente no período filtrado
2. **Frequência (F)** — número de `paid_orders` do cliente no período filtrado
3. **Recência (R)** — dias desde a última compra paga (`last_paid_order_date`)

Cada pilar recebe nota **1 a 5**, e o score final é simplesmente:

```text
Score = Valor + Frequência + Recência   (mínimo 3, máximo 15)
```

## Como atribuir as notas (1–5)

Para **Valor** e **Frequência** vou usar **quintis** (percentis 20/40/60/80) calculados sobre o conjunto de clientes do período. Isso garante distribuição justa independentemente do tamanho da base:

- Top 20% → nota 5
- 20%–40% → nota 4
- 40%–60% → nota 3
- 60%–80% → nota 2
- Bottom 20% → nota 1

Para **Recência** uso faixas absolutas em dias (alinhado ao texto do pedido):

| Dias desde última compra paga | Nota |
|---|---|
| 0–7 dias                       | 5 |
| 8–30 dias                      | 4 |
| 31–60 dias                     | 3 |
| 61–180 dias                    | 2 |
| > 180 dias                     | 1 |

Clientes sem nenhuma compra paga ficam com `paid_revenue=0`, `paid_orders=0` e recência baseada em `last_order_date` (cai em notas baixas naturalmente).

## Exemplo de leitura (igual ao do pedido)

| Cliente | V | F | R | Score |
|---|---|---|---|---|
| Ana    | 5 | 2 | 5 | 12 |
| Maria  | 3 | 5 | 4 | 12 |
| Carla  | 5 | 5 | 5 | **15** |

Quem compra pouco mas caro empata com quem compra muito mas barato — exatamente o que você descreveu.

## Mudanças no código

Arquivo único: `src/pages/relatorios/Index.tsx`

1. **Interface `CustomerStats`**: adicionar campos `score_value`, `score_frequency`, `score_recency` (1–5) e manter `score` (3–15) para compatibilidade da UI.

2. **`loadTopCustomers`**:
   - Continuar agregando `paid_orders`, `paid_revenue` e `last_order_date` (já existem).
   - Calcular cortes de quintil para `paid_revenue` e `paid_orders` ordenando os arrays.
   - Para cada cliente: calcular `score_value`, `score_frequency` (via quintis) e `score_recency` (via faixas de dias, usando `getBrasiliaDate()` como referência).
   - `score = score_value + score_frequency + score_recency`.
   - Ordenar por `score` desc, com desempate por `paid_revenue` desc e depois `paid_orders` desc. Manter Top 50.

3. **UI da tabela** (linhas ~1690–1786):
   - Substituir a célula que mostra apenas o `score` por um bloco compacto que exibe o **score final** em destaque + 3 mini-badges “V·F·R” (ex.: `5 · 2 · 5`) logo abaixo, para o usuário entender de onde veio a nota.
   - Manter pódio Ouro/Prata/Bronze para os 3 primeiros (continua usando `index`).
   - Adicionar tooltip curto no cabeçalho da coluna explicando o cálculo (Valor + Frequência + Recência).

4. **Sem mudanças** em paginação, filtros de período, filtro por tipo de venda, exclusão de cancelados e timezone — tudo isso já está correto após o ajuste anterior.

## Fora do escopo

- Não vou mexer em outros rankings (produtos, grupos WhatsApp).
- Não vou alterar pesos por configuração (tudo fixo conforme o modelo descrito). Se quiser pesos editáveis depois, faço numa segunda etapa.
- Não vou criar tabela nem persistir o score no banco — segue calculado em runtime, como hoje.
