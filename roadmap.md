# Current task

- [x] Add super_admin-only recurring links table and access policy.
- [x] Add Pagar.me create/list function and isolated Empresas dialog.
- [x] Run five isolated tests, deploy the function, and verify 401 denial and successful CORS preflight without creating links.
- [ ] Validate authenticated listing and dialog: blocked by unavailable super_admin browser session on external Supabase; no links may be generated during validation.