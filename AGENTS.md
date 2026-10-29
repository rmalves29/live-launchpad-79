# Architecture rules

- Keep recurring payment links isolated in their own Empresas dialog and edge function, reusing protected server-side super_admin authorization; existing company management and subscription flows must remain unchanged.