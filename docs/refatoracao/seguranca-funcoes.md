# Revisão de segurança das funções (etapa 4.4) — 20/11/2026

Escopo: 138 edge functions do repositório + chamadas do banco (gatilhos e tarefas agendadas). Só leitura; nada foi travado.

## Resumo

- **64 funções** têm alguma trava (login da loja, super admin, assinatura de webhook ou chave). **74 não têm nenhuma**; dessas, **19 são de risco alto** (mandam mensagem pelo número da loja ou gastam dinheiro dela), 14 de risco médio e 16 são públicas por natureza.
- **As tarefas agendadas chamam as funções com a chave pública** (a mesma que vai dentro do site). Para a função, um cron e um estranho são iguais. Isso impede travar várias funções sem antes trocar a forma de o cron se identificar.
- **Os gatilhos do banco chamam 8 funções sem nenhuma identificação** (item adicionado, pedido pago, rastreio, fila de espera, etiqueta do app, aviso da agenda, Bagy, Olist).
- Todas as funções de risco alto agora **registram quem as chama** (sem bloquear) em `internal_call_audit` — base para travar depois da Black Friday sem quebrar nenhuma origem legítima.

## Problemas que já estão acontecendo (achados na revisão)

1. **Etiqueta do app nas mensagens em massa não é aplicada.** O gatilho `add_app_tag_on_bulk_message` chama `whatsapp-add-label` sem identificação e a função exige login: 12 recusas (401) desde ontem. Correção (depois da Black): o gatilho mandar a chave interna.
2. **WhatsApp da Mania de Mulher desconectado de manhã** (20/11, ~9h–14h): 'session is not reconnectable' na UazAPI. Os avisos da agenda para o Rafael (`agenda_whats_rafael`) e mensagens da loja falharam nesse período; às 15h voltou a enviar. O sininho passa a mostrar quando cair.

## Risco alto — mandam mensagem pela loja ou gastam dinheiro dela (sem trava)

| Função | O que alguém de fora consegue | Quem chama hoje | Em observação |
|---|---|---|---|
| `zapi-send-message` | Manda WhatsApp pelo número de qualquer loja para qualquer telefone (tenant_id no corpo). Proteção só por limite de envios. | várias funções (service role); banco: aviso da agenda (sem identificação) | ✅ |
| `zapi-send-paid-order` | Manda a mensagem de "pedido pago" de qualquer loja. Chamada pelo banco sem identificação. | banco: pedido pago (sem identificação) | ✅ |
| `zapi-send-tracking` | Manda a mensagem de rastreio de qualquer loja. Chamada pelo banco sem identificação. | banco: rastreio (sem identificação) | ✅ |
| `zapi-send-product-canceled` | Manda a mensagem de "produto cancelado" de qualquer loja. | — | ✅ |
| `zapi-send-item-added` | Manda o "item adicionado" de qualquer loja (já em observação no 4.1, trava pronta). | banco (com chave interna após publicar) e webhooks (service role) | ✅ |
| `cobranca-process` | Dispara cobranças em massa por WhatsApp de qualquer loja. | tela: Cobranca | ✅ |
| `fe-send-message` | Manda mensagem nos grupos VIP de qualquer loja. | tela: MessageComposer | ✅ |
| `fe-spawn-group` | Cria grupo de WhatsApp com o número de qualquer loja. | tela: CampaignDetailDialog | ✅ |
| `fe-refresh-group-links` | Regera links de convite dos grupos de qualquer loja. | tela: GroupsManager | ✅ |
| `waitlist-process-next` | Avisa a próxima da fila de espera por WhatsApp (qualquer loja). | tela: Index; banco (sem identificação) | ✅ |
| `whatsapp-official-send` | Manda mensagem pela API oficial do WhatsApp (custo por mensagem) de qualquer loja. | função: zapi-send-message | ✅ |
| `melhor-envio-labels` | Compra etiqueta no Melhor Envio com o saldo da loja (dinheiro). | tela: Index; função: tracking-posted-sync | ✅ |
| `superfrete-labels` | Compra etiqueta na SuperFrete com o saldo da loja. | tela: Index; função: tracking-posted-sync | ✅ |
| `mandabem-labels` | Gera etiqueta na Manda Bem pela conta da loja. | tela: Index; função: tracking-posted-sync | ✅ |
| `mandae-labels` | Gera pedido/etiqueta na Mandaê pela conta da loja. | tela: Index; função: tracking-posted-sync | ✅ |
| `frenet-labels` | Gera etiqueta na Frenet pela conta da loja. | tela: FrenetIntegration, Index; função: tracking-posted-sync | ✅ |
| `correios-labels` | Gera pré-postagem nos Correios pelo contrato da loja (tem trava parcial). | tela de etiquetas; cron (chave pública) | ✅ |
| `orders-auto-cancel` | Cancela pedidos não pagos de uma loja (o cron chama com a chave pública). | tela: Index; cron (chave pública) | ✅ |
| `push-send-campaign` | Dispara campanha de notificação push para as clientes de qualquer loja. | tela: Index | ✅ |

