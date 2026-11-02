CREATE TABLE public.prospect_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text,
  nome_loja text,
  segmento text,
  seguidores text,
  evidencia_live text,
  whatsapp text CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]+$'),
  fonte text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','enviado','falhou','descartado','sem_whatsapp')),
  lote_data date,
  aprovado_em timestamptz,
  enviado_em timestamptz,
  arquivado_em timestamptz,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX prospect_leads_handle_uq ON public.prospect_leads (handle) WHERE handle IS NOT NULL;
CREATE UNIQUE INDEX prospect_leads_whatsapp_uq ON public.prospect_leads (whatsapp) WHERE whatsapp IS NOT NULL;
CREATE INDEX prospect_leads_status_idx ON public.prospect_leads (status);
CREATE INDEX prospect_leads_lote_data_idx ON public.prospect_leads (lote_data);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_leads TO authenticated;
GRANT ALL ON public.prospect_leads TO service_role;
ALTER TABLE public.prospect_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin manages prospect leads" ON public.prospect_leads
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE TRIGGER prospect_leads_updated_at BEFORE UPDATE ON public.prospect_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();