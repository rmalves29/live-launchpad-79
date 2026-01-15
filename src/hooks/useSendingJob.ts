import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';

export interface SendingJobData {
  productIds: number[];
  groupIds: string[];
  messageTemplate: string;
  perGroupDelaySeconds: number;
  perProductDelayMinutes: number;
  currentProductIndex: number;
  currentGroupIndex: number;
  sentMessages: number;
  errorMessages: number;
}

export interface SendingJob {
  id: string;
  job_type: 'sendflow' | 'mass_message';
  status: 'running' | 'paused' | 'completed' | 'cancelled' | 'error';
  total_items: number;
  processed_items: number;
  current_index: number;
  job_data: SendingJobData;
  error_message?: string;
  started_at: string;
  paused_at?: string;
}

export const useSendingJob = () => {
  const { tenant } = useTenant();
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Criar um novo job de envio
  const createJob = useCallback(async (
    jobType: 'sendflow' | 'mass_message',
    jobData: SendingJobData,
    totalItems: number
  ): Promise<string | null> => {
    if (!tenant?.id) return null;

    try {
      const { data, error } = await supabase
        .from('sending_jobs')
        .insert({
          tenant_id: tenant.id,
          job_type: jobType,
          status: 'running',
          job_data: jobData as any,
          total_items: totalItems,
          processed_items: 0,
          current_index: 0,
          started_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) throw error;
      setCurrentJobId(data.id);
      return data.id;
    } catch (error) {
      console.error('Erro ao criar job de envio:', error);
      return null;
    }
  }, [tenant?.id]);

  // Atualizar progresso do job
  const updateProgress = useCallback(async (
    jobId: string,
    processedItems: number,
    currentIndex: number,
    jobData?: Partial<SendingJobData>
  ) => {
    try {
      const updateData: any = {
        processed_items: processedItems,
        current_index: currentIndex,
        updated_at: new Date().toISOString()
      };

      if (jobData) {
        // Buscar job_data atual e mesclar
        const { data: currentJob } = await supabase
          .from('sending_jobs')
          .select('job_data')
          .eq('id', jobId)
          .single();

        if (currentJob) {
          updateData.job_data = { ...currentJob.job_data, ...jobData };
        }
      }

      await supabase
        .from('sending_jobs')
        .update(updateData)
        .eq('id', jobId);
    } catch (error) {
      console.error('Erro ao atualizar progresso:', error);
    }
  }, []);

  // Pausar job (quando sessão expira ou usuário pausa manualmente)
  const pauseJob = useCallback(async (jobId: string, jobData?: SendingJobData) => {
    try {
      const updateData: any = {
        status: 'paused',
        paused_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (jobData) {
        updateData.job_data = jobData;
      }

      await supabase
        .from('sending_jobs')
        .update(updateData)
        .eq('id', jobId);

      setCurrentJobId(null);
    } catch (error) {
      console.error('Erro ao pausar job:', error);
    }
  }, []);

  // Completar job
  const completeJob = useCallback(async (jobId: string) => {
    try {
      await supabase
        .from('sending_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      setCurrentJobId(null);
    } catch (error) {
      console.error('Erro ao completar job:', error);
    }
  }, []);

  // Cancelar job
  const cancelJob = useCallback(async (jobId: string) => {
    try {
      await supabase
        .from('sending_jobs')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      setCurrentJobId(null);
    } catch (error) {
      console.error('Erro ao cancelar job:', error);
    }
  }, []);

  // Buscar job pausado para retomar
  const getPausedJob = useCallback(async (jobType: 'sendflow' | 'mass_message'): Promise<SendingJob | null> => {
    if (!tenant?.id) return null;

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
      return data as SendingJob | null;
    } catch (error) {
      console.error('Erro ao buscar job pausado:', error);
      return null;
    }
  }, [tenant?.id]);

  // Retomar job
  const resumeJob = useCallback(async (jobId: string) => {
    try {
      await supabase
        .from('sending_jobs')
        .update({
          status: 'running',
          paused_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      setCurrentJobId(jobId);
    } catch (error) {
      console.error('Erro ao retomar job:', error);
    }
  }, []);

  return {
    currentJobId,
    createJob,
    updateProgress,
    pauseJob,
    completeJob,
    cancelJob,
    getPausedJob,
    resumeJob
  };
};
