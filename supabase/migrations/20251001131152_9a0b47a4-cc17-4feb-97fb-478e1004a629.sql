-- Criar tabela para gerenciar jobs de envio
CREATE TABLE IF NOT EXISTS public.sending_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('sendflow', 'mass_message')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'cancelled', 'error')),
  total_items INTEGER NOT NULL DEFAULT 0,
  processed_items INTEGER NOT NULL DEFAULT 0,
  current_index INTEGER NOT NULL DEFAULT 0,
  job_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  paused_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_sending_jobs_tenant ON public.sending_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sending_jobs_status ON public.sending_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sending_jobs_type ON public.sending_jobs(job_type);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_sending_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sending_jobs_updated_at
BEFORE UPDATE ON public.sending_jobs
FOR EACH ROW
EXECUTE FUNCTION update_sending_jobs_updated_at();

-- RLS Policies
ALTER TABLE public.sending_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage all sending jobs"
ON public.sending_jobs
FOR ALL
USING (is_super_admin());

CREATE POLICY "Tenant users can manage their sending jobs"
ON public.sending_jobs
FOR ALL
USING (tenant_id = get_current_tenant_id());