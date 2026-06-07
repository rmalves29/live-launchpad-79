import { useState, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, RefreshCw, X as XIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Job {
  id: string;
  tenant_id: string;
  job_type: string;
  status: string;
  total_items: number;
  processed_items: number;
  current_index: number;
  started_at: string | null;
  updated_at: string;
  error_message: string | null;
  job_data: any;
}

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-green-500 text-white',
  paused: 'bg-yellow-500 text-white',
  scheduled: 'bg-blue-500 text-white',
  completed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive text-destructive-foreground',
  error: 'bg-destructive text-destructive-foreground',
  failed: 'bg-destructive text-destructive-foreground',
};

const TYPE_LABEL: Record<string, string> = {
  cobranca: 'Cobrança em Massa',
  mass_message: 'SendFlow / Massa',
  sendflow: 'SendFlow',
};

export default function EnviosAtivos() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');

  const loadJobs = async () => {
    if (!tenant?.id) return;
    try {
      const { data, error } = await supabaseTenant
        .from('sending_jobs')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setJobs((data || []) as Job[]);
    } catch (e: any) {
      console.error('Erro carregando envios:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    const id = setInterval(loadJobs, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);

  const cancelJob = async (job: Job) => {
    if (!confirm(`Cancelar envio "${TYPE_LABEL[job.job_type] || job.job_type}" (${job.processed_items}/${job.total_items})?`)) return;
    try {
      const { error } = await supabaseTenant
        .from('sending_jobs')
        .update({ status: 'cancelled', completed_at: new Date().toISOString(), error_message: 'Cancelado pelo usuário (painel)' })
        .eq('id', job.id);
      if (error) throw error;
      toast({ title: 'Envio cancelado' });
      loadJobs();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  const pauseResumeJob = async (job: Job) => {
    const newStatus = job.status === 'paused' ? 'running' : 'paused';
    try {
      const patch: any = { status: newStatus };
      if (newStatus === 'paused') patch.paused_at = new Date().toISOString();
      const { error } = await supabaseTenant
        .from('sending_jobs')
        .update(patch)
        .eq('id', job.id);
      if (error) throw error;
      toast({ title: newStatus === 'paused' ? 'Envio pausado' : 'Envio retomado' });
      loadJobs();
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  const isStale = (j: Job) => {
    if (j.status !== 'running') return false;
    const last = new Date(j.updated_at).getTime();
    return Date.now() - last > 2 * 60 * 1000; // 2 min sem update
  };

  const filtered = jobs.filter((j) => {
    if (typeFilter !== 'all' && j.job_type !== typeFilter) return false;
    if (statusFilter === 'active') return ['running', 'paused', 'scheduled'].includes(j.status);
    if (statusFilter !== 'all' && j.status !== statusFilter) return false;
    return true;
  });

  const activeCount = jobs.filter((j) => ['running', 'paused'].includes(j.status)).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="w-7 h-7 text-primary" />
            Envios Ativos
          </h1>
          <p className="text-muted-foreground mt-1">
            Acompanhe e controle todos os envios em massa em andamento
          </p>
        </div>
        <Button variant="outline" onClick={loadJobs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Envios ativos</CardDescription>
            <CardTitle className="text-3xl">{activeCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total registrado</CardDescription>
            <CardTitle className="text-3xl">{jobs.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Atualização automática</CardDescription>
            <CardTitle className="text-3xl">5s</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Histórico</CardTitle>
            <div className="flex gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="cobranca">Cobrança</SelectItem>
                  <SelectItem value="mass_message">SendFlow</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Apenas ativos</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="running">Em andamento</SelectItem>
                  <SelectItem value="paused">Pausados</SelectItem>
                  <SelectItem value="completed">Concluídos</SelectItem>
                  <SelectItem value="cancelled">Cancelados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && jobs.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              Nenhum envio encontrado com os filtros atuais.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((job) => {
                const pct = job.total_items > 0 ? Math.round((job.processed_items / job.total_items) * 100) : 0;
                const stale = isStale(job);
                return (
                  <div
                    key={job.id}
                    className="border rounded-xl p-4 flex flex-col gap-3 hover:bg-muted/30 transition"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={STATUS_COLORS[job.status] || ''}>
                          {job.status.toUpperCase()}
                        </Badge>
                        {stale && (
                          <Badge variant="outline" className="border-yellow-500 text-yellow-700">
                            SEM RESPOSTA
                          </Badge>
                        )}
                        <span className="font-medium">
                          {TYPE_LABEL[job.job_type] || job.job_type}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          ID: {job.id.slice(0, 8)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {['running', 'paused'].includes(job.status) && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => pauseResumeJob(job)}>
                              {job.status === 'paused' ? '▶ Retomar' : '⏸ Pausar'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-destructive/40 text-destructive hover:bg-destructive/10"
                              onClick={() => cancelJob(job)}
                            >
                              <XIcon className="w-3 h-3 mr-1" /> Cancelar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">
                          {job.processed_items} de {job.total_items} processados
                        </span>
                        <span className="font-medium">{pct}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      {job.started_at && (
                        <span>
                          Iniciado: {format(new Date(job.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      )}
                      <span>
                        Atualizado: {format(new Date(job.updated_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                      </span>
                      {job.error_message && (
                        <span className="text-destructive">Erro: {job.error_message}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
