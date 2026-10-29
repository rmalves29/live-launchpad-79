# Current task

- [x] Inspect existing UazAPI paths and implement two group/info attempts plus shared group/list fallback; missing participants remain a failed query.
- [x] Add unknown membership status, summary/filter and regression tests without changing campaign attribution; 11 tests, Deno check and automatic build passed.
- [x] Deploy export function and request frontend publication.
- [ ] Capture real UazAPI error body and verify authenticated Mania export: blocked by unavailable server credentials in sandbox and no authenticated session on external Supabase (deployed export returned 401).

- [x] Apply campaign attribution migration and chronological backfill; database validation found zero window, tenant, pairing, single-use or leave-attribution violations.
- [x] Update campaign counts, shared participants labels and unattributed tenant joins report; three focused tests passed and automatic build is OK.
- [x] Deploy fe-campaign-redirect, request frontend publication and report Mania de Mulher backfill totals (934 joins, 403 leaves); authenticated reporting UI validation remains blocked by external unmanaged Supabase session availability.

- [x] Remove platform Mercado Pago fallbacks from tenant order functions and verify public checkout error with a real Jubiju order (no link generated).
- [x] Run five payment isolation tests and deploy create-payment, mp-webhook and backfill-payment-methods; request frontend publication (completion not independently confirmed: hosted asset fetch returned 403).

- [x] Add super_admin-only recurring links table and access policy.
- [x] Add Pagar.me create/list function and isolated Empresas dialog.
- [x] Run five isolated tests, deploy the function, and verify 401 denial and successful CORS preflight without creating links.
- [ ] Validate authenticated listing and dialog: blocked by unavailable super_admin browser session on external Supabase; no links may be generated during validation.