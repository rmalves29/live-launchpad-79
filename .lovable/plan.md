

## Garantir aplicação rápida e confiável do desconto PIX no checkout

### Resposta direta

Sim. A solução combina **duas camadas**: uma rápida no frontend (para o cliente ver o desconto na hora) e uma blindagem no backend (para garantir que o desconto sempre saia certo, mesmo se o frontend falhar).

### Camada 1 — Frontend instantâneo (`PublicCheckout.tsx`)

**Problema atual**: o `pix_discount_percent` só carrega depois de um `useEffect` assíncrono que consulta 4 tabelas em sequência. Se o cliente clica antes, vai sem desconto.

**Mudanças**:

1. **Pré-carregar junto com o carrinho** — mover a busca do `pix_discount_percent` para dentro do mesmo `useEffect` que já carrega o carrinho/produtos do tenant, em paralelo (`Promise.all`). Quando a tela renderizar pela primeira vez, o desconto já está disponível.

2. **Cache em `sessionStorage`** — gravar `pix_discount_percent` por `tenant_id` no `sessionStorage`. Em retornos à tela (cliente fecha e abre, ou recarrega), o valor é lido instantaneamente do cache enquanto o backend revalida em segundo plano.

3. **Bloquear o botão "Continuar para pagamento"** enquanto `pixDiscountPercent` ainda for `null` (estado de carregamento). O botão fica com label "Carregando…" por no máximo ~500ms na primeira visita; nas próximas é instantâneo por causa do cache.

4. **Pré-busca opcional** na entrada da loja (`TenantStorefront.tsx`) — quando o cliente abre a vitrine, já dispara em background a query do `pix_discount_percent`. Quando ele chegar no checkout, o valor já está no cache.

### Camada 2 — Backend blindado (rede de segurança)

Mesmo com tudo isso, se o frontend mandar `pix_discount: 0` por qualquer motivo (rede ruim, bug de cache, cliente em modo anônimo), o backend **recalcula sozinho**:

- Helper `_shared/pix-discount.ts` (já planejado) consulta a integração ativa do tenant e calcula o desconto correto antes de criar o pedido.
- Frontend nunca mais consegue "errar" o valor — vira só uma sugestão para a UI.

Isso garante que:
- **99% dos clientes** vão ver o desconto na hora (camada 1).
- **100% dos clientes** vão pagar com o desconto correto (camada 2).

### Aplica também para cupom?

Não no escopo desta entrega — cupons já funcionam (são aplicados manualmente pelo cliente digitando código). Só o desconto PIX automático precisa dessa otimização.

### O que NÃO muda

- Backend de pagamento (já vai ser corrigido no plano anterior aprovado).
- Trava de método de pagamento.
- Banco de dados, RLS, triggers.
- Demais gateways e webhooks.

### Detalhes técnicos

**Arquivos editados:**

- `src/pages/pedidos/PublicCheckout.tsx`
  - Mover `loadPixDiscount` para dentro do `useEffect` principal que carrega o carrinho, paralelizado com `Promise.all`
  - Adicionar leitura/escrita em `sessionStorage` com chave `pix_discount_${tenant_id}` (TTL de 10min via timestamp)
  - Estado `pixDiscountLoading: boolean`; botão "Continuar" desabilitado enquanto `true` com label "Carregando…"
  - Skeleton/placeholder na linha "Desconto PIX" do resumo durante o loading

- `src/pages/TenantStorefront.tsx`
  - Disparar pré-busca `select pix_discount_percent` em background ao montar a vitrine, gravando no mesmo `sessionStorage`

- (Já no plano anterior aprovado) `supabase/functions/_shared/pix-discount.ts` + ajustes em `create-payment` e `create-infinitepay-payment` — recalculam no servidor independente do que o frontend mandou.

**Sem migrações de banco. Sem novos secrets.**

### Validação após deploy

1. **Teste de velocidade**: abrir vitrine da Roanne Joias, adicionar item, ir ao checkout → desconto PIX deve aparecer **na primeira renderização** (sem flicker).
2. **Teste de cache**: voltar ao checkout uma segunda vez → desconto aparece instantaneamente do `sessionStorage`.
3. **Teste de rede lenta**: simular throttle 3G no DevTools, clicar "Continuar" rapidamente → botão fica desabilitado até o desconto carregar; pedido sai correto.
4. **Teste de blindagem**: forçar `sessionStorage` corrompido + bloquear a query do front → backend ainda recalcula e pedido sai com desconto correto.

