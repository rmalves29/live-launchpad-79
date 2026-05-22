## Adicionar card "Valor Vendido" em Relatórios

### Contexto
A tela `/relatorios` hoje exibe 4 KPIs (Receita Paga, Pedidos, Produtos Vendidos, Ticket Médio). O objeto `stats` já calcula `total_sales` (soma de pagos + pendentes) e `unpaid_sales`, então não é necessária nenhuma nova query — esses valores já respeitam todos os filtros (período, tipo de venda Live/Bazar, R$/Qtd).

### Mudança
Em `src/pages/relatorios/Index.tsx` (array de KPIs ~linha 1577), adicionar 1 novo card:

- **Label:** `Valor Vendido`
- **Valor:** `formatCurrency(stats?.total_sales ?? 0)` — soma de pagos + pendentes
- **Sub:** `Pendente: {formatCurrency(stats?.unpaid_sales ?? 0)}`
- **Cor da barra:** `bg-cyan-500` (para diferenciar dos outros)
- **Ícone:** `Wallet` (lucide-react)

### Layout
O grid atual é `lg:grid-cols-4`. Passa para `lg:grid-cols-5` para acomodar 5 cards lado a lado em telas grandes, mantendo `sm:grid-cols-2` no mobile.

### Ordem proposta dos cards
1. Receita Paga
2. **Valor Vendido** (novo)
3. Pedidos
4. Produtos Vendidos
5. Ticket Médio

### Fora do escopo
- Nenhuma alteração de business logic, queries ou cálculos.
- Nenhuma mudança nos demais widgets (gráficos, tabelas, etc.).
