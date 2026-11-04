# Architecture rules

- Generate new-company admin passwords with browser Web Crypto; retain them only in transient form/welcome state and never persist them in tenant credentials, because authentication provisioning owns password storage.

- Export membership status uses complete per-phone/per-group event history and failed group JIDs, independently of report date/campaign filters; unavailable participant lists never imply an empty group.

- Attribute Fluxo de Envio membership events in the database insert trigger with locked, single-use clicks; campaign metrics use event campaign_id rather than mutable group links to avoid double counting shared groups.

- Keep recurring payment links isolated in their own Empresas dialog and edge function, reusing protected server-side super_admin authorization; existing company management and subscription flows must remain unchanged.
- Resolve order Mercado Pago credentials through the shared active-tenant token helper, failing closed without a token; platform subscription credentials remain separate to prevent cross-store payment routing.- Company pre-registration approval lives in the tenant-onboarding edge function; admin login provisioning is shared via _shared/tenant-onboarding.ts with create-tenant-admin so login-hijack protections stay identical, and the full password is never persisted.

- Platform affiliate program uses platform_affiliate* tables (never the Loja da Live `affiliates` table or legacy referral_*); commission rules (idempotency, months limit, hold, cancel, payout) live in SECURITY DEFINER SQL functions called by pagarme-subscription-webhook and the admin UI, so every path applies the same rules.
- Affiliate leads are registered only through platform_lead_register (60-day first-wins lock) and booked via the affiliate-booking edge function; slot uniqueness is a DB unique index, and shared Pagar.me recurring-link payments are attributed in SQL (platform_pagarme_payment) so webhook and manual linking share one path.
- Platform affiliates have profile role `affiliate` with no tenant; App routing confines them to /afiliado and public pages, and the affiliate dashboard reads its own session directly because the global auth context can lag right after login.
