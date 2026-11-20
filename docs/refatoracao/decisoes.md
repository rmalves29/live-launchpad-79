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
- **P-05 · Bling: sem a linha de integração, o pedido não baixa estoque nem vira Atendido, e nada fica registrado** — ✅ corrigido na etapa 3 (sem a linha usa o depósito padrão; qualquer falha vai para `bling_sync_logs`)
  - `finalizeAsAttended` lê `cfg.bling_deposit_id` sem checar se `cfg` existe; o erro cai no `catch` e só aparece no console.
- **P-06 · Regra do cupom em duas cópias** (tela e servidor) — hoje iguais, protegidas pelo teste de 5.000 casos.
  Juntar numa cópia só na etapa 2 (item 2.5).
- **P-07 · Lógica do checkout presa dentro das telas** — `Checkout.tsx` e `PublicCheckout.tsx` (~2.500 linhas cada) calculam
  totais dentro do componente; não dá para testar sem mexer no código. Etapa 2 (2.5) e etapa 4 (4.7).
- **P-08 · Funções internas não exportadas** — `create-payment`, `live-shop` e `bling-sync-orders` não exportam a lógica.
  Os testes leem as funções direto do arquivo (`tests/support/extract.mjs`), o que é frágil a renomeações.
  Na etapa 2, exportar essa lógica para módulos e trocar os testes para importação normal.

- **P-09 · Pix com cupom: a tela da live mostra um desconto menor do que o servidor cobra** — ✅ corrigido na etapa 3. Decisão do Rafael (19/11): Pix sobre o subtotal cheio dos produtos (igual ao servidor e ao checkout público); a tela da live passou a usar essa base
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

Limpeza do banco: migração `20261119140000_remove_appmax.sql` (vai junto com o código).
- Tira a App Max da regra "só um gateway ativo por loja" (`deactivate_other_payment_integrations`). Sem isso, ativar
  Mercado Pago, Pagar.me, InfinitePay ou Sipag daria erro quando a tabela saísse.
- Arquiva a tabela (reversível): `integration_appmax` vai para `arquivo.integration_appmax_removida`, fora da API.
- As funções publicadas `appmax-create-payment` e `appmax-webhook` já estavam desativadas desde 10/10/2026
  (respondem 410). Podem ser apagadas no painel do Supabase quando quiser; não fazem nada.

## Etapa 2 · Risco baixo 🔵 — 19/11/2026 (branch `etapa-2-limpeza`, em cima de `remove-appmax`)

| Item | O que foi feito |
|---|---|
| 2.1/2.2 | 10 funções sem nenhuma chamada saíram do repositório: `backfill-merged-orders-discounts`, `backfill-payment-methods`, `bling-debug-product`, `admin-update-user-email`, `create-subscription-payment`, `subscription-webhook`, `sendflow-runner-v2`, `zapi-broadcast`, `zapi-check-message-status`, `zapi-send-confirmation-link`. Conferido: nada no código, nas migrações nem nos agendamentos chama essas funções |
| 2.3 | Identificador da empresa OrderZap num lugar só (`_shared/platform.ts`), usado por 7 funções |
| 2.4 | 26 erros que eram engolidos em silêncio agora aparecem no log (`[função] erro ignorado: ...`). Não muda nenhuma decisão do código. Ficaram de fora os `JSON.parse` opcionais e as tentativas de endereço alternativo do `fe-list-groups-v2` (falha ali é esperada) |
| 2.5 | Regra do cupom numa cópia só (`_shared/coupon-rules.ts`), usada pela tela e pelo servidor. O teste de 5.000 carrinhos continua garantindo que os dois chegam no mesmo valor. Total do pedido e Pix ficam para depois da decisão do P-09 |
| 2.6 | Script pronto em `docs/refatoracao/limpeza-banco.sql` (~230 MB), **não aplicado**: depende do "ok" e de permissão para mexer no banco |
| 1.7 | Verificação de tipos só para medir (`tests/tsconfig.typecheck.json`, não entra no build): **95 erros** no front hoje, nenhum novo vindo das etapas 1 e 2 |

Conferido: build do Vite passa; 99 testes passam; nenhum erro de tipo novo.

### Pendências encontradas na etapa 2
- **Funções ainda publicadas no Supabase**: tirar do repositório não apaga a função publicada. As 10 acima e as ~35 do grupo 1
  continuam no ar até alguém apagar no painel do Supabase. Atenção a `admin-update-user-email`, que está publicada **sem
  exigência de login**: apagar primeiro.
