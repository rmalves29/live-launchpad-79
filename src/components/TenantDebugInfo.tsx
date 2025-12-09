import { useTenantContext } from '@/contexts/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function TenantDebugInfo() {
  const { tenantId, tenantSlug } = useTenantContext();

  return (
    <Card className="mt-4 border-dashed border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
      <CardHeader className="py-2">
        <CardTitle className="text-sm text-yellow-700 dark:text-yellow-400">
          🔧 Debug Info (dev only)
        </CardTitle>
      </CardHeader>
      <CardContent className="py-2">
        <div className="text-xs space-y-1 text-yellow-800 dark:text-yellow-300">
          <p><strong>Tenant ID:</strong> {tenantId || 'N/A'}</p>
          <p><strong>Tenant Slug:</strong> {tenantSlug || 'N/A'}</p>
          <p><strong>Host:</strong> {window.location.hostname}</p>
        </div>
      </CardContent>
    </Card>
  );
}
