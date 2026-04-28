
## Diagnóstico

A página de Relatórios da Mania de Mulher mostra **R$ 58.840,35** em vendas pagas no ano, **1000 pedidos** e **1060 produtos**. Os dados reais no banco para 2026:

- **Vendas pagas: R$ 148.975,77** (1352 pedidos não cancelados)
- **Vendas pendentes: R$ 51.995,81**
- **Pedidos cancelados ignorados:** 171 pedidos / R$ 24.659,96

### Causa raiz

**1. Limite de 1000 linhas do PostgREST (causa principal).** Todas as queries de `orders` em `loadPeriodStats`, `loadTodaySales`, `loadTopProducts`, `loadWhatsAppGroupStats` e `loadTopCustomers` carregam pedidos sem paginação. O Supabase corta silenciosamente em 1000 linhas — por isso aparece exatamente "1000 pedidos" e o ticket médio de R$135,46 bate com `(58.840 + 76.615) / 1000`. Qualquer empresa com mais de 1000 pedidos no período tem números truncados.

**2. Pedidos cancelados sendo somados.** As queries não filtram `is_cancelled = false`, então pedidos cancelados (que zeraram estoque e foram estornados) inflam os totais de "Vendas Pendentes" e "Pedidos".

**3. Pequenos ruídos.** Em algumas funções as datas usam `new Date().toISOString()` (UTC) em vez de helpers Brasília, causando off-by-one perto da meia-noite.

## O que vou alterar

Arquivo único: `src/pages/relatorios/Index.tsx`

### A. Paginação batched (resolve o "1000 pedidos")

Criar um helper local `fetchAllOrders(query)` que pagina em blocos de 1000 via `.range(from, to)` até esgotar o resultado (padrão já usado em outras partes do projeto, conforme memória `paginacao-batch-postgrest`). Aplicar nas 5 funções de carregamento:

- `loadTodaySales`
- `loadPeriodStats` (3 queries: dia, mês, ano)
- `loadTopProducts`
- `loadWhatsAppGroupStats`
- `loadTopCustomers`

### B. Ignorar pedidos cancelados

Adicionar `.eq('is_cancelled', false)` (ou `.or('is_cancelled.is.null,is_cancelled.eq.false')` para cobrir nulos antigos) em todas as queries de `orders` das 5 funções acima. Isso alinha a página com o comportamento já praticado no resto do sistema (memória `cancelamento-automatico-por-estorno`).

### C. Padronizar datas para Brasília

Substituir os `new Date().toISOString().split('T')[0]` em `loadWhatsAppGroupStats` e `loadTopCustomers` pelos helpers já usados nas outras funções: `getBrasiliaDateISO()`, `getBrasiliaDate()`, `toBrasiliaDateISO()`, `getBrasiliaDayBoundsISO()`. Aderente à core rule de UTC-3.

### D. Verificação após o ajuste

Vou rodar uma query SQL comparando o que a página mostra com a realidade do banco para Mania de Mulher (ano atual) e confirmar que:
- Vendas pagas ≈ R$ 148.975,77
- Pedidos ≈ 1352
- Produtos refletem a soma real de `cart_items.qty`

## Detalhes técnicos

Helper de paginação (esboço):

```ts
async function fetchAllOrders(buildQuery: () => any) {
  const PAGE = 1000;
  let from = 0;
  const all: any[] = [];
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
```

Cada chamada existente do tipo `await ordersQuery` passa a usar `await fetchAllOrders(() => baseQuery)`.

## Fora do escopo

- Não vou mexer no Agente IA (que já tem seu próprio carregamento e está fora da reclamação).
- Não vou alterar layout, filtros ou abas — apenas a integridade dos números.
- Não vou tocar em outras páginas (Pedidos, Clientes, etc.).
