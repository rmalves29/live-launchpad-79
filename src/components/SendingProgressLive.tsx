import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Radio, Clock, Pause, XCircle, Timer } from 'lucide-react';
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
    currentProductIndex?: number;
    currentGroupIndex?: number;
    productIds?: number[];
    groupIds?: string[];
    countdownSeconds?: number;
    isWaitingForNextProduct?: boolean;
  };
  error_message?: string;
  started_at: string;
  updated_at: string;
}

interface SendingProgressLiveProps {
  jobType?: 'sendflow' | 'mass_message';
}

export default function SendingProgressLive({ jobType }: SendingProgressLiveProps) {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [activeJob, setActiveJob] = useState<SendingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<'pause' | 'cancel' | null>(null);
  
  // Estado local para countdown em tempo real
  const [localCountdown, setLocalCountdown] = useState(0);
  const [isWaiting, setIsWaiting] = useState(false);

  // Efeito para decrementar o countdown localmente a cada segundo
  useEffect(() => {
    if (!isWaiting || localCountdown <= 0) return;
    
    const interval = setInterval(() => {
      setLocalCountdown(prev => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isWaiting, localCountdown]);

  // Sincronizar com dados do banco quando receber atualização
  useEffect(() => {
    if (activeJob?.job_data) {
      const serverCountdown = activeJob.job_data.countdownSeconds || 0;
      const serverIsWaiting = activeJob.job_data.isWaitingForNextProduct || false;
      
      setIsWaiting(serverIsWaiting);
      
      // Só atualizar o countdown local se o servidor tem um valor maior (nova espera)
      // ou se o servidor zerou (acabou a espera)
      if (serverCountdown > localCountdown || serverCountdown === 0) {
        setLocalCountdown(serverCountdown);
      }
    }
  }, [activeJob?.job_data?.countdownSeconds, activeJob?.job_data?.isWaitingForNextProduct]);

  const handlePauseJob = async () => {
    if (!activeJob) return;
    setActionLoading('pause');
    try {
      const { error } = await supabase
        .from('sending_jobs')
        .update({
          status: 'paused',
          paused_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', activeJob.id);

      if (error) throw error;
      
      toast({
        title: 'Envio pausado',
        description: 'O envio foi pausado e pode ser retomado posteriormente.',
      });
      setActiveJob(null);
    } catch (error: any) {
      toast({
        title: 'Erro ao pausar',
        description: error?.message || 'Não foi possível pausar o envio.',
        variant: 'destructive'
      });
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
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', activeJob.id);

      if (error) throw error;
      
      toast({
        title: 'Envio cancelado',
        description: 'O envio foi cancelado permanentemente.',
      });
      setActiveJob(null);
    } catch (error: any) {
      toast({
        title: 'Erro ao cancelar',
        description: error?.message || 'Não foi possível cancelar o envio.',
        variant: 'destructive'
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Verificar se job está "stale" (sem atualização há mais de 5 minutos)
  const isJobStale = (job: SendingJob): boolean => {
    const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutos
    const lastUpdate = new Date(job.updated_at).getTime();
    return Date.now() - lastUpdate > STALE_THRESHOLD_MS;
  };

  // Marcar job stale como abandonado
  const markJobAsAbandoned = async (jobId: string) => {
    try {
      await supabase
        .from('sending_jobs')
        .update({
          status: 'paused',
          error_message: 'Envio abandonado - sem atividade por mais de 5 minutos',
          paused_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
    } catch (error) {
      console.error('Erro ao marcar job como abandonado:', error);
    }
  };

  // Buscar job ativo inicial
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

        if (jobType) {
          query = query.eq('job_type', jobType);
        }

        const { data, error } = await query.maybeSingle();

        if (error) throw error;
        
        if (data) {
          const job = data as SendingJob;
          // Se o job está stale, marcar como abandonado e não mostrar
          if (isJobStale(job)) {
            await markJobAsAbandoned(job.id);
            setActiveJob(null);
          } else {
            setActiveJob(job);
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
  }, [tenant?.id, jobType]);

  // Configurar subscription em tempo real
  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel('sending-jobs-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sending_jobs',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        async (payload) => {
          const job = payload.new as SendingJob;

          // Se é uma atualização ou inserção
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            // Se o job está rodando, verificar se não está stale
            if (job.status === 'running') {
              if (!jobType || job.job_type === jobType) {
                // Verificar se está stale
                if (isJobStale(job)) {
                  await markJobAsAbandoned(job.id);
                  if (activeJob?.id === job.id) {
                    setActiveJob(null);
                  }
                } else {
                  setActiveJob(job);
                }
              }
            } else if (activeJob?.id === job.id) {
              // Se o job que estava ativo mudou de status, remover
              setActiveJob(null);
            }
          }

          // Se foi deletado e era o job ativo
          if (payload.eventType === 'DELETE' && payload.old) {
            const oldJob = payload.old as SendingJob;
            if (activeJob?.id === oldJob.id) {
              setActiveJob(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, jobType, activeJob?.id]);

  if (loading) {
    return null;
  }

  if (!activeJob) {
    return null;
  }

  const progress = activeJob.total_items > 0 
    ? (activeJob.processed_items / activeJob.total_items) * 100 
    : 0;

  const jobTypeLabel = activeJob.job_type === 'sendflow' ? 'SendFlow' : 'Mensagem em Massa';
  const sentMessages = activeJob.job_data?.sentMessages || 0;
  const errorMessages = activeJob.job_data?.errorMessages || 0;
  const totalProducts = activeJob.job_data?.productIds?.length || 0;
  const totalGroups = activeJob.job_data?.groupIds?.length || 0;
  const currentProduct = (activeJob.job_data?.currentProductIndex || 0) + 1;
  const currentGroup = (activeJob.job_data?.currentGroupIndex || 0) + 1;
  // Usar estado local para countdown em tempo real
  const countdownMinutes = Math.floor(localCountdown / 60);
  const countdownSecs = localCountdown % 60;

  const startedAt = new Date(activeJob.started_at);
  const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  const elapsedMinutes = Math.floor(elapsed / 60);
  const elapsedSeconds = elapsed % 60;

  // Calcular estimativa de tempo restante
  const remainingProducts = totalProducts - currentProduct;
  const remainingGroupsThisProduct = totalGroups - currentGroup;
  
  // Estimar tempo baseado no progresso atual
  const processedMessages = sentMessages + errorMessages;
  const avgTimePerMessage = processedMessages > 0 ? elapsed / processedMessages : 3; // 3s default
  const remainingMessages = (remainingProducts * totalGroups) + remainingGroupsThisProduct;
  
  // Adicionar tempo do countdown atual se estiver aguardando próximo produto
  const countdownRemaining = isWaiting ? localCountdown : 0;
  const estimatedRemainingSeconds = Math.ceil((remainingMessages * avgTimePerMessage) + countdownRemaining);
  
  const estimatedHours = Math.floor(estimatedRemainingSeconds / 3600);
  const estimatedMinutes = Math.floor((estimatedRemainingSeconds % 3600) / 60);
  const estimatedSecs = estimatedRemainingSeconds % 60;
  
  const formatEstimatedTime = () => {
    if (estimatedHours > 0) {
      return `${estimatedHours}h ${estimatedMinutes}m`;
    } else if (estimatedMinutes > 0) {
      return `${estimatedMinutes}m ${estimatedSecs}s`;
    } else {
      return `${estimatedSecs}s`;
    }
  };

  return (
    <Card className="border-green-500 bg-green-50 dark:bg-green-950/20 animate-pulse-subtle">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Radio className="h-5 w-5 text-green-600" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
            </div>
            <CardTitle className="text-lg">Envio em Andamento</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-100 dark:bg-green-900/50">
              {jobTypeLabel}
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {elapsedMinutes}m {elapsedSeconds}s
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Progresso Total</span>
            <span className="font-medium">
              {activeJob.processed_items} de {activeJob.total_items}
            </span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="p-2 rounded bg-background border">
            <div className="text-muted-foreground text-xs">Produto Atual</div>
            <div className="font-semibold">{currentProduct} / {totalProducts}</div>
          </div>
          <div className="p-2 rounded bg-background border">
            <div className="text-muted-foreground text-xs">Grupo Atual</div>
            <div className="font-semibold">{currentGroup} / {totalGroups}</div>
          </div>
          <div className="p-2 rounded bg-background border">
            <div className="text-muted-foreground text-xs flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              Enviadas
            </div>
            <div className="font-semibold text-green-600">{sentMessages}</div>
          </div>
          <div className="p-2 rounded bg-background border">
            <div className="text-muted-foreground text-xs flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              Erros
            </div>
            <div className="font-semibold text-red-600">{errorMessages}</div>
          </div>
        </div>

        {/* Tempo estimado restante */}
        {remainingMessages > 0 && (
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">Tempo estimado restante:</span>
              </div>
              <span className="font-bold text-blue-600 dark:text-blue-400 tabular-nums">
                {formatEstimatedTime()}
              </span>
            </div>
            <div className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">
              {remainingProducts > 0 
                ? `Faltam ${remainingProducts} produto${remainingProducts > 1 ? 's' : ''} (${remainingMessages} mensagens)`
                : `Faltam ${remainingGroupsThisProduct} grupo${remainingGroupsThisProduct > 1 ? 's' : ''} neste produto`
              }
            </div>
          </div>
        )}

        {isWaiting && localCountdown > 0 ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
              <Timer className="h-4 w-4 animate-pulse" />
              <span className="font-medium">Próximo produto em:</span>
              <span className="font-bold text-lg tabular-nums">
                {countdownMinutes}:{countdownSecs.toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Enviando mensagens em outro dispositivo...</span>
          </div>
        )}

        <div className="flex items-center justify-center gap-3 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePauseJob}
            disabled={actionLoading !== null}
            className="gap-2"
          >
            {actionLoading === 'pause' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
            Pausar Envio
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleCancelJob}
            disabled={actionLoading !== null}
            className="gap-2"
          >
            {actionLoading === 'cancel' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Cancelar Envio
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
