# Current task

- [x] Remove platform Mercado Pago fallbacks from tenant order functions and verify public checkout error with a real Jubiju order (no link generated).
- [x] Run five payment isolation tests and deploy create-payment, mp-webhook and backfill-payment-methods; request frontend publication (completion not independently confirmed: hosted asset fetch returned 403).

- [x] Add super_admin-only recurring links table and access policy.
- [x] Add Pagar.me create/list function and isolated Empresas dialog.
- [x] Run five isolated tests, deploy the function, and verify 401 denial and successful CORS preflight without creating links.
- [ ] Validate authenticated listing and dialog: blocked by unavailable super_admin browser session on external Supabase; no links may be generated during validation.