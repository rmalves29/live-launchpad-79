
-- Catálogo dos arquivos históricos
CREATE TABLE IF NOT EXISTS public.archive_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  row_count BIGINT NOT NULL DEFAULT 0,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  compressed_size_bytes BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.archive_files TO authenticated;
GRANT ALL ON public.archive_files TO service_role;

ALTER TABLE public.archive_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins podem ver catálogo de arquivos"
  ON public.archive_files FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

CREATE INDEX idx_archive_files_source_period 
  ON public.archive_files(source_table, period_start DESC);

-- RLS no bucket archives
CREATE POLICY "Super admins podem ler arquivos do bucket archives"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'archives' AND public.is_super_admin());

CREATE POLICY "Super admins podem listar arquivos do bucket archives"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'archives' AND public.is_super_admin());
