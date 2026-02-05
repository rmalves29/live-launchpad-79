import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Radio, Clock, Pause, XCircle, Timer, Play, AlertTriangle, CheckCircle2, Package, Users, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';

interface SendingJob {
  id: string;
  job_type: 'sendflow' | 'mass_message';
  status: 'running' | 'paused' | 'completed' | 'cancelled' | 'error';
  total_items: number;
  processed_items: number;
  current_index: number;
  job_data: {
    sentMessages?: number;
    errorMessages?: number;
    productIds?: number[];
    groupIds?: string[];
    countdownSeconds?: number;
    isWaitingForNextProduct?: boolean;
    messageTemplate?: string;
    perGroupDelaySeconds?: number;
    perProductDelayMinutes?: number;
    useRandomDelay?: boolean;
    minGroupDelaySeconds?: number;
    maxGroupDelaySeconds?: number;
    nextTaskId?: string;
  };
  error_message?: string;
  started_at: string;
  updated_at: string;
}

interface SendFlowTask {
  id: string;
  job_id: string;
  product_id: number;
  product_code: string;
  group_id: string;
  group_name: string;
  sequence: number;
  status: string;
  error_message?: string;
  completed_at?: string;
}

interface SendingProgressLiveProps {
  jobType?: 'sendflow' | 'mass_message';
  onResumeJob?: (job: SendingJob) => void;
}

