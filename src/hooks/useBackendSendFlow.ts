import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';

export interface SendFlowJobData {
  productIds: number[];
  groupIds: string[];
  messageTemplate: string;
  perGroupDelaySeconds: number;
  perProductDelayMinutes: number;
  useRandomDelay?: boolean;
  minGroupDelaySeconds?: number;
  maxGroupDelaySeconds?: number;
  sentMessages?: number;
  errorMessages?: number;
}

interface TaskGenerationProduct {
  id: number;
  code: string;
}

interface TaskGenerationGroup {
  id: string;
  name: string;
}

export const useBackendSendFlow = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();

  // Generate sendflow_tasks in the DB for a given job
  const generateTasks = useCallback(async (
    jobId: string,
    tenantId: string,
    products: TaskGenerationProduct[],
    groups: TaskGenerationGroup[],
    orderedProductIds: number[]
  ): Promise<boolean> => {
    const tasks: Array<{
      job_id: string;
      tenant_id: string;
      product_id: number;
      product_code: string;
      group_id: string;
      group_name: string;
      sequence: number;
      status: string;
    }> = [];

    let sequence = 0;

    // Build product map
    const productMap = new Map(products.map(p => [p.id, p]));

    // For each product in order -> for each group
    for (const productId of orderedProductIds) {
      const product = productMap.get(productId);
      if (!product) continue;

      for (const group of groups) {
        tasks.push({
          job_id: jobId,
          tenant_id: tenantId,
          product_id: productId,
          product_code: product.code,
          group_id: group.id,
          group_name: group.name,
          sequence: sequence++,
          status: 'pending',
        });
      }
    }

    if (tasks.length === 0) return false;

    // Insert in batches of 500
    const batchSize = 500;
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      const { error } = await supabase
        .from('sendflow_tasks')
        .insert(batch as any);

      if (error) {
        console.error('[useBackendSendFlow] Error inserting tasks batch:', error);
        return false;
      }
    }

    console.log(`[useBackendSendFlow] Generated ${tasks.length} tasks for job ${jobId}`);
    return true;
  }, []);

  // Start a new SendFlow job with task queue
  const startSendFlowJob = useCallback(async (
    jobData: SendFlowJobData,
    products: TaskGenerationProduct[],
    groups: TaskGenerationGroup[]
  ): Promise<string | null> => {
    if (!tenant?.id) {
      toast({ title: 'Erro', description: 'Tenant não encontrado', variant: 'destructive' });
      return null;
    }

    try {
      // 1. Check WhatsApp connection
      const { data: statusData, error: statusError } = await supabaseTenant.raw.functions.invoke('zapi-proxy', {
        body: { action: 'status', tenant_id: tenant.id }
      });

      if (statusError || !statusData?.connected) {
        toast({
          title: 'WhatsApp não conectado',
          description: 'Conecte o WhatsApp antes de enviar mensagens',
          variant: 'destructive',
          duration: 8000
        });
        return null;
      }

      // 2. Create job
      const totalItems = jobData.productIds.length * jobData.groupIds.length;

      const { data: job, error: jobError } = await supabase
        .from('sending_jobs')
        .insert({
          tenant_id: tenant.id,
          job_type: 'sendflow',
          status: 'running',
          job_data: {
            ...jobData,
            sentMessages: 0,
            errorMessages: 0
          } as any,
          total_items: totalItems,
          processed_items: 0,
          current_index: 0,
          started_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (jobError) throw jobError;

      console.log('[useBackendSendFlow] Job created:', job.id);

      // 3. Generate task queue
      const tasksGenerated = await generateTasks(
        job.id,
        tenant.id,
        products,
        groups,
        jobData.productIds
      );

      if (!tasksGenerated) {
        await supabase
          .from('sending_jobs')
          .update({ status: 'error', error_message: 'Falha ao gerar fila de tarefas', updated_at: new Date().toISOString() })
          .eq('id', job.id);
        toast({ title: 'Erro', description: 'Falha ao gerar fila de tarefas', variant: 'destructive' });
        return null;
      }

      // 4. Trigger edge function
      const { error: invokeError } = await supabase.functions.invoke('sendflow-process', {
        body: { job_id: job.id, tenant_id: tenant.id }
      });

      if (invokeError) {
        await supabase
          .from('sending_jobs')
          .update({
            status: 'error',
            error_message: `Falha ao disparar processamento: ${invokeError.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        toast({ title: 'Erro ao iniciar envio', description: invokeError.message, variant: 'destructive', duration: 8000 });
        return null;
      }

      toast({
        title: '🚀 Envio iniciado!',
        description: `${totalItems} tarefas na fila. Processamento em background.`,
        duration: 8000
      });

      return job.id;
    } catch (error: any) {
      console.error('[useBackendSendFlow] Error:', error);
      toast({ title: 'Erro ao iniciar envio', description: error.message || 'Erro desconhecido', variant: 'destructive' });
      return null;
    }
  }, [tenant?.id, toast, generateTasks]);

  // Resume a paused job
  const resumeSendFlowJob = useCallback(async (jobId: string): Promise<boolean> => {
    if (!tenant?.id) return false;

    try {
      await supabase
        .from('sending_jobs')
        .update({ status: 'running', paused_at: null, updated_at: new Date().toISOString() })
        .eq('id', jobId);

      const { error: invokeError } = await supabase.functions.invoke('sendflow-process', {
        body: { job_id: jobId, tenant_id: tenant.id }
      });

      if (invokeError) {
        toast({ title: 'Erro ao retomar', description: invokeError.message, variant: 'destructive', duration: 8000 });
        return false;
      }

      toast({ title: '▶️ Envio retomado!', description: 'O processamento continua em background.', duration: 5000 });
      return true;
    } catch (error: any) {
      console.error('[useBackendSendFlow] Resume error:', error);
      toast({ title: 'Erro ao retomar', description: error.message || 'Erro desconhecido', variant: 'destructive' });
      return false;
    }
  }, [tenant?.id, toast]);

  // Pause job
  const pauseSendFlowJob = useCallback(async (jobId: string): Promise<boolean> => {
    try {
      await supabase
        .from('sending_jobs')
        .update({ status: 'paused', paused_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', jobId);

      toast({ title: '⏸️ Envio pausado', description: 'O envio foi pausado e pode ser retomado posteriormente.' });
      return true;
    } catch (error: any) {
      console.error('[useBackendSendFlow] Pause error:', error);
      return false;
    }
  }, [toast]);

  // Cancel job
  const cancelSendFlowJob = useCallback(async (jobId: string): Promise<boolean> => {
    try {
      await supabase
        .from('sending_jobs')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', jobId);

      // Also cancel all pending tasks
      await supabase
        .from('sendflow_tasks')
        .update({ status: 'cancelled' } as any)
        .eq('job_id', jobId)
        .eq('status', 'pending');

      toast({ title: '❌ Envio cancelado', description: 'O envio foi cancelado permanentemente.' });
      return true;
    } catch (error: any) {
      console.error('[useBackendSendFlow] Cancel error:', error);
      return false;
    }
  }, [toast]);

  return {
    startSendFlowJob,
    resumeSendFlowJob,
    pauseSendFlowJob,
    cancelSendFlowJob
  };
};
