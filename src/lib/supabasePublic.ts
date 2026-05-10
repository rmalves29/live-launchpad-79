// Constantes públicas do Supabase para uso em chamadas diretas a edge functions.
// A chave anon (publishable) é segura para expor no frontend por design.
// NÃO coloque service role keys aqui.
// Nota: VITE_* env vars não funcionam de forma confiável em todos os ambientes (ex: Lovable Cloud),
// por isso as constantes estão hardcoded aqui.
export const SUPABASE_URL = "https://hxtbsieodbtzgcvvkeqx.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4";