export default function SendingProgressLive({ jobType, onResumeJob }: SendingProgressLiveProps) {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [activeJob, setActiveJob] = useState<SendingJob | null>(null);
  const [tasks, setTasks] = useState<SendFlowTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<'pause' | 'cancel' | 'resume' | null>(null);

  // Local countdown state
  const [localCountdown, setLocalCountdown] = useState(0);
  const [isWaiting, setIsWaiting] = useState(false);

  // Stuck detection
  const [isJobStuck, setIsJobStuck] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (!isWaiting || localCountdown <= 0) return;
    const interval = setInterval(() => {
      setLocalCountdown(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isWaiting, localCountdown]);

  // Sync countdown from server
  useEffect(() => {
    if (activeJob?.job_data) {
      const serverCountdown = activeJob.job_data.countdownSeconds || 0;
      const serverIsWaitingProduct = activeJob.job_data.isWaitingForNextProduct || false;
      const serverIsWaitingGroup = activeJob.job_data.isWaitingForNextGroup || false;
      setIsWaiting(serverIsWaitingProduct || serverIsWaitingGroup);
      if (serverCountdown > localCountdown || serverCountdown === 0) {
        setLocalCountdown(serverCountdown);
      }
    }
  }, [activeJob?.job_data?.countdownSeconds, activeJob?.job_data?.isWaitingForNextProduct, activeJob?.job_data?.isWaitingForNextGroup]);

  // Check if job is stuck
  useEffect(() => {
    if (!activeJob) { setIsJobStuck(false); return; }
    const checkIfStuck = () => {
      const lastUpdate = new Date(activeJob.updated_at).getTime();
      setIsJobStuck(Date.now() - lastUpdate > 30000);
    };
    checkIfStuck();
    const interval = setInterval(checkIfStuck, 5000);
    return () => clearInterval(interval);
  }, [activeJob?.updated_at]);

  // Fetch tasks for active job
  const fetchTasks = useCallback(async (jobId: string) => {
    const { data, error } = await supabase
      .from('sendflow_tasks')
      .select('*')
      .eq('job_id', jobId)
      .order('sequence', { ascending: true });

    if (!error && data) {
      setTasks(data as SendFlowTask[]);
    }
  }, []);

  const handlePauseJob = async () => {
    if (!activeJob) return;
    setActionLoading('pause');
    try {
      const { error } = await supabase
        .from('sending_jobs')
        .update({ status: 'paused', paused_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', activeJob.id);
      if (error) throw error;
      toast({ title: 'Envio pausado', description: 'O envio foi pausado e pode ser retomado.' });
      setActiveJob(null);
    } catch (error: any) {
      toast({ title: 'Erro ao pausar', description: error?.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelJob = async () => {
    if (!activeJob) return;
    setActionLoading('cancel');
    try {
      const { error } = await supabase
        .from('sending_jobs')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', activeJob.id);
      if (error) throw error;
      // Cancel pending tasks
      await supabase
        .from('sendflow_tasks')
        .update({ status: 'cancelled' } as any)
        .eq('job_id', activeJob.id)
        .eq('status', 'pending');
      toast({ title: 'Envio cancelado', description: 'O envio foi cancelado permanentemente.' });
      setActiveJob(null);
    } catch (error: any) {
      toast({ title: 'Erro ao cancelar', description: error?.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResumeStuckJob = useCallback(async () => {
    if (!activeJob || !onResumeJob) return;
    setActionLoading('resume');
    try {
      const { error } = await supabase
        .from('sending_jobs')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', activeJob.id);
      if (error) throw error;
      toast({ title: 'Retomando envio...', description: 'O envio será continuado de onde parou.' });
      onResumeJob(activeJob);
      setActiveJob(null);
    } catch (error: any) {
      toast({ title: 'Erro ao retomar', description: error?.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  }, [activeJob, onResumeJob, toast]);

  const isJobStale = (job: SendingJob): boolean => {
    return Date.now() - new Date(job.updated_at).getTime() > 5 * 60 * 1000;
  };

  const markJobAsAbandoned = async (jobId: string) => {
    try {
      await supabase
        .from('sending_jobs')
        .update({ status: 'paused', error_message: 'Envio abandonado - sem atividade por mais de 5 minutos', paused_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', jobId);
    } catch (error) {
      console.error('Erro ao marcar job como abandonado:', error);
    }
  };

  // Fetch active job
  useEffect(() => {
    if (!tenant?.id) return;
    const fetchActiveJob = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('sending_jobs')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('status', 'running')
          .order('started_at', { ascending: false })
          .limit(1);
        if (jobType) query = query.eq('job_type', jobType);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (data) {
          const job = data as SendingJob;
          if (isJobStale(job)) {
            await markJobAsAbandoned(job.id);
            setActiveJob(null);
          } else {
            setActiveJob(job);
            fetchTasks(job.id);
          }
        } else {
          setActiveJob(null);
        }
      } catch (error) {
        console.error('Erro ao buscar job ativo:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchActiveJob();
  }, [tenant?.id, jobType, fetchTasks]);

  // Real-time subscription for job updates
  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel('sending-jobs-live')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sending_jobs',
        filter: `tenant_id=eq.${tenant.id}`,
      }, async (payload) => {
        const job = payload.new as SendingJob;
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (job.status === 'running') {
            if (!jobType || job.job_type === jobType) {
              if (isJobStale(job)) {
                await markJobAsAbandoned(job.id);
                if (activeJob?.id === job.id) setActiveJob(null);
              } else {
                setActiveJob(job);
                setIsJobStuck(false);
              }
            }
          } else if (activeJob?.id === job.id) {
            setActiveJob(null);
          }
        }
        if (payload.eventType === 'DELETE' && payload.old) {
          if (activeJob?.id === (payload.old as SendingJob).id) setActiveJob(null);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, jobType, activeJob?.id]);

  // Real-time subscription for task updates
  useEffect(() => {
    if (!activeJob?.id) return;
    const channel = supabase
      .channel(`sendflow-tasks-${activeJob.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sendflow_tasks',
        filter: `job_id=eq.${activeJob.id}`,
      }, () => {
        // Refetch tasks on any change
        fetchTasks(activeJob.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeJob?.id, fetchTasks]);

  if (loading || !activeJob) return null;

  const completedTasks = tasks.filter(t => t.status === 'completed');
  const skippedTasks = tasks.filter(t => t.status === 'skipped');
  const errorTasks = tasks.filter(t => t.status === 'error');
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const runningTask = tasks.find(t => t.status === 'running');
  const nextPendingTask = pendingTasks[0];

  const totalTasks = tasks.length;
  const processedCount = completedTasks.length + skippedTasks.length + errorTasks.length;
  const progress = totalTasks > 0 ? (processedCount / totalTasks) * 100 : 0;

  const sentMessages = activeJob.job_data?.sentMessages || 0;
  const errorMessages = activeJob.job_data?.errorMessages || 0;

  const countdownMinutes = Math.floor(localCountdown / 60);
  const countdownSecs = localCountdown % 60;

  const startedAt = new Date(activeJob.started_at);
  const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  const elapsedMinutes = Math.floor(elapsed / 60);
  const elapsedSeconds = elapsed % 60;

  // Find next action display
  const currentTask = runningTask || nextPendingTask;
  const currentProductCode = currentTask?.product_code || '—';
  const currentGroupName = currentTask?.group_name || '—';

  // Unique products in tasks for progress
  const uniqueProducts = [...new Set(tasks.map(t => t.product_id))];
  const completedProducts = uniqueProducts.filter(pid => {
    const productTasks = tasks.filter(t => t.product_id === pid);
    return productTasks.every(t => ['completed', 'skipped', 'error'].includes(t.status));
  });

  const showStuckWarning = isJobStuck && onResumeJob;

  return (
    <Card className={`animate-fade-in ${showStuckWarning ? 'border-warning bg-warning/5' : 'border-success bg-success/5'}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {showStuckWarning ? (
              <>
                <AlertTriangle className="h-5 w-5 text-warning" />
                <CardTitle className="text-lg">Envio Interrompido</CardTitle>
              </>
            ) : (
              <>
                <div className="relative">
                  <Radio className="h-5 w-5 text-success" />
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
                  </span>
                </div>
                <CardTitle className="text-lg">Envio em Andamento</CardTitle>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-success/10 text-success border-success/30">
              SendFlow
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {elapsedMinutes}m {elapsedSeconds}s
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stuck warning */}
        {showStuckWarning && (
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">O envio foi interrompido</p>
                <p className="text-xs text-muted-foreground mt-1">
                  A página foi recarregada ou o navegador perdeu conexão. Clique em "Retomar Envio" para continuar.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Progresso Total</span>
            <span className="font-medium">{processedCount} de {totalTasks} tarefas</span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="p-2 rounded bg-background border">
            <div className="text-muted-foreground text-xs flex items-center gap-1">
              <Package className="h-3 w-3" />
              Produtos
            </div>
            <div className="font-semibold">{completedProducts.length} / {uniqueProducts.length}</div>
          </div>
          <div className="p-2 rounded bg-background border">
            <div className="text-muted-foreground text-xs flex items-center gap-1">
              <Users className="h-3 w-3" />
              Tarefas
            </div>
            <div className="font-semibold">{processedCount} / {totalTasks}</div>
          </div>
          <div className="p-2 rounded bg-background border">
            <div className="text-muted-foreground text-xs flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success"></span>
              Enviadas
            </div>
            <div className="font-semibold text-success">{sentMessages}</div>
          </div>
          <div className="p-2 rounded bg-background border">
            <div className="text-muted-foreground text-xs flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-destructive"></span>
              Erros
            </div>
            <div className="font-semibold text-destructive">{errorMessages}</div>
          </div>
        </div>

        {/* Next Action Card */}
        {currentTask && !showStuckWarning && (
          <div className="p-4 rounded-lg bg-success/10 border border-success/30">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="h-4 w-4 text-success" />
              <span className="text-sm font-semibold text-success">
                {runningTask ? 'Enviando Agora' : 'Próximo Envio'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="font-bold text-base">{currentProductCode}</span>
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm truncate max-w-[200px]">{currentGroupName}</span>
              </div>
            </div>
          </div>
        )}

        {/* Countdown Timer */}
        {!showStuckWarning && isWaiting && localCountdown > 0 && (
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-3 px-6 py-3 rounded-xl bg-warning/10 border-2 border-warning/30">
              <Timer className="h-5 w-5 text-warning animate-pulse" />
              <div className="text-center">
                <span className="text-xs text-muted-foreground block">
                  {activeJob?.job_data?.isWaitingForNextProduct ? 'Próximo produto em' : 'Próximo envio em'}
                </span>
                <span className="font-bold text-2xl tabular-nums text-warning">
                  {countdownMinutes}:{countdownSecs.toString().padStart(2, '0')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Activity indicator when not waiting */}
        {!showStuckWarning && !(isWaiting && localCountdown > 0) && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Processando fila de envios...</span>
          </div>
        )}

        {/* Recent Activity Log */}
        {tasks.length > 0 && !showStuckWarning && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Radio className="h-3 w-3" />
              Monitor de Acompanhamento
            </div>
            <div className="max-h-32 overflow-y-auto divide-y">
              {[...tasks]
                .filter(t => ['completed', 'skipped', 'error', 'running'].includes(t.status))
                .sort((a, b) => b.sequence - a.sequence)
                .slice(0, 10)
                .map(task => (
                  <div key={task.id} className="px-3 py-1.5 text-xs flex items-center gap-2">
                    {task.status === 'completed' && <CheckCircle2 className="h-3 w-3 text-success flex-shrink-0" />}
                    {task.status === 'skipped' && <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                    {task.status === 'error' && <XCircle className="h-3 w-3 text-destructive flex-shrink-0" />}
                    {task.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-success flex-shrink-0" />}
                    <span className="font-mono">{task.product_code}</span>
                    <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="truncate">{task.group_name || task.group_id}</span>
                    {task.status === 'skipped' && <Badge variant="outline" className="text-[10px] px-1 py-0">duplicata</Badge>}
                    {task.status === 'error' && <Badge variant="destructive" className="text-[10px] px-1 py-0">erro</Badge>}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-3 pt-2 border-t">
          {showStuckWarning ? (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={handleResumeStuckJob}
                disabled={actionLoading !== null}
                className="gap-2 bg-warning hover:bg-warning/90 text-warning-foreground"
              >
                {actionLoading === 'resume' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Retomar Envio
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelJob}
                disabled={actionLoading !== null}
                className="gap-2"
              >
                {actionLoading === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Cancelar Envio
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePauseJob}
                disabled={actionLoading !== null}
                className="gap-2"
              >
                {actionLoading === 'pause' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                Pausar Envio
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelJob}
                disabled={actionLoading !== null}
                className="gap-2"
              >
                {actionLoading === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Cancelar Envio
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
