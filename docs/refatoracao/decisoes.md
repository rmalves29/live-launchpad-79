# Log de decisões da refatoração do Cartzy

Plano em 4 etapas, por risco de algo parar de funcionar para as lojas:
🟢 zero · 🔵 baixo · 🟡 médio · 🔴 alto. Cada etapa só começa com o "ok" do Rafael.

## Etapa 1 · Zero risco 🟢 — 19/11/2026

Branch: `etapa-1-rede-de-protecao`. Nenhuma linha de código que roda em produção foi alterada:
só entraram testes, ferramentas de teste e documentação, e documentos antigos foram movidos da raiz para `docs/historico/`.

### O que foi feito

| Item | Entrega |
|---|---|
| 1.1 Checkout | `tests/checkout-cupom.test.mjs`: o desconto de cupom calculado na tela (`src/lib/live-shop.ts`) é comparado com o do servidor (`supabase/functions/live-shop`) em 5.000 carrinhos sorteados, mais os casos de cada tipo de cupom |
| 1.2 Pagamento | `tests/pagamento-gateway.test.mjs`: roda a função `create-payment` de verdade, com banco falso. Cobre a regra "cada loja só usa o próprio gateway", o erro "Não há sistema de pagamento cadastrado.", a ordem dos gateways, o desconto do Pix recalculado no servidor e a trava Pix/cartão |
| 1.3 Item adicionado | `tests/item-adicionado-pausa.test.mjs` roda a pausa de 30 min num Postgres de verdade (em memória). `tests/item-adicionado-envio.test.mjs` roda a função `zapi-send-item-added` |
| 1.4 Bling e estoque | `tests/bling-atendido.test.mjs` (Atendido e postagem) e `tests/estoque-erp.test.mjs` (reservado, conferência de 15 min e aviso de estoque do Bling) |
| 1.5 Mapa | `docs/refatoracao/mapa-dependencias.md`, gerado por `node tests/tools/mapa-dependencias.mjs` |
| 1.6 Documentos | 7 arquivos de diagnóstico antigos movidos da raiz para `docs/historico/` |
| 1.7 Tipos | Ver seção própria abaixo |

Como rodar os testes: `cd tests && npm install && npm test` (Node 22.18+). São ~90 testes em ~40 s.
Os testes ficam em `tests/` com `package.json` próprio: nada disso entra no build do Lovable.

### Achados (não corrigidos: a etapa 1 não muda comportamento)

Cada achado tem um teste que mostra o comportamento atual. Os marcados como `todo` mostram o que deveria acontecer
e passam a valer quando a correção for feita.

- **P-01 · Desconto do Pix pode vir de um gateway e a cobrança sair por outro** — ✅ corrigido no branch `correcoes-achados-p01-p04`. Decisão do Rafael (19/11, opção a): com mais de um gateway ativo vale a ordem da cobrança, InfinitePay > App Max > Pagar.me > Mercado Pago, para cobrança, desconto do Pix e telas. Regra única em `_shared/payment-provider.ts`
  - `_shared/pix-discount.ts` escolhe o desconto na ordem App Max > Pagar.me > Mercado Pago > InfinitePay.
  - `create-payment` cobra na ordem InfinitePay > App Max > Pagar.me > Mercado Pago.
  - Loja com InfinitePay e App Max ativos: cobra pela InfinitePay com o desconto configurado na App Max.
  - Teste `todo` em `pagamento-gateway.test.mjs`.
- **P-02 · Se o banco não responder, a mensagem de item adicionado sai sem pausa** — ✅ corrigido no branch `correcoes-achados-p01-p04`: tenta a pausa 3 vezes; se o banco seguir sem responder, só manda quando a cliente não recebeu mensagem nos últimos 30 min, e não manda se nem isso der para conferir
  - `zapi-send-item-added`: `supabase.rpc` devolve o erro em vez de lançar exceção, então o `catch` nunca roda e a decisão
    fica vazia, o que cai no "manda agora". Com o banco lento numa live, a regra anti-bloqueio deixa de valer.
  - Teste em `item-adicionado-envio.test.mjs` registra o comportamento atual.
- **P-03 · A função de item adicionado aceita qualquer chamada** (🔴 etapa 4, segurança)
  - `validateInternalRequest` sempre retorna `true` (só escreve um aviso no log). A única barreira é a chave pública do site,
    que qualquer pessoa vê no navegador. Com o `tenant_id` de uma loja, dá para disparar mensagens pelo chip dela.
  - Confirmar com o escritório de Segurança antes de mexer (quem chama a função hoje: gatilho do banco e outras funções).