- **Sipag aparece na tela mas não cobra**: a loja consegue ativar a Sipag (e isso desliga os outros gateways), mas nenhuma
  parte do checkout usa a `create-sipag-payment`. Nenhuma loja ativou até hoje. Decidir: completar ou tirar da tela (item 3.7).
- **Funções de limpeza `cleanup-fe-group-events` e `cleanup-whatsapp-messages`** ficaram: sem agendamento hoje, mas
  servem de base para a limpeza do item 2.6. `fe_group_events` NÃO deve ser apagada (relatório de grupos usa o histórico).

### Sipag removida — 19/11/2026 (decisão do Rafael)
Nunca cobrou (o checkout não chamava a `create-sipag-payment`) e nenhuma loja cadastrou. Saíram a aba e a tela, a chave de
menu por loja e as funções `create-sipag-payment` e `sipag-webhook`. Migração `20261119150000_remove_sipag.sql` tira a Sipag
da regra de gateway único e arquiva a tabela em `arquivo.integration_sipag_removida` (reversível).
Gateways do sistema a partir de agora: **InfinitePay, Pagar.me e Mercado Pago**.

### Funções mortas apagadas do Supabase — 19/11/2026 (decisão do Rafael)
Apagadas do painel 48 funções publicadas que não estavam mais no código e não tiveram nenhuma chamada nos registros:
admin-update-user-email, backfill-merged-orders-discounts, backfill-payment-methods, bling-debug-product, bling-integration,
create-subscription-payment, subscription-webhook, sendflow-runner-v2, zapi-broadcast, zapi-check-message-status,
zapi-send-confirmation-link, zapi-send-item-added-v2, zapi-send-item-added-v3, create-sipag-payment, sipag-webhook,
appmax-create-payment, appmax-webhook, whatsapp-send, whatsapp-multitenant, whatsapp-connection, whatsapp-monitor,
whatsapp-auto-response, whatsapp-process-message, whatsapp-add-label-bulk, whatsapp-send-item-added, whatsapp-send-paid-order,
whatsapp-send-product-canceled, evo-fix-webhook, evo-test-secrets, webhook-bling, webhook-mercadopago, webhook-melhorenvio,
webhook-melhor-envio, webhook-whatsapp, callback-empresa, admin-set-password, admin-metrics, tenant-create-user,
tenant-reset-password, tenant-generate-login-link, get-integration-settings, save-integration-settings, melhor-envio-oauth,
melhor-envio-token-refresh, melhor-envio-healthcheck, mp-diagnose, recalculate-order-total, recheck-pending-payments.
Mantidas de propósito (precisam de ok antes): mercadopago-webhook, bling-nfe-probe, bling-order-lookup, bling-cancelados-status,
bling-devolucao-preparar, bling-pedido-cancelar, zapi-send-item-added-v4, evolution-webhook, create-pix-payment,
calculate-shipping, update-zapi-client-token, whatsapp-send-template, whatsapp-proxy, whatsapp-add-label e as temporárias
recentes (correios-debug-tmp, tmp-drive-kit-images, erp-stock-diagnose, pagarme-due-dates).
`fe_group_events` **não** será apagada (histórico) — já está fora do `limpeza-banco.sql`.


