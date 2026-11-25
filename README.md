# Cartzy

Produção: https://app.cartzy.com.br

> **Nome oficial: Cartzy.** "OrderZap" / "orderzap-v2" é o **nome legado** e só aparece em histórico interno
> (commits antigos e `docs/legado/`). Não use em código, telas ou documentação nova.
>
> **Não existe** back-end Node/Express, front Next.js nem pastas `backend/` e `frontend/` neste repositório.
> Documentos que descrevem isso são antigos e estão em `docs/legado/`.

## O que é

Plataforma **multi-tenant** (várias lojas no mesmo sistema, separadas por `tenant_id`) para lojas que vendem em
**lives** (Instagram e TikTok) e pelo **WhatsApp**. Cobre:
- gestão de pedidos, produtos e clientes;
- vitrine e checkout públicos;
- pagamentos, frete e etiquetas;
- mensagens automáticas de WhatsApp;
- integração com ERPs.

## Perfis

| Perfil | Papel (`profiles.role`) | O que acessa |
|---|---|---|
| **Super Admin** | `super_admin` | Todas as empresas: `/empresas`, `/admin/*` (saúde, erros, relatório global, afiliados da plataforma) |
| **Admin da loja** | `tenant_admin` | Tudo da própria loja (pedidos, produtos, live, configurações, integrações) |
| **Staff** | `staff` | Operação da loja, com acesso limitado (previsto; pouco usado hoje) |
| **Afiliado da plataforma** | `affiliate` | Só `/afiliado` e páginas públicas: indica novas lojas para o Cartzy e recebe comissão |

A **afiliada da Loja da Live** é outro conceito: é uma divulgadora de **uma loja**, que vende pelo link
`/t/:slug/live/a/:codigo` e acompanha as vendas em `/t/:slug/afiliada/:token`. Ela não tem login e fica na
tabela `affiliates`, enquanto os afiliados da plataforma ficam em `platform_affiliate*`.

## Módulos principais

| Módulo | Onde |
|---|---|
| **Pedidos** | `/pedidos`, `/pedidos-manual`, `/checkout` (agrupamento por telefone/dia/evento, pago, separação, envio) |
| **Live Commerce** | `/live` (Instagram), `/live-tiktok`, `/tiktok-automacao` + programa `tiktok-live-reader/` |
| **Loja da Live** | gestão em `/loja-da-live`; vitrine pública em `/t/:slug/live` (função `live-shop`) |
| **Checkout público** | `/t/:slug/checkout`, `/t/:slug` (vitrine/bazar), retorno de pagamento em `/pagamento/retorno` |
| **Produtos** | `/produtos` (variações, estoque, tipo de venda LIVE/BAZAR/AMBOS) |
| **Clientes** | `/clientes`, cadastro público por `/t/:slug/cadastro-instagram` e `/t/:slug/cadastro-tiktok` |
| **WhatsApp** | `/whatsapp/*` (conexão UazAPI/Z-API, modelos de mensagem, cobrança, envios ativos), `/sendflow`, `/fluxo-envio/*` |
| **Etiquetas e frete** | `/etiquetas`, `/envios-ativos` |
| **Relatórios** | `/relatorios`; global em `/admin/relatorio-global` |
| **Integrações** | `/integracoes` (ERPs, pagamentos, transportadoras) |
| **Afiliados** | afiliadas da loja em `/loja-da-live`; afiliados da plataforma em `/afiliado` e `/admin/afiliados` |

## Stack

- **Vite** + **React 18** + **TypeScript** (SPA com `react-router-dom`)
- **Supabase**: Postgres com RLS, Auth, Storage, **Edge Functions (Deno)**, `pg_cron` e `pg_net`
- **Tailwind CSS** + **shadcn-ui** (Radix)
- **React Query** (`@tanstack/react-query`)
- O front é publicado pelo **Lovable**. Banco e funções ficam no projeto Supabase `hxtbsieodbtzgcvvkeqx`.

## Estrutura

```
src/
  pages/            telas (uma pasta por módulo)
  components/       componentes (ui/ = shadcn-ui)
  integrations/     cliente Supabase e tipos gerados (src/integrations/supabase/)
  lib/ hooks/ contexts/ types/
supabase/
  functions/        Edge Functions (Deno), uma pasta por função; código compartilhado em _shared/
  migrations/       migrações SQL (ordem pelo nome)
  config.toml       configuração das funções (ex.: verify_jwt)
tests/              testes (node --test)
scripts/            scripts auxiliares usados no build
tiktok-live-reader/ programa local que lê os comentários da live do TikTok
docs/               guias de integração; docs/legado/ = documentação antiga (OrderZap v2)
```

