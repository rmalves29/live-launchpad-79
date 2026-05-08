## Diagnóstico

Confirmei a causa do "Loja não encontrada" no link de pagamento:

- O checkout público (`/t/:slug`) lê o tenant via `from('tenants_public')` em `src/pages/pedidos/PublicCheckout.tsx`, `TenantStorefront.tsx` e `useTenantBySlug.ts`.
- A view `public.tenants_public` está com a opção `security_invoker = true`. Isso faz a view rodar com as RLS do usuário que consulta.
- A tabela `public.tenants` tem RLS restritiva: só `authenticated` (super admin ou dono do tenant) pode ler. Não há policy para `anon`.
- Resultado: clientes não logados (link de pagamento) recebem `[]` da view → "Loja não encontrada".

A view só expõe colunas públicas (id, name, slug, logo_url, cores, flags, dados públicos da empresa) — sem e-mail, telefone, tokens ou qualquer PII sensível. Portanto pode ser lida por `anon`.

## Correção (1 migration SQL)

Criar `supabase/migrations/<timestamp>_fix_tenants_public_anon.sql`:

```sql
-- Roda a view como owner (bypassa RLS da tabela tenants)
ALTER VIEW public.tenants_public SET (security_invoker = false);

-- Garante leitura pública (link de pagamento, storefront, cadastro)
GRANT SELECT ON public.tenants_public TO anon, authenticated;
```

Não há mudança em código frontend nem em outras tabelas. As RLS da tabela `tenants` continuam intactas — apenas a view (que só tem campos públicos) volta a ser legível por anônimos, como era antes da atualização das RLS de ontem.

## Validação

1. Após a migration, rodar no SQL: `SELECT id, name, slug FROM tenants_public WHERE slug='fernandalimasemijoia';` como `anon` deve retornar 1 linha.
2. Abrir o link de pagamento do cliente — deve carregar o checkout normalmente sem precisar republicar o frontend.