## Etapa 3 · Risco médio 🟡 — 19/11/2026
Branch: `etapa-3-medio` (sai de `etapa-2-limpeza`; juntar no `main` leva as etapas 1, 2 e 3).
- **3.5 Mandaê**: rastreio que não existe na Mandaê responde 404 "Encomenda ainda não encontrada" em vez de erro 500 a cada rodada do cron.
- **3.3 Bling (P-05)**: ver acima. Testes novos em `bling-atendido.test.mjs`.
- **3.4 Bling, assinatura inválida**: duas contas mandam avisos de produto que o Cartzy recusa desde 16/11
  (companyId `e056cd50…` = MANIA DE MULHER; `86be1259…` = ainda não identificada). Pedidos não são afetados (não exigem assinatura).
  Causa provável: os avisos de produto estão ligados a um aplicativo do Bling diferente do conectado no Cartzy.
  Correção no código: o registro passa a dizer o motivo (`sem_assinatura`, `app_de_integracao_desativada` + loja, `app_desconhecido`).
  Correção de verdade: no Bling da loja, deixar os avisos de produto/estoque no mesmo aplicativo conectado no Cartzy (ou reconectar).
  **Investigação (19/11, noite):**
  - `86be1259…` = **Pabeli**: integração ativa no Cartzy mas **sem client_id/client_secret** → nenhum aviso dela pode ser validado.
    Correção: a Pabeli reconectar o Bling no Cartzy informando as credenciais do aplicativo.
  - Mania de Mulher e **Ela Up usam o MESMO aplicativo** (mesmo client_id e secret; Ela Up conectada em 16/11 13:34).
    O código pegava a primeira loja cuja chave batia: ~620 avisos de produto entre 16/11 13:34 e 17/11 03:39 foram tratados
    como Ela Up (provavelmente eram da Mania; a Ela Up tem 2 produtos vinculados — sem efeito porque "produto_nao_vinculado").
    Correção no código: coluna `integration_bling.bling_company_id` (migração `20261120010000_bling_company_id.sql`, já preenche
    Mania e Pabeli) e o `companyId` do aviso decide; com duas candidatas e sem como decidir, recusa.
  - Depois de 17/11 03:39 os avisos de produto da Mania não batem com nenhuma chave cadastrada, embora a chave da Mania
    renove o token normalmente. Os avisos que chegam vêm de outro aplicativo da conta da Mania apontando para o Cartzy.
    Precisa olhar no Bling (Central de Extensões → Área do integrador) — o Chrome estava deslogado do Bling.
- **3.7 Pix com cupom (P-09)**: ver acima.
- **3.1 Funções duplicadas**: fica uma versão só.
  `fe-list-groups-v2` → telas usam `fe-list-groups` (que não apaga grupos e atende UazAPI) e ela ganhou a trava de acesso da v2
  (antes qualquer pessoa sincronizava os grupos de qualquer loja e recebia os links de convite).
  `zapi-proxy-v2` → sorteio usa `zapi-proxy` (já tinha a trava e o campo `profilePictureUrl`).
  `pagarme-create-subscription` (v1, sem uso) removida; a tela usa a `-v2`, que continua com esse nome.
  **Depois de publicar no main**: apagar do Supabase `fe-list-groups-v2`, `zapi-proxy-v2` e `pagarme-create-subscription`.
- **3.2 Arquivos gigantes**: saíram para módulos testáveis as funções puras do `bling-sync-orders` (`_shared/bling-order-helpers.ts`:
  UF, CPF, telefone, e-mail, erros do Bling, frete Frenet, chamada com nova tentativa) e do `zapi-webhook` (`_shared/zapi-phone.ts`:
  telefones e data). Dividir o atendimento principal do `zapi-webhook` (~2.000 linhas num bloco só) fica para a etapa 4.
- **3.6 Limpeza do banco** (refeita em 20/11 após conferência): já existia `cleanup-cron-logs-weekly` (segunda 02h) que arquiva no
  Google Drive o histórico das rotinas com mais de 7 dias e só apaga depois da cópia. Ela travava no 2º bloco (Drive 403, cota por
  minuto), tirando só 50 mil linhas/semana para ~84 mil que entram — o histórico chegou a 17 dias. Correção: rotina **diária** às 02h
  (`cron.alter_job`, o nome ficou "weekly"), código trazido para o GitHub com pausa de 65 s entre blocos, e o atrasado arquivado
  em rodadas de um bloco. Mantidos os 7 dias e a cópia no Drive. O plano antigo (apagar > 3 dias sem cópia, `limpeza-banco.sql`)
  foi **descartado**. `VACUUM FULL net._http_response` agendado uma vez para a madrugada de 21/11 (03:30).
- Testes: 116 passando (eram 99). Front compila.
  - **20/11 08:30 — Ela Up desconectada do Bling (decisão do Rafael):** integração desativada e credenciais/tokens apagados no
    Cartzy (a loja nunca enviou pedido ao Bling). Agora só a Mania usa o aplicativo `a10873…`, então os avisos dele voltam a ir
    só para a Mania. Falta revogar o acesso do aplicativo dentro do Bling da Ela Up (Central de Extensões → Minhas instalações).

