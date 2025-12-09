import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { ExternalLink, Play, Building2 } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

export function TenantSimulator() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, is_active')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setTenants(data || []);
    } catch (error) {
      console.error('Erro ao carregar tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedTenant = tenants.find(t => t.id === selectedTenantId);

  const openStorefront = () => {
    if (selectedTenant) {
      const url = `${window.location.origin}/${selectedTenant.slug}`;
      window.open(url, '_blank');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Simulador de Tenant
        </CardTitle>
        <CardDescription>
          Simule a experiência de um tenant específico
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Selecionar Tenant</Label>
          <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha um tenant..." />
            </SelectTrigger>
            <SelectContent>
              {tenants.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedTenant && (
          <div className="space-y-3 p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Nome:</span>
              <span className="text-sm">{selectedTenant.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Slug:</span>
              <Badge variant="outline">{selectedTenant.slug}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status:</span>
              <Badge variant={selectedTenant.is_active ? 'default' : 'secondary'}>
                {selectedTenant.is_active ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">URL:</span>
              <code className="text-xs bg-background px-2 py-1 rounded">
                /{selectedTenant.slug}
              </code>
            </div>
          </div>
        )}

        <Button 
          onClick={openStorefront} 
          disabled={!selectedTenant}
          className="w-full"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Abrir Loja do Tenant
        </Button>
      </CardContent>
    </Card>
  );
}
