-- Revoga permissões padrão para garantir que apenas o necessário seja concedido
REVOKE EXECUTE ON FUNCTION public.admin_global_report(timestamptz, timestamptz, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.admin_global_report(timestamptz, timestamptz, uuid) FROM anon;

-- Concede permissão apenas para usuários autenticados e role de serviço
GRANT EXECUTE ON FUNCTION public.admin_global_report(timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_global_report(timestamptz, timestamptz, uuid) TO service_role;