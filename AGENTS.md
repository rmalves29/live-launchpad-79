# Architecture rules

- Export membership status uses complete per-phone/per-group event history and failed group JIDs, independently of report date/campaign filters; unavailable participant lists never imply an empty group.

- Attribute Fluxo de Envio membership events in the database insert trigger with locked, single-use clicks; campaign metrics use event campaign_id rather than mutable group links to avoid double counting shared groups.

- Keep recurring payment links isolated in their own Empresas dialog and edge function, reusing protected server-side super_admin authorization; existing company management and subscription flows must remain unchanged.
- Resolve order Mercado Pago credentials through the shared active-tenant token helper, failing closed without a token; platform subscription credentials remain separate to prevent cross-store payment routing.