import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { isMenuEnabled, firstEnabledPath, type MenuKey } from '@/lib/menu-items';

// Bloqueia a página quando o item do menu está desligado para a empresa (Configurações > Empresas > Editar).
// Esconder o item do menu não basta: quem digita o endereço direto é mandado para o primeiro item ligado.
// Super admin sempre entra (precisa testar e ajustar qualquer empresa).
const LEGADO: Record<string, MenuKey> = { live: 'live_instagram', loja: 'loja_live', sendflow: 'sendflow' };

export function FeatureGate({ feature, children }: { feature: MenuKey | 'live' | 'loja'; children: React.ReactNode }) {
  const { tenant, loading } = useTenant();
  const { profile } = useAuth();
  if (loading || !tenant) return <>{children}</>;
  if (profile?.role === 'super_admin') return <>{children}</>;
  const key = (LEGADO[feature] || feature) as MenuKey;
  if (isMenuEnabled(tenant as any, key)) return <>{children}</>;
  const destino = firstEnabledPath(tenant as any, key);
  return destino ? <Navigate to={destino} replace /> : <>{children}</>;
}
