# Mapa de dependências do Cartzy

Gerado automaticamente por `node tests/tools/mapa-dependencias.mjs` (só lê o código).
Rode de novo depois de cada etapa da refatoração para ver o que mudou.

## Números gerais

| | |
|---|---|
| Edge functions com código no repositório | 152 |
| Módulos compartilhados (`_shared`) | 37 |
| Arquivos do front (sem `types.ts` gerado) | 287 |
| Funções sem ninguém chamando no código (tela, outra função ou SQL) | 43 |

> "Sem ninguém chamando no código" não quer dizer morta. Três casos ficam de fora desta busca:
> webhooks chamados de fora (Bling, Mercado Pago, Pagar.me, UazAPI...), agendamentos criados direto no painel do Supabase
> e nomes montados na hora (ex.: `invoke(functionName)` na tela de etiquetas e no checkout de assinatura).
> Cruze com a varredura de 90 dias de chamadas antes de remover qualquer uma (etapa 2).

## Tabelas mais compartilhadas (onde mudar uma coluna mexe em mais lugares)

| Tabela | Edge functions | Arquivos do front |
|---|---|---|
| `orders` | 44 | 25 |
| `tenants` | 42 | 22 |
| `profiles` | 36 | 8 |
| `products` | 25 | 19 |
| `shipping_integrations` | 25 | 14 |
| `customers` | 25 | 12 |
| `integration_whatsapp` | 27 | 10 |
| `cart_items` | 22 | 11 |
| `integration_bling` | 18 | 7 |
| `whatsapp_messages` | 18 | 3 |
| `webhook_logs` | 18 | 1 |
| `app_settings` | 9 | 9 |
| `integration_mp` | 6 | 9 |
| `audit_logs` | 13 | 2 |
| `tenant_users` | 14 | 0 |
| `sending_jobs` | 6 | 7 |
| `integration_pagarme` | 5 | 7 |
| `fe_groups` | 9 | 3 |
| `integration_instagram` | 8 | 4 |
| `coupons` | 4 | 7 |
| `whatsapp_templates` | 8 | 3 |
| `integration_appmax` | 4 | 6 |
| `carts` | 6 | 4 |
| `push_subscriptions` | 8 | 1 |
| `integration_infinitepay` | 5 | 2 |

## Módulos compartilhados e quem usa

