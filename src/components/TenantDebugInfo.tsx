import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTenantContext } from '@/contexts/TenantContext';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { Info, RefreshCw, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const TenantDebugInfo = () => {
  const { tenant, tenantId, isMainSite } = useTenantContext();
  const [localStorageTenantId, setLocalStorageTenantId] = useState<string | null>(null);
  const [currentSupabaseTenantId, setCurrentSupabaseTenantId] = useState<string | null>(null);

  const refresh = () => {
    const stored = localStorage.getItem('previewTenantId');
    setLocalStorageTenantId(stored);
    setCurrentSupabaseTenantId(supabaseTenant.getTenantId());
  };

  useEffect(() => {
    refresh();
  }, [tenant, tenantId]);

  const clearLocalStorage = () => {
    localStorage.removeItem('previewTenantId');
    console.log('🧹 localStorage limpo');
    refresh();
    window.location.reload();
  };

  const forceSetManiaDeMulher = () => {
    const maniaId = '08f2b1b9-3988-489e-8186-c60f0c0b0622';
    localStorage.setItem('previewTenantId', maniaId);
    supabaseTenant.setTenantId(maniaId);
    console.log('✅ Tenant MANIA DE MULHER forçado');
    window.location.reload();
  };

  return (
    <Card className="mt-4 border-2 border-dashed border-blue-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Info className="h-4 w-4" />
          Debug - Informações do Tenant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="font-semibold">Modo:</span>
          </div>
          <div>
            <Badge variant={isMainSite ? 'secondary' : 'default'}>
              {isMainSite ? 'Preview/Localhost' : 'Produção'}
            </Badge>
          </div>

          <div>
            <span className="font-semibold">Tenant Atual:</span>
          </div>
          <div>
            {tenant ? (
              <span className="text-green-600 font-medium">{tenant.name}</span>
            ) : (
              <span className="text-orange-600">Nenhum selecionado</span>
            )}
          </div>

          <div>
            <span className="font-semibold">Tenant ID (Context):</span>
          </div>
          <div>
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              {tenantId || 'null'}
            </code>
          </div>

          <div>
            <span className="font-semibold">localStorage ID:</span>
          </div>
          <div>
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              {localStorageTenantId || 'null'}
            </code>
          </div>

          <div>
            <span className="font-semibold">Supabase Client ID:</span>
          </div>
          <div>
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              {currentSupabaseTenantId || 'null'}
            </code>
          </div>
        </div>

        {!tenantId && (
          <Alert className="border-orange-500 bg-orange-50">
            <AlertDescription className="text-sm text-orange-900">
              <strong>⚠️ Nenhum tenant selecionado!</strong>
              <br />
              As consultas ao banco não funcionarão corretamente.
            </AlertDescription>
          </Alert>
        )}

        {localStorageTenantId !== tenantId && (
          <Alert className="border-yellow-500 bg-yellow-50">
            <AlertDescription className="text-sm text-yellow-900">
              <strong>⚠️ Inconsistência detectada!</strong>
              <br />
              O ID no localStorage não corresponde ao ID do contexto.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={refresh}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Atualizar
          </Button>
          <Button size="sm" variant="outline" onClick={clearLocalStorage}>
            <Trash2 className="h-3 w-3 mr-1" />
            Limpar Cache
          </Button>
          <Button size="sm" variant="default" onClick={forceSetManiaDeMulher}>
            Forçar Mania de Mulher
          </Button>
        </div>

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            <strong>ID Esperado (Mania de Mulher):</strong>
            <br />
            <code className="text-xs">08f2b1b9-3988-489e-8186-c60f0c0b0622</code>
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
