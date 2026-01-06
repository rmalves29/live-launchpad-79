import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Search, Building2, CheckCircle2, XCircle, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { differenceInDays } from "date-fns";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  is_blocked: boolean | null;
  plan_type: string | null;
  subscription_ends_at: string | null;
  admin_email: string | null;
  created_at: string;
}

export default function EmpresasIndex() {
  const { profile } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, is_active, is_blocked, plan_type, subscription_ends_at, admin_email, created_at')
        .order('name');

      if (error) throw error;
      setTenants(data || []);
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysRemaining = (subscriptionEndsAt: string | null): number | null => {
    if (!subscriptionEndsAt) return null;
    const endDate = new Date(subscriptionEndsAt);
    const now = new Date();
    return differenceInDays(endDate, now);
  };

  const getStatusBadge = (tenant: Tenant) => {
    if (tenant.is_blocked) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Bloqueado
        </Badge>
      );
    }
    if (!tenant.is_active) {
      return (
        <Badge variant="secondary" className="gap-1">
          <XCircle className="h-3 w-3" />
          Inativo
        </Badge>
      );
    }
    return (
      <Badge className="gap-1 bg-emerald-500 hover:bg-emerald-600">
        <CheckCircle2 className="h-3 w-3" />
        Ativo
      </Badge>
    );
  };

  const getPlanBadge = (planType: string | null) => {
    const plan = planType || 'trial';
    const planColors: Record<string, string> = {
      trial: 'bg-blue-100 text-blue-800 border-blue-200',
      basic: 'bg-gray-100 text-gray-800 border-gray-200',
      pro: 'bg-purple-100 text-purple-800 border-purple-200',
      enterprise: 'bg-amber-100 text-amber-800 border-amber-200',
    };
    return (
      <Badge variant="outline" className={planColors[plan] || planColors.trial}>
        {plan}
      </Badge>
    );
  };

  const getPrazoBadge = (tenant: Tenant) => {
    // Super admin (trial ilimitado)
    if (tenant.plan_type === 'trial' && !tenant.subscription_ends_at) {
      return (
        <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
          <CheckCircle2 className="h-3 w-3" />
          Ilimitado
        </Badge>
      );
    }

    const daysRemaining = getDaysRemaining(tenant.subscription_ends_at);

    if (daysRemaining === null) {
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <Clock className="h-3 w-3" />
          Não definido
        </Badge>
      );
    }

    if (daysRemaining <= 0) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Expirado
        </Badge>
      );
    }

    if (daysRemaining <= 5) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          {daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'}
        </Badge>
      );
    }

    if (daysRemaining <= 10) {
      return (
        <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 border-amber-200">
          <Clock className="h-3 w-3" />
          {daysRemaining} dias
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        {daysRemaining} dias
      </Badge>
    );
  };

  const filteredTenants = tenants.filter(tenant =>
    tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tenant.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (tenant.admin_email?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
  );

  // Estatísticas
  const totalEmpresas = tenants.length;
  const empresasAtivas = tenants.filter(t => t.is_active && !t.is_blocked).length;
  const empresasInativas = tenants.filter(t => !t.is_active || t.is_blocked).length;
  const empresasExpiradas = tenants.filter(t => {
    const days = getDaysRemaining(t.subscription_ends_at);
    return days !== null && days <= 0;
  }).length;

  if (profile?.role !== 'super_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h2 className="text-lg font-semibold mb-2">Acesso Restrito</h2>
            <p className="text-muted-foreground">
              Esta página é restrita a administradores do sistema.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Empresas Cadastradas
          </h1>
          <p className="text-muted-foreground">Visão geral de todas as empresas do sistema</p>
        </div>
        <Button variant="outline" onClick={loadTenants} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{totalEmpresas}</p>
              </div>
              <Building2 className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ativas</p>
                <p className="text-2xl font-bold text-emerald-600">{empresasAtivas}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Inativas</p>
                <p className="text-2xl font-bold text-gray-500">{empresasInativas}</p>
              </div>
              <XCircle className="h-8 w-8 text-gray-400/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expiradas</p>
                <p className="text-2xl font-bold text-destructive">{empresasExpiradas}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-destructive/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Empresas */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <CardTitle>Lista de Empresas</CardTitle>
              <CardDescription>
                {filteredTenants.length} empresa{filteredTenants.length !== 1 ? 's' : ''} encontrada{filteredTenants.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar empresa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTenants.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma empresa encontrada
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Email Admin</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Plano</TableHead>
                    <TableHead className="text-center">Prazo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{tenant.name}</p>
                          <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {tenant.admin_email || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(tenant)}
                      </TableCell>
                      <TableCell className="text-center">
                        {getPlanBadge(tenant.plan_type)}
                      </TableCell>
                      <TableCell className="text-center">
                        {getPrazoBadge(tenant)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