| Módulo | Usado por |
|---|---|
| `admin-push-notify` | 4: asaas-webhook, landing-fluxo-signup, pagarme-subscription-webhook, subscription-webhook |
| `affiliate-agenda` | 3: affiliate-booking, affiliate-meeting-reminders, self-signup |
| `agenda-availability` | 2: affiliate-booking, self-signup |
| `agenda-core` | 1: assinar-site |
| `anti-block-delay` | 9: sendflow-process, zapi-broadcast, zapi-send-confirmation-link, zapi-send-item-added, zapi-send-message, zapi-send-paid-order … (+3) |
| `asaas` | 3: asaas-renovar, asaas-webhook, assinar-site |
| `auth-guard` | 13: bagy-import-products, bagy-sync, bling-deposits, bling-import-products, correios-labels, erp-stock-reconcile … (+7) |
| `bling-image` | 1: bling-import-products |
| `bling-product-sync` | 3: bling-sweep-deleted, bling-webhook, erp-stock-reconcile |
| `consent-v2` | 4: zapi-send-confirmation-link, zapi-send-item-added, zapi-send-product-canceled, zapi-webhook |
| `conversions` | 2: asaas-webhook, assinar-site |
| `correios-prepostagem` | 2: correios-labels, correios-shipping |
| `coupon-eligibility` | 2: create-infinitepay-payment, create-payment |
| `evolution-api` | 8: evolution-instance-manager, fe-send-message, sendflow-process, zapi-send-confirmation-link, zapi-send-item-added, zapi-send-paid-order … (+2) |
| `fretebarato-quote-handler` | 1: fretebarato-shipping |
| `fretebarato-settings-handler` | 1: fretebarato-settings |
| `fretebarato` | **ninguém** |
| `google-calendar` | 2: affiliate-booking, self-signup |
| `jarvis-agenda` | 3: affiliate-booking, affiliate-meeting-reminders, prospect-agent |
| `live-whatsapp` | 3: zapi-send-item-added, zapi-send-paid-order, zapi-send-tracking |
| `next-product-code` | 3: bagy-import-products, bling-import-products, olist-products |
| `olist-catalog-sync` | 1: olist-products |
| `olist` | 6: erp-stock-reconcile, olist-oauth, olist-oauth-callback, olist-orders, olist-products, olist-refresh-tokens |
| `payment-method-lock` | 1: create-payment |
| `pix-discount` | 2: create-infinitepay-payment, create-payment |
| `plan-modules` | 2: pagarme-create-subscription-v2, pagarme-subscription-webhook |
| `postage-confirmation` | 9: bling-sync-orders, bling-webhook, frenet-labels, frenet-tracking-sync, mandabem-labels, mandae-labels … (+3) |
| `provision-tenant` | 1: asaas-webhook |
| `purchase-limit` | 3: live-shop, storefront-add-to-cart, zapi-webhook |
| `push-fallback` | 5: waitlist-process-next, zapi-send-item-added, zapi-send-paid-order, zapi-send-product-canceled, zapi-send-tracking |
| `rate-limit` | 8: assinar-site, create-payment, landing-fluxo-signup, login-rate-limit, public-checkout-orders, push-subscribe … (+2) |
| `shipping-quote-cache` | 6: frenet-shipping, mandabem-shipping, mandae-shipping, melhor-envio-shipping, meuscorreios-shipping, superfrete-shipping |
| `tenant-mp-token` | 3: backfill-payment-methods, create-payment, mp-webhook |
| `tenant-onboarding` | 3: create-tenant-admin, self-signup, tenant-onboarding |
| `uazapi-api` | 11: fe-send-message, fe-spawn-group, fluxo-ensure-whatsapp, landing-fluxo-signup, prospect-agent, prospect-outreach … (+5) |
| `variation` | 1: olist-products |
| `web-push` | 2: push-dispatch, push-send-campaign |

## Funções sem chamada no código

`admin-update-user-email`, `affiliate-meeting-reminders`, `assinar-site`, `backfill-merged-orders-discounts`, `backfill-payment-methods`, `bling-debug-product`, `bling-fill-images`, `bling-refresh-tokens`, `cobranca-process`, `create-sipag-payment`, `create-subscription-payment`, `evolution-instance-manager`, `fe-list-groups-v2`, `fe-return-automation-dispatcher`, `frenet-shipping`, `frenet-tracking-sync`, `frenet-webhook`, `instagram-refresh-tokens`, `mandabem-labels`, `mandae-labels`, `mandae-shipping`, `melhor-envio-shipping`, `meuscorreios-shipping`, `olist-refresh-tokens`, `pagarme-create-order`, `pagarme-create-subscription`, `pagarme-create-subscription-v2`, `pagarme-reconcile`, `pagarme-subscription-webhook`, `prospect-agent`, `prospect-outreach`, `push-track-click`, `sendflow-check-scheduled`, `sendflow-runner-v2`, `sendflow-watchdog`, `superfrete-labels`, `superfrete-shipping`, `tiktok-live-comment`, `waitlist-expire-reservations`, `whatsapp-official-webhook`, `zapi-broadcast`, `zapi-check-message-status`, `zapi-send-confirmation-link`

## Todas as edge functions

