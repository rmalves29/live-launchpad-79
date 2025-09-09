import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Search, ArrowRight, AlertCircle } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  tenant_key: string;
  is_active: boolean;
  created_at: string;
}

export default function TenantSelector() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setTenants(data || []);
    } catch (error) {
      console.error('Error loading tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTenants = tenants.filter(tenant =>
    tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tenant.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTenantSelect = (tenant: Tenant) => {
    navigate(`/empresa/${tenant.slug}/login`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-4">
              <div className="h-8 bg-muted animate-pulse rounded mx-auto w-64" />
              <div className="h-4 bg-muted animate-pulse rounded mx-auto w-96" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-32 bg-muted animate-pulse rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-6 py-8">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Building2 className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-4xl font-bold">Sistema Multi-Empresa</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Selecione a empresa que deseja acessar para fazer login e gerenciar seus dados
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Search */}
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar empresa por nome ou identificador..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Tenants Grid */}
          {filteredTenants.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredTenants.map((tenant) => (
                <Card key={tenant.id} className="hover:shadow-lg transition-shadow cursor-pointer group">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <CardTitle className="text-xl group-hover:text-primary transition-colors">
                          {tenant.name}
                        </CardTitle>
                        <Badge variant="secondary" className="w-fit">
                          {tenant.slug}
                        </Badge>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="mb-4">
                      Clique para acessar o sistema desta empresa
                    </CardDescription>
                    <Button 
                      onClick={() => handleTenantSelect(tenant)}
                      className="w-full"
                    >
                      Acessar Sistema
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                {searchTerm ? (
                  <>
                    <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Nenhuma empresa encontrada</h3>
                    <p className="text-muted-foreground mb-4">
                      Não encontramos empresas com o termo "{searchTerm}"
                    </p>
                    <Button variant="outline" onClick={() => setSearchTerm('')}>
                      Limpar Busca
                    </Button>
                  </>
                ) : (
                  <>
                    <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Nenhuma empresa disponível</h3>
                    <p className="text-muted-foreground">
                      Não há empresas ativas no sistema no momento.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Admin Access */}
          <Card>
            <CardContent className="p-6 text-center">
              <h3 className="text-lg font-semibold mb-2">Área Administrativa</h3>
              <p className="text-muted-foreground mb-4">
                Acesso para administradores do sistema
              </p>
              <div className="space-x-2">
                <Button variant="outline" onClick={() => navigate('/auth')}>
                  Login Administrativo
                </Button>
                <Button variant="outline" onClick={() => navigate('/dashboard')}>
                  Dashboard Admin
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}