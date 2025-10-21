import { useTenantContext } from '@/contexts/TenantContext';
import { Badge } from '@/components/ui/badge';
import { Building2, Globe } from 'lucide-react';

/**
 * Componente para mostrar informações do tenant atual
 * Útil para debugging e indicação visual
 */
export const TenantInfo = () => {
  const { tenant, isMainSite } = useTenantContext();

  if (isMainSite) {
    return (
      <Badge variant="outline" className="flex items-center gap-2">
        <Globe className="h-3 w-3" />
        Site Principal
      </Badge>
    );
  }

  if (tenant) {
    return (
      <Badge variant="default" className="flex items-center gap-2">
        <Building2 className="h-3 w-3" />
        {tenant.name}
      </Badge>
    );
  }

  return null;
};