## Como rodar

```bash
npm install
npm run dev                    # servidor local (Vite)
npm run build                  # build de produção — use para validar mudanças
node --test tests/*.test.mjs   # testes
```

O build consulta o Supabase para gerar as páginas de cadastro das lojas (`scripts/tenant-registration-pages.mjs`),
então precisa de acesso à internet.

## Variáveis de ambiente

**Front (Vite):** o endereço e a chave **pública** do Supabase já estão em `src/integrations/supabase/client.ts`
(arquivo gerado pelo Lovable; não editar à mão). Não é preciso `.env` para rodar. As variáveis opcionais
(`VITE_APP_VERSION`, `VITE_SUPABASE_URL`) estão em `.env.example`. Variável de front precisa começar com `VITE_`
e é visível no navegador: **nunca coloque segredo nela**.

**Edge Functions:** os segredos ficam nas variáveis do projeto Supabase (Settings > Edge Functions), nunca no
código. Os principais são:
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (o Supabase já fornece);
- chaves da plataforma, como `PAGARME_ORDERZAP_API_KEY`, que é a assinatura das lojas.

Credenciais **de cada loja** (Bling, Olist, Bagy, gateways, transportadoras, WhatsApp) ficam no banco, nas tabelas
`integration_*` e `shipping_integrations`, e não em variáveis de ambiente.

## Fluxos críticos

Antes de mexer em qualquer um destes fluxos, leia o `AGENTS.md` e teste ponta a ponta.

1. **Pedido da live (Instagram/TikTok):**
   - A cliente comenta o código do produto e o webhook (`instagram-webhook` ou `tiktok-live-comment`) identifica a cliente pelo @.
   - O item vai para o carrinho/pedido do dia (agrupado por telefone/dia/evento) e o estoque é reservado.
   - A mensagem "item adicionado" sai pela função `zapi-send-item-added`, que respeita `integration_whatsapp.send_item_added_msg`.
2. **Loja da Live** (função `live-shop`):
   - A vitrine `/t/:slug/live` lista os produtos LIVE/AMBOS com estoque. A lista tem cache de 3 s.
   - Reserva, carrinho e pedido sempre consultam o banco na hora.
   - Lojas com "pedido aberto" (`tenants.live_open_order`) criam o pedido já ao adicionar o primeiro item.
3. **Estoque:**
   - A reserva é atômica (`reserve_product_stock` / `release_product_stock` / `restore_order_stock`), e quem chega primeiro leva.
   - A conferência com o ERP (`erp-stock-reconcile`, a cada 15 min, e `bling-webhook`) desconta o que está reservado em pedidos que ainda não foram para o ERP.
4. **Pagamento:**
   - O webhook do gateway (`pagarme-webhook`, `mp-webhook`, `infinitepay-webhook`, ...) marca o pedido como pago.
   - Os gatilhos do banco disparam a mensagem "pagamento confirmado" (`zapi-send-paid-order`, que respeita `send_paid_order_msg`) e o envio ao ERP (Bling/Olist/Bagy).
5. **Envio:**
   - A etiqueta é gerada pela transportadora. A mensagem de "pedido enviado" só sai quando a transportadora confirma a postagem: gerar etiqueta não é postagem (`_shared/postage-confirmation.ts`).
6. **Assinatura das lojas:**
   - O Pagar.me cobra a loja e o webhook `pagarme-subscription-webhook` credita o período.
   - O vencimento da loja é `tenants.subscription_ends_at`.
7. **Rotinas automáticas:**
   - Ficam em `pg_cron` e chamam funções por `pg_net`.
   - Não gere carga em massa pela fila do `pg_net`: ela é a mesma que dispara mensagens e rotinas do sistema.

## Regras para quem mexe no projeto (pessoas e IAs)

- Leia o **`AGENTS.md`**: são regras de arquitetura que não podem ser quebradas.
- Mudança de banco é sempre uma **nova** migração em `supabase/migrations/`. Nunca edite uma migração já aplicada.
- Todo dado é separado por loja (`tenant_id`) e protegido por RLS. As funções públicas validam a loja pelo slug.
- Nada de segredo no código ou em variável `VITE_`.
