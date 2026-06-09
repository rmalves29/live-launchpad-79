import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  Bug,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface SentryIssue {
  id: string;
  title: string;
  status: string;
  level: string;
  count: string;
  userCount: number;
  lastSeen: string;
  firstSeen: string;
  culprit: string;
  permalink: string;
  shortId: string;
}

export default function AdminErros() {
  const [issues, setIssues] = useState<SentryIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('unresolved');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<string>('14d');
  const [sort, setSort] = useState<string>('date');
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, critical: 0, error: 0, warning: 0, info: 0 });

  const fetchIssues = async (pageCursor?: string | null) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('action', 'issues');
      params.set('status', status);
      params.set('statsPeriod', period);
      params.set('sort', sort === 'date' ? 'date' : 'freq');
      if (query) params.set('query', query);
      if (pageCursor) params.set('cursor', pageCursor);
      params.set('limit', '25');

      const { data, error: invokeError } = await supabase.functions.invoke(`sentry-proxy?${params.toString()}`, {
        method: 'GET',
      });

      if (invokeError) throw new Error(invokeError.message);
      if (!data?.success) throw new Error(data?.error || 'Unknown error');

      const sentryIssues: SentryIssue[] = data.data || [];
      setIssues(sentryIssues);

      // Calculate stats from visible issues
      const newStats = { total: sentryIssues.length, critical: 0, error: 0, warning: 0, info: 0 };
      sentryIssues.forEach((issue) => {
        if (issue.level === 'fatal' || issue.level === 'critical') newStats.critical++;
        else if (issue.level === 'error') newStats.error++;
        else if (issue.level === 'warning') newStats.warning++;
        else newStats.info++;
      });
      setStats(newStats);

      // Parse pagination from Link header
      const linkHeader = data.pagination || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      setNextCursor(nextMatch ? nextMatch[1].split('cursor=')[1]?.split('&')[0] || null : null);
      setCursor(pageCursor || null);
    } catch (err: any) {
      console.error('Erro ao buscar issues do Sentry:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, period, sort]);

  const handleSearch = () => {
    fetchIssues(null);
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'fatal':
      case 'critical':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Critical</Badge>;
      case 'error':
        return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Error</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Warning</Badge>;
      default:
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Info</Badge>;
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'fatal':
      case 'critical':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bug className="w-6 h-6" />
            Monitor de Erros — Sentry
          </h1>
          <p className="text-muted-foreground mt-1">
            Visualize erros e exceções capturados pelo Sentry em tempo real.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchIssues(cursor)}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total na página</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Bug className="w-8 h-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Errors</p>
                <p className="text-2xl font-bold text-orange-600">{stats.error}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Warnings</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.warning}</p>
              </div>
              <Info className="w-8 h-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">Buscar</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: TypeError, component name..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={loading}>
                  Buscar
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unresolved">Não resolvido</SelectItem>
                  <SelectItem value="resolved">Resolvido</SelectItem>
                  <SelectItem value="ignored">Ignorado</SelectItem>
                  <SelectItem value="">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Período</label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1 hora</SelectItem>
                  <SelectItem value="24h">24 horas</SelectItem>
                  <SelectItem value="7d">7 dias</SelectItem>
                  <SelectItem value="14d">14 dias</SelectItem>
                  <SelectItem value="30d">30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Ordenar</label>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Data</SelectItem>
                  <SelectItem value="freq">Frequência</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error alert */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Issues table */}
      <Card>
        <CardHeader>
          <CardTitle>Issues</CardTitle>
          <CardDescription>
            Erros capturados pelo Sentry no período selecionado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && issues.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : issues.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bug className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Nenhum erro encontrado</p>
              <p className="text-sm">Tente ajustar os filtros ou o período de busca.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Nível</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead className="w-[100px]">Ocorrências</TableHead>
                    <TableHead className="w-[100px]">Usuários</TableHead>
                    <TableHead className="w-[150px]">Último</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell>{getLevelIcon(issue.level)}</TableCell>
                      <TableCell>
                        <div className="max-w-[400px]">
                          <p className="font-medium text-sm truncate" title={issue.title}>
                            {issue.title}
                          </p>
                          <p className="text-xs text-muted-foreground truncate" title={issue.culprit}>
                            {issue.culprit || issue.shortId}
                          </p>
                          <div className="mt-1 flex gap-1 flex-wrap">
                            {getLevelBadge(issue.level)}
                            {issue.status !== 'unresolved' && (
                              <Badge variant="outline">
                                {issue.status === 'resolved' ? 'Resolvido' : 'Ignorado'}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono">{issue.count}</TableCell>
                      <TableCell className="text-sm">{issue.userCount || 0}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {issue.lastSeen
                          ? new Date(issue.lastSeen).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(issue.permalink, '_blank', 'noopener,noreferrer')}
                          title="Ver no Sentry"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchIssues(null)}
                  disabled={!cursor || loading}
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  {issues.length} issue{issues.length !== 1 ? 's' : ''} exibido{issues.length !== 1 ? 's' : ''}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchIssues(nextCursor)}
                  disabled={!nextCursor || loading}
                >
                  Próxima
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
