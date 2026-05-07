## Correções de segurança a aplicar

Aplicar via migrations SQL no Supabase. Nenhuma mudança em código frontend é necessária — todas são alterações de RLS / políticas / configurações de auth.

### 1. Migration única com todas as correções de RLS/políticas

**1. profiles — bloquear escalação de role**
- Substituir policy `Users can update own profile` por uma com `WITH CHECK` que impede mudar `role` e `tenant_id`:
  ```sql
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
    AND tenant_id IS NOT DISTINCT FROM (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  )
  ```
- Manter policy separada permitindo super_admin alterar roles.

**2. whatsapp_consent_state — habilitar RLS**
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- Policy SELECT/ALL para `tenant_id = get_current_tenant_id() OR is_super_admin()`
- Service role mantém acesso total (bypassa RLS).

**5. tenants — restringir colunas sensíveis**
- DROP da policy pública atual.
- Recriar policy pública restrita: usar uma VIEW `public.tenants_public` exposta com colunas seguras (id, name, slug, logo_url, primary_color, secondary_color, is_active, enable_live, enable_sendflow, max_whatsapp_groups). 
- Manter policy autenticada `tenant users can view own tenant` para colunas completas (admin do tenant + super_admin).
- Atualizar a função `get_tenant_by_slug` (já é SECURITY DEFINER) para continuar servindo storefront. Frontend público que lia direto `tenants` deve ler a view (verificar e ajustar se preciso).

**6. shipping_integrations — remover leitura pública**
- DROP `Public can view active shipping provider info`.
- Criar policy SELECT só para tenant_users do mesmo tenant + super_admin.
- Edge functions usam service role, então não quebram.

**7. Storage product-images — remover write anônimo**
- DROP policies `Anon can upload/update/delete product images`.
- Criar policies equivalentes para `authenticated` only, scoped por path/tenant.

**8. Storage knowledge-files — tornar privado**
- `UPDATE storage.buckets SET public = false WHERE id = 'knowledge-files'`.
- Adicionar policies SELECT/INSERT/UPDATE/DELETE para `authenticated` users do tenant.
- Ajustar leituras a usar URLs assinadas (`createSignedUrl`) — verificar uso no código.

**11. tenant_credentials — restringir a admins**
- DROP policy ampla.
- Recriar SELECT só para `is_tenant_admin()` ou `is_super_admin()`.

**12. whatsapp_session_conflicts — restringir SELECT**
- DROP `Users can view conflicts`.
- Criar policy autenticada com filtro por `tenant_id`.

**13. whatsapp_active_sessions — escopar por tenant**
- DROP policy USING(true) para autenticados.
- Recriar com `tenant_id = get_current_tenant_id() OR is_super_admin()`.

**14. instagram_live_comments — Realtime authz**
- Adicionar policy em `realtime.messages` restringindo subscriptions a canais cujo `tenant_id` bate com `get_current_tenant_id()` (ou super_admin).

**15. phone_fix_changes — INSERT só service_role**
- DROP `System can insert phone_fix_changes`.
- Recriar policy INSERT `TO service_role`.

**16. whatsapp_connection_logs — INSERT só service_role**
- Mesmo tratamento.

### 2. Configurações no painel Supabase Auth (não-SQL)

Estas precisam ser ajustadas pelo usuário no dashboard, não via código:

- **22. OTP expiry**: Auth → Providers → Email → reduzir "OTP expiry" para ≤ 1 hora (3600s).
- **23. Leaked password protection**: Auth → Policies → habilitar "Leaked password protection".
- **24. MFA**: Auth → Multi-factor → habilitar pelo menos TOTP.
- **25. Postgres upgrade**: Settings → Infrastructure → Upgrade do Postgres para versão com patches.

Vou listar links diretos no final da execução para o usuário clicar.

### Verificações após aplicar

1. Login normal continua funcionando (não foi tocado).
2. Storefront `/loja/:slug` continua carregando dados básicos do tenant via `get_tenant_by_slug`.
3. Checkout público continua funcionando (cart_items/orders/coupons NÃO foram tocados — fica para fase 2 conforme combinado).
4. Edge functions continuam acessando `shipping_integrations` e `knowledge-files` via service role.

### Riscos / pontos de atenção

- **tenants**: se o storefront público (componentes `Storefront*`) faz `select('*').eq('slug', ...)` direto na tabela em vez de usar `get_tenant_by_slug`, pode quebrar — vou inspecionar antes de aplicar e ajustar se necessário.
- **knowledge-files**: tornar bucket privado quebra `<img src={publicUrl}>` direto. Vou verificar onde é consumido e migrar para `createSignedUrl` se houver uso no frontend.
- Os 4 itens de painel (22–25) **não posso aplicar via código**; vou apenas instruir o usuário com os links.

### Entregáveis

1. Uma migration SQL consolidando os 12 fixes de banco/storage.
2. Possíveis ajustes pequenos no frontend se `tenants` ou `knowledge-files` forem consumidos de forma que quebre.
3. Marcar findings correspondentes como `mark_as_fixed` no scanner ao final.
4. Mensagem final com checklist dos 4 itens manuais (22–25) e links do dashboard.
