import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';

// Bloqueia a página quando o módulo está desligado para a empresa (tenants.enable_live / enable_sendflow).
// Esconder o item do menu não basta: quem digita o endereço direto também é mandado de volta aos Pedidos.
// Super admin sempre entra (precisa testar e ajustar qualquer empresa).
export function FeatureGate({ feature, children }: { feature: 'live' | 'sendflow'; children: React.ReactNode }) {
  const { tenant, loading } = useTenant();
  const { profile } = useAuth();
  if (loading || !tenant) return <>{children}</>;
  if (profile?.role === 'super_admin') return <>{children}</>;
  const enabled = feature === 'live' ? tenant.enable_live ?? true : tenant.enable_sendflow ?? true;
  return enabled ? <>{children}</> : <Navigate to="/pedidos" replace />;
}
