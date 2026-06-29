-- ============================================================
-- Retenção de whatsapp_messages: tabela de log + cron job
-- Executa todo domingo às 02:00 (horário de Brasília = 05:00 UTC)
-- ============================================================

-- ── 1. Tabela de log de backups ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_messages_backups (
  id                    BIGSERIAL PRIMARY KEY,
  executed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_days        INTEGER     NOT NULL DEFAULT 90,
  cutoff_at             TIMESTAMPTZ NOT NULL,
  rows_exported         INTEGER,
  deleted_rows          INTEGER,
  drive_file_id         TEXT,
  drive_file_name       TEXT,
  drive_file_url        TEXT,
  drive_file_size_bytes BIGINT,
  duration_ms           INTEGER,
  dry_run               BOOLEAN     NOT NULL DEFAULT FALSE,
  success               BOOLEAN     NOT NULL DEFAULT TRUE,
  error_message         TEXT
);

COMMENT ON TABLE whatsapp_messages_backups IS
  'Registro de cada execução do cleanup-whatsapp-messages. '
  'Cada linha representa um chunk exportado para o Google Drive antes da deleção.';

-- Apenas super_admins podem ler (mesma política das outras tabelas de backup)
ALTER TABLE whatsapp_messages_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_whatsapp_backups"
  ON whatsapp_messages_backups
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'super_admin'
    )
  );

-- ── 2. Índice para consultas de monitoramento ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_backups_executed_at
  ON whatsapp_messages_backups (executed_at DESC);

-- ── 3. Cron job via pg_cron ──────────────────────────────────────────────────
-- Requer extensão pg_cron habilitada no projeto Supabase.
-- Dispara todo domingo às 05:00 UTC (02:00 Brasília).
-- A edge function recebe retention_days=90 e dry_run=false por padrão.

SELECT cron.schedule(
  'cleanup-whatsapp-messages-weekly',   -- nome único do job
  '0 5 * * 0',                          -- todo domingo 05:00 UTC
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/cleanup-whatsapp-messages',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{"retention_days": 90, "dry_run": false}'::jsonb
    );
  $$
);