## Risco médio

| Função | Risco | Quem chama hoje | Em observação |
|---|---|---|---|
| `ai-agent` | Usa crédito de IA (custo) com tenant_id do corpo. | — | ✅ |
| `webhook-retry` | Reenvia webhooks registrados (pagamento/WhatsApp) — reprocessar pagamento. | tela: SaudeSistema | ✅ |
| `mp-webhook` | Webhook do Mercado Pago: conferir se valida a origem antes de dar baixa (hoje consulta o pagamento no MP, o que já protege). | função: create-payment, webhook-retry | — |
| `sync-address-bling` | Altera endereço de contato no Bling da loja. | tela: BlingBulkAddressSync, ViewOrderDialog | — |
| `omie-sync-orders` | Envia pedidos ao Omie da loja. | — | — |
| `omie-sync-products` | Importa produtos do Omie. | — | — |
| `bling-fill-images` | Altera imagens de produtos da loja. | — | — |
| `public-checkout-customer-address` | Página pública: devolve endereço salvo da cliente — conferir se exige algo além do telefone. | tela: PublicCheckout | — |
| `instagram-sync-live-comments` | Lê comentários e cria pedidos (o cron chama com a chave pública). | tela: InstagramLiveComments; cron (chave pública) | — |
| `fe-return-automation-trigger` | Dispara automação de retorno de grupo (chamada pelo webhook). | função: zapi-webhook | — |
| `push-dispatch` | Envia push individual. | — | — |
| `whatsapp-official-templates` | Cria/lista templates da API oficial da loja. | tela: Templates | — |
| `prospect-agent` | Agente de prospecção da plataforma (manda WhatsApp pelo número da OrderZap). | — | — |
| `affiliate-meeting-reminders` | Lembretes de reunião de afiliadas (WhatsApp da plataforma). | cron (chave pública) | — |

## Públicas por natureza (ok, conferir só a validação interna)

- `live-shop` — Loja da live (pública por natureza; cada ação confere o pedido/telefone).
- `storefront-add-to-cart` — Vitrine pública.
- `storefront-resolve-visitor` — Vitrine pública.
- `fe-campaign-redirect` — Link público de campanha.
- `push-vapid-public-key` — Chave pública de push (feita para ser pública).
- `push-unsubscribe` — Descadastro de push pela própria cliente.
- `push-track-click` — Clique em notificação.
- `bling-oauth-callback` — Retorno do login do Bling.
- `olist-oauth-callback` — Retorno do login da Olist.
- `instagram-auth-callback` — Retorno do login do Instagram.
- `instagram-oauth-url` — Gera link de login.
- `whatsapp-official-oauth-url` — Gera link de login.
- `tiktok-live-comment` — Leitor de live do TikTok com chave por loja (x-reader-key).
- `uazapi-webhook` — Webhook do WhatsApp (UazAPI).
- `sentry-proxy` — Proxy de erros do navegador.
- `waitlist-enqueue` — Entrar na fila de espera (vitrine/WhatsApp).

## Sem trava, risco baixo (manutenção, cotação de frete, testes de conexão, tokens)

`affiliate-portal`, `archive-and-cleanup`, `bling-list-stores`, `bling-oauth`, `cleanup-cron-logs`, `cleanup-fe-group-events`, `cleanup-whatsapp-messages`, `correios-shipping`, `create-infinitepay-payment`, `fe-process-scheduled`, `frenet-shipping`, `frenet-tracking-sync`, `fretebarato-settings`, `fretebarato-shipping`, `instagram-profile-avatar`, `instagram-refresh-tokens`, `mandabem-shipping`, `mandae-shipping`, `melhor-envio-shipping`, `melhor-envio-test-token`, `meuscorreios-shipping`, `olist-refresh-tokens`, `omie-list-stores`, `omie-test-connection`, `sendflow-check-scheduled`, `sendflow-runner`, `sendflow-watchdog`, `superfrete-shipping`, `system-health-check`, `tracking-posted-sync`, `waitlist-expire-reservations`


## Plano para travar (depois da Black Friday, 27/11)

1. **Crons com identificação própria**: trocar a chave pública dos comandos do cron por uma chave interna (mesmo modelo do 4.1), guardada no cofre do banco.
2. **Gatilhos do banco** (pedido pago, rastreio, fila, etiqueta do app, agenda): mandar a chave interna, como já foi feito no item adicionado.
3. Com 3–5 dias de registro em `internal_call_audit`, travar uma função por vez:
   - mensagens e etiquetas: só sistema (service role/chave interna) ou usuário logado da própria loja (`authorizeTenantCaller`);
   - campanhas, cobrança e grupos: só usuário logado da loja;
   - IA e reprocessamento de webhook: só super admin.
4. Ligar a trava do item adicionado (`ITEM_ADDED_ENFORCE_AUTH=true`) primeiro — já está pronta.

Consulta para acompanhar a observação:

```sql
select fn, caller, count(*), max(created_at)
  from internal_call_audit where created_at > now() - interval '3 days'
 group by 1, 2 order by 1, 3 desc;
```
