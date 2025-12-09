import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { Badge } from '@/components/ui/badge';
import { Building2, Globe, TestTube } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Componente para simular diferentes tenants no ambiente de preview
 */
export const TenantSimulator = () => {
  const [tenants, setTenants] = useState<any[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const loadTenants = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseTenant.raw
        .rpc('list_active_tenants_basic');

      if (error) throw error;
      setTenants(data || []);
    } catch (error) {
      console.error('Erro ao carregar tenants:', error);
      toast.error('Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  };

  const simulateTenant = (tenantId: string | null) => {
    if (tenantId) {
      supabaseTenant.setTenantId(tenantId);
      const tenant = tenants.find(t => t.id === tenantId);
      toast.success(`Simulando tenant: ${tenant?.name}`);
    } else {
      supabaseTenant.setTenantId(null);
      toast.success('Voltando ao site principal');
    }
    // Forçar reload para aplicar o novo contexto
    window.location.reload();
  };

  useEffect(() => {
    loadTenants();
  }, []);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="h-5 w-5" />
          Simulador de Tenants
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Use para testar diferentes empresas no preview
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Select value={selectedTenant} onValueChange={setSelectedTenant}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="main">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Site Principal
                </div>
              </SelectItem>
              {tenants.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {tenant.name}
                    <Badge variant="outline" className="ml-2">
                      {tenant.slug}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => simulateTenant(selectedTenant === 'main' ? null : selectedTenant)}
            disabled={!selectedTenant || loading}
            className="flex-1"
          >
            Simular Empresa
          </Button>
          <Button
            variant="outline"
            onClick={() => simulateTenant(null)}
          >
            <Globe className="h-4 w-4" />
          </Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>• <strong>Site Principal:</strong> Gerencia todas as empresas</p>
          <p>• <strong>Empresas:</strong> Dados isolados (produtos, pedidos, etc.)</p>
          <p>• <strong>Produção:</strong> empresa.seudominio.com funcionará automaticamente</p>
        </div>
      </CardContent>
    </Card>
  );
};