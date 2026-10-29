# Current task

- [ ] Remove platform Mercado Pago fallbacks from tenant order functions and verify public checkout error.
- [ ] Run payment isolation tests, deploy changed functions, and publish frontend.

- [x] Add super_admin-only recurring links table and access policy.
- [x] Add Pagar.me create/list function and isolated Empresas dialog.
- [x] Run five isolated tests, deploy the function, and verify 401 denial and successful CORS preflight without creating links.
- [ ] Validate authenticated listing and dialog: blocked by unavailable super_admin browser session on external Supabase; no links may be generated during validation.