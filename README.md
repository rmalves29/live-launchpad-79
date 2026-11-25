# Cartzy

Plataforma SaaS multi-empresa (multi-tenant) para lojas que vendem em **lives** (Instagram e TikTok) e pelo **WhatsApp**:
lançamento de pedidos da live, vitrine pública da live (Loja da Live), checkout e pagamentos, frete e etiquetas,
mensagens automáticas de WhatsApp e integração com ERPs.

Produção: https://app.cartzy.com.br

> **Nome oficial: Cartzy.** "OrderZap" / "orderzap-v2" é o **nome legado** do projeto e só aparece em histórico
> interno (commits antigos, documentos em `docs/legado/`). Não use em código, telas ou documentação nova.

---

## Stack atual

| Camada | Tecnologia |
|---|---|
| Front-end | **Vite + React 18 + TypeScript** (SPA, `react-router-dom`, `@tanstack/react-query`) |
| UI | **Tailwind CSS + shadcn-ui** (Radix) |
| Back-end | **Supabase**: Postgres (com RLS), Auth, Storage, **Edge Functions (Deno)**, `pg_cron` e `pg_net` |
| Hospedagem | Front publicado pelo **Lovable**; banco e funções no projeto Supabase `hxtbsieodbtzgcvvkeqx` |

**Não existe** back-end Node/Express nem Next.js neste repositório. Documentos que falam disso são antigos
e estão em `docs/legado/`.

---

## Estrutura

```
src/
  pages/            telas (pedidos, produtos, live, loja-live, clientes, etiquetas, whatsapp, config, empresas, ...)
  components/       componentes (ui/ = shadcn-ui)
  integrations/     cliente Supabase e tipos gerados (src/integrations/supabase/types.ts)
  lib/ hooks/ contexts/ types/
supabase/
  functions/        Edge Functions (Deno), uma pasta por função; código compartilhado em _shared/
  migrations/       migrações SQL (ordem pelo nome)
  config.toml       configuração das funções (ex.: verify_jwt)
tests/              testes Node (node --test)
scripts/            scripts auxiliares
tiktok-live-reader/ programa local que lê os comentários da live do TikTok e envia ao Cartzy
public/             arquivos estáticos
```

Rotas públicas importantes: `/t/:slug/live` (vitrine da live, servida pela função `live-shop`).

---

## Rodando localmente

```bash
npm install
npm run dev                    # Vite
npm run build                  # build de produção (use para validar mudanças)
node --test tests/*.test.mjs   # testes
```

O endereço e a chave pública do Supabase já estão em `src/integrations/supabase/client.ts` (arquivo gerado);
não é preciso `.env` para rodar o front. Veja `.env.example` para as variáveis opcionais.

As Edge Functions rodam no Supabase (Deno). Para publicar uma função alterada: publicar pelo Lovable
ou fazer deploy no projeto Supabase.

---

## Integrações (Edge Functions em `supabase/functions`)

- **WhatsApp:** UazAPI e Z-API (`zapi-*`, `uazapi-*`)
- **Redes sociais / live:** Instagram (`instagram-*`), TikTok (`tiktok-*` + `tiktok-live-reader/`)
- **Pagamentos:** Pagar.me, Mercado Pago, AppMax, InfinitePay, Asaas
- **Frete e etiquetas:** Melhor Envio, Mandaê, Manda Bem, Frenet, SuperFrete, Correios
- **ERPs:** Bling, Olist (Tiny), Bagy; conferência de estoque automática em `erp-stock-reconcile`

---

## Regras para quem mexe no projeto (pessoas e IAs)

- Leia **`AGENTS.md`**: regras de arquitetura que não podem ser quebradas.
- Mudança de banco = nova migração em `supabase/migrations/` (nunca editar migração já aplicada).
- Dados são separados por empresa (`tenant_id`) e protegidos por RLS; funções públicas validam a empresa pelo slug.
- Segredos ficam nas variáveis do Supabase, nunca no código.