| Função | Linhas | Chamada por (telas / funções / SQL) | Chama | Usa `_shared` | Tabelas |
|---|---|---|---|---|---|
| `admin-update-user-email` | 88 | 0 / 0 / — | — | — | 1 |
| `affiliate-booking` | 255 | 4 / 0 / — | zapi-send-message | affiliate-agenda, agenda-availability, google-calendar, jarvis-agenda | 5 |
| `affiliate-meeting-reminders` | 85 | 0 / 0 / — | zapi-send-message | affiliate-agenda, jarvis-agenda | 3 |
| `affiliate-portal` | 258 | 1 / 0 / — | — | — | 7 |
| `ai-agent` | 275 | 1 / 0 / — | — | — | 4 |
| `archive-and-cleanup` | 175 | 1 / 0 / — | — | — | 2 |
| `asaas-renovar` | 88 | 1 / 0 / — | — | asaas | 3 |
| `asaas-webhook` | 242 | 1 / 0 / — | — | admin-push-notify, asaas, conversions, provision-tenant | 7 |
| `assinar-site` | 228 | 0 / 0 / — | — | agenda-core, asaas, conversions, rate-limit | 2 |
| `backfill-merged-orders-discounts` | 334 | 0 / 0 / — | — | — | 6 |
| `backfill-payment-methods` | 292 | 0 / 0 / — | — | tenant-mp-token | 3 |
| `bagy-import-products` | 298 | 1 / 0 / — | — | auth-guard, next-product-code | 4 |
| `bagy-sync` | 665 | 3 / 1 / sim | — | auth-guard | 6 |
| `bling-debug-product` | 23 | 0 / 0 / — | — | — | 1 |
| `bling-deposits` | 101 | 1 / 0 / — | — | auth-guard | 3 |
| `bling-fill-images` | 138 | 0 / 0 / — | — | — | 2 |
| `bling-import-products` | 442 | 1 / 0 / — | — | auth-guard, bling-image, next-product-code | 4 |
| `bling-list-stores` | 112 | 1 / 0 / — | — | — | 1 |
| `bling-oauth` | 227 | 1 / 0 / — | bling-oauth-callback | — | 1 |
| `bling-oauth-callback` | 216 | 1 / 1 / — | — | — | 1 |
| `bling-refresh-tokens` | 426 | 0 / 0 / — | — | — | 4 |
| `bling-resync-original-stock` | 264 | 1 / 0 / — | — | — | 3 |
| `bling-sweep-deleted` | 32 | 0 / 0 / sim | — | bling-product-sync | 3 |
| `bling-sync-orders` | 2962 | 4 / 2 / — | — | postage-confirmation | 8 |
| `bling-sync-products` | 1009 | 1 / 0 / — | — | — | 2 |
| `bling-webhook` | 368 | 2 / 0 / — | — | bling-product-sync, postage-confirmation | 7 |
| `cleanup-fe-group-events` | 187 | 0 / 0 / sim | — | — | 2 |
| `cleanup-whatsapp-messages` | 278 | 0 / 0 / sim | — | — | 2 |
| `cobranca-process` | 451 | 0 / 0 / — | zapi-proxy | — | 2 |
| `correios-labels` | 1784 | 2 / 0 / — | — | auth-guard, correios-prepostagem | 9 |
| `correios-shipping` | 345 | 1 / 0 / — | — | correios-prepostagem | 2 |
| `create-infinitepay-payment` | 473 | 0 / 1 / — | infinitepay-webhook | coupon-eligibility, pix-discount | 8 |
| `create-payment` | 1221 | 3 / 0 / — | create-infinitepay-payment, mp-webhook | coupon-eligibility, payment-method-lock, pix-discount, rate-limit … (+1) | 9 |
| `create-sipag-payment` | 198 | 0 / 0 / — | — | — | 2 |
| `create-subscription-payment` | 162 | 0 / 0 / — | subscription-webhook | — | 2 |
| `create-tenant-admin` | 100 | 2 / 0 / — | — | tenant-onboarding | 2 |
| `erp-stock-reconcile` | 320 | 1 / 0 / sim | — | auth-guard, bling-product-sync, olist | 8 |
| `evolution-instance-manager` | 220 | 0 / 0 / — | — | evolution-api | 2 |
| `fe-campaign-redirect` | 201 | 1 / 0 / — | fe-spawn-group | — | 3 |
| `fe-export-contacts` | 383 | 1 / 0 / — | — | auth-guard | 6 |
| `fe-list-groups` | 567 | 2 / 0 / — | — | — | 2 |
| `fe-list-groups-v2` | 118 | 0 / 0 / — | — | auth-guard | 4 |
| `fe-process-scheduled` | 209 | 1 / 0 / — | fe-send-message | — | 1 |
| `fe-refresh-group-links` | 177 | 1 / 0 / — | — | — | 2 |
| `fe-return-automation-dispatcher` | 126 | 0 / 0 / — | zapi-send-message | — | 4 |
| `fe-return-automation-trigger` | 225 | 0 / 1 / — | zapi-send-message | — | 5 |
| `fe-send-message` | 428 | 1 / 1 / — | — | evolution-api, uazapi-api | 3 |
| `fe-spawn-group` | 249 | 1 / 1 / — | — | uazapi-api | 4 |
| `fluxo-ensure-whatsapp` | 119 | 1 / 0 / — | uazapi-webhook | uazapi-api | 3 |
| `frenet-labels` | 351 | 1 / 1 / — | — | postage-confirmation | 5 |
| `frenet-shipping` | 151 | 0 / 0 / — | — | shipping-quote-cache | 2 |
| `frenet-tracking-sync` | 75 | 0 / 0 / — | frenet-labels | postage-confirmation | 2 |
| `frenet-webhook` | 166 | 0 / 0 / — | — | — | 2 |
| `fretebarato-settings` | 5 | 1 / 0 / — | — | fretebarato-settings-handler | 3 |
| `fretebarato-shipping` | 5 | 1 / 0 / — | — | fretebarato-quote-handler | 2 |
| `infinitepay-webhook` | 188 | 0 / 1 / — | — | — | 2 |
| `instagram-auth-callback` | 167 | 0 / 1 / — | — | — | 1 |
| `instagram-oauth-url` | 52 | 1 / 0 / — | instagram-auth-callback | — | 0 |
| `instagram-post-comments` | 313 | 1 / 0 / — | — | — | 2 |
| `instagram-profile-avatar` | 159 | 1 / 0 / — | — | — | 1 |
| `instagram-refresh-tokens` | 94 | 0 / 0 / — | — | — | 1 |
| `instagram-resend-dm` | 77 | 1 / 0 / — | — | — | 3 |
| `instagram-simulate-comment` | 96 | 1 / 0 / — | instagram-webhook | — | 4 |
| `instagram-sync-live-comments` | 341 | 1 / 0 / — | instagram-webhook | — | 3 |
| `instagram-webhook` | 1170 | 1 / 2 / — | zapi-send-item-added | — | 10 |
| `landing-fluxo-signup` | 182 | 1 / 0 / — | uazapi-webhook | admin-push-notify, rate-limit, uazapi-api | 4 |
| `live-shop` | 1038 | 1 / 0 / — | — | purchase-limit | 18 |
| `login-rate-limit` | 115 | 1 / 0 / — | — | rate-limit | 1 |
| `mandabem-labels` | 337 | 0 / 0 / — | — | postage-confirmation | 6 |
| `mandabem-shipping` | 238 | 1 / 0 / — | — | shipping-quote-cache | 2 |
| `mandae-labels` | 497 | 0 / 0 / — | — | postage-confirmation | 6 |
| `mandae-shipping` | 208 | 0 / 0 / — | — | shipping-quote-cache | 2 |
| `melhor-envio-labels` | 904 | 1 / 0 / — | — | — | 6 |
| `melhor-envio-shipping` | 322 | 0 / 0 / — | — | shipping-quote-cache | 4 |
| `melhor-envio-test-token` | 115 | 1 / 0 / — | — | — | 1 |
| `melhor-envio-webhook` | 172 | 1 / 0 / — | — | — | 3 |
| `meuscorreios-shipping` | 290 | 0 / 0 / — | — | shipping-quote-cache | 3 |
| `mp-webhook` | 548 | 0 / 1 / — | bling-sync-orders | tenant-mp-token | 5 |
| `olist-oauth` | 112 | 1 / 0 / — | olist-oauth-callback | auth-guard, olist | 4 |
| `olist-oauth-callback` | 85 | 1 / 1 / — | — | olist | 2 |
| `olist-orders` | 434 | 1 / 0 / sim | — | auth-guard, olist, postage-confirmation | 9 |
| `olist-products` | 448 | 1 / 0 / sim | — | auth-guard, next-product-code, olist-catalog-sync, olist … (+1) | 6 |
| `olist-refresh-tokens` | 43 | 0 / 0 / — | — | olist | 2 |
| `omie-list-stores` | 68 | 1 / 0 / — | — | — | 0 |
| `omie-sync-orders` | 229 | 1 / 0 / — | — | — | 3 |
| `omie-sync-products` | 151 | 1 / 0 / — | — | — | 2 |
| `omie-test-connection` | 61 | 1 / 0 / — | — | — | 0 |
| `orders-auto-cancel` | 149 | 1 / 0 / — | bagy-sync | — | 3 |
| `pagarme-cancel-subscription` | 87 | 1 / 0 / — | — | — | 2 |
| `pagarme-create-order` | 211 | 0 / 0 / — | — | — | 2 |
| `pagarme-create-subscription` | 391 | 0 / 0 / — | — | — | 3 |
| `pagarme-create-subscription-v2` | 336 | 0 / 0 / — | — | plan-modules | 4 |
| `pagarme-reconcile` | 164 | 0 / 0 / — | — | — | 6 |
| `pagarme-recurring-links` | 207 | 1 / 0 / — | — | — | 2 |
| `pagarme-subscription-webhook` | 327 | 0 / 0 / — | self-signup | admin-push-notify, plan-modules | 5 |
| `pagarme-webhook` | 414 | 1 / 0 / — | bling-sync-orders | — | 4 |
| `platform-affiliates` | 156 | 3 / 0 / — | — | — | 5 |
| `process-meus-correios` | 416 | 1 / 0 / — | — | — | 4 |
| `prospect-agent` | 227 | 0 / 0 / — | uazapi-webhook | jarvis-agenda, uazapi-api | 3 |
| `prospect-outreach` | 141 | 0 / 0 / — | — | uazapi-api | 3 |
| `public-checkout-customer-address` | 46 | 1 / 0 / — | — | — | 1 |
| `public-checkout-orders` | 176 | 1 / 0 / — | — | rate-limit | 5 |
| `push-dispatch` | 98 | 0 / 5 / — | — | web-push | 4 |
| `push-send-campaign` | 192 | 1 / 0 / — | — | web-push | 6 |
| `push-subscribe` | 44 | 1 / 0 / — | — | rate-limit | 2 |
| `push-track-click` | 31 | 0 / 0 / — | — | — | 2 |
| `push-unsubscribe` | 21 | 1 / 0 / — | — | — | 1 |
| `push-vapid-public-key` | 13 | 1 / 0 / — | — | — | 0 |
| `self-signup` | 538 | 3 / 1 / — | zapi-send-message | affiliate-agenda, agenda-availability, google-calendar, tenant-onboarding | 9 |
| `sendflow-check-scheduled` | 91 | 0 / 0 / — | sendflow-runner | — | 1 |
| `sendflow-process` | 730 | 0 / 3 / — | — | anti-block-delay, evolution-api | 6 |
| `sendflow-runner` | 49 | 1 / 1 / — | sendflow-process | — | 0 |
| `sendflow-runner-v2` | 55 | 0 / 0 / — | sendflow-process | — | 0 |
| `sendflow-watchdog` | 95 | 0 / 0 / — | sendflow-process | — | 2 |
| `sentry-proxy` | 114 | 1 / 0 / — | — | — | 0 |
| `sipag-webhook` | 87 | 1 / 0 / — | — | — | 2 |
| `storefront-add-to-cart` | 286 | 1 / 0 / — | waitlist-enqueue | purchase-limit | 7 |
| `storefront-lookup-by-instagram` | 103 | 1 / 0 / — | — | rate-limit | 2 |
| `storefront-resolve-visitor` | 76 | 1 / 0 / — | — | — | 2 |
| `subscription-webhook` | 277 | 0 / 1 / — | — | admin-push-notify | 4 |
| `superfrete-labels` | 432 | 0 / 0 / — | — | postage-confirmation | 6 |
| `superfrete-shipping` | 228 | 0 / 0 / — | — | shipping-quote-cache | 2 |
| `support-chat` | 406 | 2 / 0 / — | zapi-proxy | rate-limit | 5 |
| `sync-address-bling` | 432 | 2 / 0 / — | — | — | 3 |
| `sync-bling-tracking` | 225 | 1 / 0 / — | — | postage-confirmation | 3 |
| `system-health-check` | 175 | 1 / 0 / sim | zapi-send-message | — | 7 |
| `tenant-onboarding` | 228 | 1 / 1 / — | zapi-send-message | tenant-onboarding | 6 |
| `tiktok-live-comment` | 266 | 0 / 0 / — | — | — | 9 |
| `tiktok-register` | 88 | 1 / 0 / — | zapi-send-message | — | 2 |
| `tracking-posted-sync` | 157 | 0 / 0 / sim | — | — | 2 |
| `uazapi-instance-manager` | 153 | 1 / 0 / — | uazapi-webhook | auth-guard, uazapi-api | 3 |
| `uazapi-webhook` | 653 | 1 / 4 / sim | zapi-webhook | uazapi-api | 7 |
| `waitlist-enqueue` | 134 | 0 / 2 / — | — | — | 4 |
| `waitlist-expire-reservations` | 61 | 0 / 0 / — | — | — | 3 |
| `waitlist-process-next` | 259 | 1 / 0 / sim | push-dispatch, zapi-send-message | push-fallback | 9 |
| `webhook-retry` | 110 | 1 / 0 / — | — | — | 1 |
| `whatsapp-official-auth-callback` | 144 | 0 / 1 / — | — | — | 1 |
| `whatsapp-official-oauth-url` | 55 | 1 / 0 / — | whatsapp-official-auth-callback | — | 0 |
| `whatsapp-official-send` | 143 | 0 / 1 / — | — | — | 2 |
| `whatsapp-official-templates` | 141 | 1 / 0 / — | — | — | 2 |
| `whatsapp-official-webhook` | 103 | 0 / 0 / — | — | — | 2 |
| `zapi-broadcast` | 322 | 0 / 0 / — | — | anti-block-delay | 4 |
| `zapi-check-message-status` | 240 | 0 / 0 / — | — | — | 1 |
| `zapi-proxy` | 751 | 6 / 2 / — | — | auth-guard | 3 |
| `zapi-proxy-v2` | 747 | 1 / 0 / — | — | — | 1 |
| `zapi-send-confirmation-link` | 208 | 0 / 0 / — | — | anti-block-delay, consent-v2, evolution-api | 4 |
| `zapi-send-item-added` | 633 | 0 / 2 / sim | push-dispatch | anti-block-delay, consent-v2, evolution-api, live-whatsapp … (+1) | 9 |
| `zapi-send-message` | 181 | 2 / 10 / sim | whatsapp-official-send | anti-block-delay, uazapi-api | 3 |
| `zapi-send-paid-order` | 242 | 3 / 0 / sim | push-dispatch | anti-block-delay, evolution-api, live-whatsapp, push-fallback | 5 |
| `zapi-send-product-canceled` | 225 | 1 / 0 / — | push-dispatch | anti-block-delay, consent-v2, evolution-api, push-fallback | 5 |
| `zapi-send-tracking` | 197 | 0 / 0 / sim | push-dispatch | anti-block-delay, live-whatsapp, push-fallback, uazapi-api | 5 |
| `zapi-webhook` | 3366 | 1 / 1 / — | fe-return-automation-trigger, tenant-onboarding, waitlist-enqueue, zapi-send-item-added … (+1) | anti-block-delay, consent-v2, evolution-api, purchase-limit … (+1) | 20 |
