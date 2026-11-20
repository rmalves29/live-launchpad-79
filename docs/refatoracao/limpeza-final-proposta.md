# Limpeza final (etapa 5.5) — proposta para aprovação do Rafael · 20/11/2026

Nada aqui foi apagado. Executar só depois da Black Friday (27/11) e depois de publicar as etapas 3 e 4.
Regra: tabelas vão para o schema `arquivo` (dá para voltar); funções saem do Supabase mas o código fica no histórico do GitHub.

## 1. Funções publicadas para apagar do Supabase

| Função | Uso nas últimas 24h | Varredura de 90 dias (06/08–04/11) | Motivo |
|---|---|---|---|
| `fe-list-groups-v2` | 10 (tela antiga ainda no ar) | — | Substituída pela `fe-list-groups` no 3.1. **Apagar só depois de publicar** |
| `zapi-proxy-v2` | 2 (tela antiga ainda no ar) | — | Substituída pela `zapi-proxy` no 3.1. **Apagar só depois de publicar** |
| `pagarme-create-subscription` | 0 | — | Versão antiga; a tela usa a `-v2` |
| `mercadopago-webhook` | 0 | quase morta | O webhook ativo é o `mp-webhook` |
| `bling-nfe-probe`, `bling-order-lookup`, `bling-cancelados-status`, `bling-devolucao-preparar`, `bling-pedido-cancelar` | 0 | quase mortas | Ferramentas pontuais de diagnóstico/conserto do Bling |
| `zapi-send-item-added-v4` | 0 | quase morta | Versão antiga do item adicionado |
| `evolution-webhook` | 0 | quase morta | Provedor Evolution não usado pelas lojas |
| `create-pix-payment`, `calculate-shipping` | 0 | quase mortas | Substituídas por `create-payment` e pelas funções de frete por transportadora |
| `update-zapi-client-token`, `whatsapp-send-template`, `whatsapp-proxy` | 0 | quase mortas | Sem tela nem rotina que chame |
| `correios-debug-tmp`, `tmp-drive-kit-images` | 0 | — | Temporárias de diagnóstico |

**Confirmar antes com o Rafael** (criadas em 19/11 em outra conversa, podem estar em uso): `erp-stock-diagnose`, `pagarme-due-dates`.

## 2. Rotinas automáticas repetidas

| Rotinas | Situação | Proposta |
|---|---|---|
| `bling-refresh-tokens-every-4h` (a cada 4 h) + `refresh-all-tokens-daily` (03h) | A diária repete o que a de 4 h já faz | Apagar a diária |
| `sync-tracking-codes-daily` (08h) + `sync-tracking-daily` (20h) | Duas rotinas iguais em horários diferentes | Juntar numa rotina só com os dois horários (`0 11,23 * * *`) — mesmo efeito, uma linha a menos |
| `archive-webhook-logs-daily` + `archive-fe-group-events-weekly` | Mesma função, tabelas diferentes | **Manter** (não é repetição) |

## 3. Tabelas sem uso (vão para o schema `arquivo`)

| Tabela | Linhas | Referências no código | Referências no banco |
|---|---|---|---|
| `scheduled_jobs` | 0 | nenhuma | só a chave estrangeira de `scheduled_messages` |
| `scheduled_messages` | 0 | nenhuma | nenhuma |
| `payment_integrations` | 1 | nenhuma | nenhuma (substituída pelas tabelas por gateway) |
| `integration_manychat` | 1 | nenhuma | nenhuma |

**Manter** (parecem paradas, mas são usadas): `auth_login_failures` (proteção do login), `report_cache` (cache de relatórios),
`whatsapp_active_sessions`, `support_*`, `tenant_users`, `integration_whatsapp_official`, `whatsapp_connection_logs`.
O sistema de indicação antigo (`referral_*`) já não existe no banco — nada a fazer.

## Como será testado
1. Uso dos últimos dias de cada função (registros do Supabase) no dia da execução; qualquer chamada nova = não apaga.
2. Busca no código e no banco por qualquer referência (feita aqui; refazer no dia).
3. Tabelas: `alter table ... set schema arquivo` (volta com um comando); funções: o código continua no histórico do GitHub.
4. Depois de cada bloco: sininho e registros por 24 h.