- **P-04 · ~20% das mensagens de item adicionado saem com caractere invisível dentro do link do checkout** — ✅ corrigido no branch `correcoes-achados-p01-p04` (nas três cópias da regra, inclusive mensagens de cobrança)
  - `addMessageVariation` coloca um caractere invisível (anti-spam) em posição sorteada da mensagem inteira, inclusive no
    meio do link. Medido no teste: 403 de 2.000 mensagens com o link alterado. O link pode abrir errado ou nem abrir.
  - Teste `todo` em `item-adicionado-envio.test.mjs`. Correção: nunca inserir dentro de links. Vale também para outras mensagens
    que usam a mesma função.
- **P-05 · Bling: sem a linha de integração, o pedido não baixa estoque nem vira Atendido, e nada fica registrado** (🔵)
  - `finalizeAsAttended` lê `cfg.bling_deposit_id` sem checar se `cfg` existe; o erro cai no `catch` e só aparece no console.
- **P-06 · Regra do cupom em duas cópias** (tela e servidor) — hoje iguais, protegidas pelo teste de 5.000 casos.
  Juntar numa cópia só na etapa 2 (item 2.5).
- **P-07 · Lógica do checkout presa dentro das telas** — `Checkout.tsx` e `PublicCheckout.tsx` (~2.500 linhas cada) calculam
  totais dentro do componente; não dá para testar sem mexer no código. Etapa 2 (2.5) e etapa 4 (4.7).
- **P-08 · Funções internas não exportadas** — `create-payment`, `live-shop` e `bling-sync-orders` não exportam a lógica.
  Os testes leem as funções direto do arquivo (`tests/support/extract.mjs`), o que é frágil a renomeações.
  Na etapa 2, exportar essa lógica para módulos e trocar os testes para importação normal.

- **P-09 · Pix com cupom: a tela da live mostra um desconto menor do que o servidor cobra** (aberto)
  - Tela da live (`LiveShop.tsx`): Pix sobre (produtos − cupom). Servidor (`create-payment`): Pix sobre o total dos produtos,
    e o cupom é descontado à parte. Com cupom e Pix juntos, a cliente paga um pouco menos do que viu e a loja perde a diferença.
    Decidir qual base vale e alinhar as duas.

### Decisão a confirmar com o Rafael

- **Bling "Atendido"**: em 18/11 ficou decidido "todo pedido vai como Atendido". O commit `82ced93` (mesmo dia) abriu uma
  exceção: lojas **sem** transportadora com API ficam "Em aberto", porque nelas o Atendido do Bling dispara o
  "pedido enviado" antes da postagem. Os testes seguem o código atual (com a exceção).

### 1.7 Tipos no lugar de `as any` — adiado para a etapa 2

Não foi feito nesta etapa, por dois motivos encontrados ao começar:

1. **O projeto não tem verificação de tipos.** Não existe `tsconfig.json` na raiz e nenhum passo roda `tsc`; o Vite só apaga
   os tipos. Trocar `as any` por tipos "de verdade" sem um verificador não garante nada: o tipo novo poderia estar errado
   e ninguém saberia.
2. **Nas edge functions o risco não é zero.** Se a publicação das funções conferir os tipos (o Deno pode fazer isso),
   um tipo mais rígido pode fazer a publicação de uma função falhar. Isso é risco baixo, não zero.

Na etapa 2: primeiro criar a verificação de tipos (só avisando, sem bloquear nada), medir quantos erros existem hoje,
e só então trocar os `as any` dos fluxos críticos, conferindo que o JavaScript gerado continua idêntico.

Também observado: `npm ci` falha porque o `package-lock.json` está desatualizado em relação ao `package.json`
(o projeto usa `bun.lock`). Não afeta o Lovable, mas vale escolher um gerenciador só.

## App Max removida do sistema — 19/11/2026 (branch `remove-appmax`)

Situação no banco antes da remoção: 1 cadastro (Biquíni da Thay), **inativo** desde 18/02/2026, nenhum pedido pago pela
App Max. Removido do código: aba e tela de configuração, checklist de integrações, lista de chaves por loja, escolha do
gateway no checkout público, vitrine e live, desconto do Pix, trava Pix/cartão, `create-payment`, reenvio de webhooks e o
backfill de descontos. Nova ordem: InfinitePay > Pagar.me > Mercado Pago.

Fica para DEPOIS de publicar o código (nessa ordem, senão a versão antiga do `create-payment` quebra ao ler a tabela):
1. Apagar no Supabase as funções publicadas `appmax-create-payment` e `appmax-webhook` (não estão no repositório).
2. Apagar a tabela `integration_appmax` (1 linha inativa) e regenerar os tipos do Supabase.