## Alertas para o super admin (sininho) — 20/11/2026
Decisão do Rafael: **nada é enviado por WhatsApp**. Os alertas aparecem num sininho no topo do sistema (ao lado de Tutoriais),
só para o super admin, com o número de problemas em aberto; ao clicar, cada um mostra o que está acontecendo, o problema
(efeito para as lojas) e o que fazer.
- Tabela `system_alerts` (migração `20261120100000_system_alerts.sql`): uma linha por problema; leitura só para super admin.
- `system-health-check` (cron a cada 15 min, já existia) agora só grava esse quadro: abre o que encontrou, atualiza o que
  continua e resolve o que sumiu (`_shared/system-alerts.ts`). Antes tentava mandar WhatsApp — e pelo número da primeira loja
  com WhatsApp ativo (OF Beauty) — mas nunca enviou porque não havia telefone cadastrado. O campo de telefone saiu da tela /admin/saude.
- Regras em `_shared/health-rules.ts`: webhooks com >20% de erro/h · envios de WhatsApp travados · WhatsApp que caiu nas últimas 24h
  (antes contava sessões de janeiro) · push parado · Bling sem credenciais · Bling com acesso vencido · mesmo aplicativo Bling em
  várias lojas · 5+ falhas de envio ao Bling/h por loja · tarefas agendadas falhando (`admin_health_cron_failures`,
  migração `20261120090000_health_cron_failures.sql`). Testes: `tests/alertas-saude.test.mjs`.

## Etapa 4 · Risco alto 🔴 — 20/11/2026
Branch: `etapa-4-alto` (sai de `etapa-3-medio`). Regra: itens de risco alto só publicam depois da Black Friday (27/11).

### 4.1 · Trava da função de item adicionado (P-03) — "testar primeiro antes de travar" (pedido do Rafael)
Hoje `zapi-send-item-added` aceita qualquer chamada da internet. Quem chama (registros de 20/11): o banco (gatilhos
`send_whatsapp_on_item_added` e `item_added_flush_tick`, 66 chamadas, SEM identificação) e o webhook do WhatsApp/Instagram
(service role). Travar hoje pararia todas as mensagens de item adicionado.
Feito (MODO OBSERVAÇÃO — nada é recusado):
- Migração `20261120120000_item_added_internal_key.sql`: chave interna em `private.internal_keys` (schema fora da API),
  os dois gatilhos mandam o header `x-cartzy-internal-key`, conferência `public.internal_key_check` (só service role),
  registro de quem chama em `internal_call_audit` (só super admin lê).
- Função: `_shared/internal-auth.ts` classifica cada chamada (service_role / internal_key / sem_chave), registra e aceita.
  A trava liga com o secret `ITEM_ADDED_ENFORCE_AUTH=true` (sem mudar código); tirar o secret volta para observação.
- Sininho: alerta "chamada sem identificação" enquanto houver chamada sem chave nas últimas 24h.
- Testes: `item-adicionado-envio.test.mjs` (observação e trava) e `item-adicionado-chave.test.mjs` (gatilhos mandam a chave;
  anon/authenticated não leem nem conferem a chave).
Para ligar a trava (depois da Black): publicar; acompanhar alguns dias; consulta
`select caller, count(*) from internal_call_audit where fn='zapi-send-item-added' and created_at > now()-interval '3 days' group by 1;`
deve mostrar zero `sem_chave` (e o sininho sem o alerta). Só então criar o secret.

### 4.5 · Erros de tipo: 92 → 0 (20/11)
Só declarações de tipo; o que as telas fazem não mudou (build ok, 135 testes ok). Rodar: `cd tests && npm run typecheck`.
- Campos que existem no banco mas faltavam nas interfaces locais (`promotional_price`, `product_name/code/image_url` do item,
  `shipping_provider`, `payment_installments`, `full_name`).
- Tabelas acessadas com `as any` (InfinitePay, Omie, Bagy, campanhas): conversão via `as unknown as`.
- `menu_flags` (jsonb) convertido para o tipo da loja na entrada (TenantContext/useTenant).
- Arquivos `*.test.ts` de src/ rodam no bun e saíram desta checagem.
Achados (sem mudança de comportamento, só registro):
- O topo do sistema usa `profile.full_name`, que não existe em `profiles`: o nome exibido sempre cai no nome da loja.
- `TenantProducts`: o formulário começava sem `promotional_price`/`observation` (campos ficavam "soltos" até digitar); agora começam vazios.
- `BlingFiscalSettings`: `default_ipi` é numérico no banco e texto na tela — conferir se o IPI salvo aparece selecionado ao reabrir.
