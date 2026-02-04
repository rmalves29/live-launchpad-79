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
  currentProductIndex?: number;
  currentGroupIndex?: number;
  sentMessages?: number;
  errorMessages?: number;
}

export const useBackendSendFlow = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();

  // Iniciar job de SendFlow no backend
  const startSendFlowJob = useCallback(async (jobData: SendFlowJobData): Promise<string | null> => {
    if (!tenant?.id) {
      toast({
        title: 'Erro',
        description: 'Tenant não encontrado',
        variant: 'destructive'
      });
      return null;
    }

    try {
      // 1. Verificar conexão WhatsApp
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

      // 2. Criar job no banco com status 'pending'
      const totalItems = jobData.productIds.length * jobData.groupIds.length;
      
      const { data: job, error: jobError } = await supabase
        .from('sending_jobs')
        .insert({
          tenant_id: tenant.id,
          job_type: 'sendflow',
          status: 'running',
          job_data: {
            ...jobData,
            currentProductIndex: 0,
            currentGroupIndex: 0,
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

      // 3. Enfileirar processamento no backend (Edge Function responde 202 e continua em background)
      const { error: invokeError } = await supabase.functions.invoke('sendflow-process', {
        body: {
          job_id: job.id,
          tenant_id: tenant.id,
        }
      });

      if (invokeError) {
        // Se não conseguir disparar a função, marcar job como erro para não ficar “running” sem executar
        await supabase
          .from('sending_jobs')
          .update({
            status: 'error',
            error_message: `Falha ao disparar processamento: ${invokeError.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        toast({
          title: 'Erro ao iniciar envio',
          description: invokeError.message,
          variant: 'destructive',
          duration: 8000,
        });

        return null;
      }

      toast({
        title: '🚀 Envio iniciado!',
        description: 'O processamento está sendo feito em background. Você pode fechar o navegador.',
        duration: 8000
      });

      return job.id;
    } catch (error: any) {
      console.error('[useBackendSendFlow] Error:', error);
      toast({
        title: 'Erro ao iniciar envio',
        description: error.message || 'Erro desconhecido',
        variant: 'destructive'
      });
      return null;
    }
  }, [tenant?.id, toast]);

  // Retomar job pausado no backend
  const resumeSendFlowJob = useCallback(async (jobId: string): Promise<boolean> => {
    if (!tenant?.id) return false;

    try {
      // Marcar como running
      await supabase
        .from('sending_jobs')
        .update({
          status: 'running',
          paused_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      // Disparar Edge Function (resposta rápida + background)
      const { error: invokeError } = await supabase.functions.invoke('sendflow-process', {
        body: {
          job_id: jobId,
          tenant_id: tenant.id,
        }
      });

      if (invokeError) {
        toast({
          title: 'Erro ao retomar',
          description: invokeError.message,
          variant: 'destructive',
          duration: 8000,
        });
        return false;
      }

      toast({
        title: '▶️ Envio retomado!',
        description: 'O processamento continua em background.',
        duration: 5000
      });

      return true;
    } catch (error: any) {
      console.error('[useBackendSendFlow] Resume error:', error);
      toast({
        title: 'Erro ao retomar',
        description: error.message || 'Erro desconhecido',
        variant: 'destructive'
      });
      return false;
    }
  }, [tenant?.id, toast]);

  // Pausar job
  const pauseSendFlowJob = useCallback(async (jobId: string): Promise<boolean> => {
    try {
      await supabase
        .from('sending_jobs')
        .update({
          status: 'paused',
          paused_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      toast({
        title: '⏸️ Envio pausado',
        description: 'O envio foi pausado e pode ser retomado posteriormente.',
      });

      return true;
    } catch (error: any) {
      console.error('[useBackendSendFlow] Pause error:', error);
      return false;
    }
  }, [toast]);

  // Cancelar job
  const cancelSendFlowJob = useCallback(async (jobId: string): Promise<boolean> => {
    try {
      await supabase
        .from('sending_jobs')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);

      toast({
        title: '❌ Envio cancelado',
        description: 'O envio foi cancelado permanentemente.',
      });

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
