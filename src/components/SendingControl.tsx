import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Play, Square, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTenant } from '@/hooks/useTenant';

interface SendingJob {
  id: string;
  job_type: 'sendflow' | 'mass_message';
  status: 'running' | 'paused' | 'completed' | 'cancelled' | 'error';
  total_items: number;
  processed_items: number;
  current_index: number;
  job_data: any;
  error_message?: string;
  started_at: string;
  paused_at?: string;
}

interface SendingControlProps {
  jobType: 'sendflow' | 'mass_message';
  onResume?: (job: SendingJob) => void;
}

export default function SendingControl({ jobType, onResume }: SendingControlProps) {
  const { tenant } = useTenant();
  const [pendingJob, setPendingJob] = useState<SendingJob | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkPendingJob();
  }, [tenant?.id, jobType]);

  const checkPendingJob = async () => {
    if (!tenant?.id) return;

    try {
      const { data, error } = await supabase
        .from('sending_jobs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('job_type', jobType)
        .eq('status', 'paused')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setPendingJob(data as SendingJob | null);
    } catch (error) {
      console.error('Erro ao verificar jobs pendentes:', error);
    }
  };

  const handleResume = async () => {
    if (!pendingJob || !onResume) return;

    setLoading(true);
    try {
      // Atualizar status para running
      const { error } = await supabase
        .from('sending_jobs')
        .update({ status: 'running' })
        .eq('id', pendingJob.id);

      if (error) throw error;

      onResume(pendingJob);
      setPendingJob(null);
      toast.success('Retomando envio de onde parou...');
    } catch (error) {
      console.error('Erro ao retomar envio:', error);
      toast.error('Erro ao retomar envio');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!pendingJob) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('sending_jobs')
        .update({ status: 'cancelled' })
        .eq('id', pendingJob.id);

      if (error) throw error;

      setPendingJob(null);
      toast.success('Envio cancelado');
    } catch (error) {
      console.error('Erro ao cancelar envio:', error);
      toast.error('Erro ao cancelar envio');
    } finally {
      setLoading(false);
    }
  };

  if (!pendingJob) return null;

  const progress = pendingJob.total_items > 0 
    ? (pendingJob.processed_items / pendingJob.total_items) * 100 
    : 0;

  const jobTypeLabel = jobType === 'sendflow' ? 'SendFlow' : 'Mensagem em Massa';

  return (
    <Card className="border-orange-500 bg-orange-50 dark:bg-orange-950/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            <CardTitle className="text-lg">Envio Pausado</CardTitle>
          </div>
          <Badge variant="outline" className="bg-orange-100">
            {jobTypeLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span>Progresso</span>
            <span className="font-medium">
              {pendingJob.processed_items} de {pendingJob.total_items}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="text-sm text-muted-foreground">
          <p>Você tem um envio pausado. Deseja continuar de onde parou ou cancelar?</p>
          {pendingJob.paused_at && (
            <p className="mt-1 text-xs">
              Pausado em: {new Date(pendingJob.paused_at).toLocaleString('pt-BR')}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleResume}
            disabled={loading}
            className="flex-1"
          >
            <Play className="h-4 w-4 mr-2" />
            Continuar de Onde Parou
          </Button>
          <Button
            onClick={handleCancel}
            disabled={loading}
            variant="destructive"
            className="flex-1"
          >
            <Square className="h-4 w-4 mr-2" />
            Cancelar Envio
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
