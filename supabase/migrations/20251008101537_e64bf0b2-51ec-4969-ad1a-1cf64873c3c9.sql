-- Criar tabela de logs de conexão WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_connection_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'qr_generated', 'authenticated', 'ready', 'disconnected', 'error'
  message text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE whatsapp_connection_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Super admin can view all connection logs"
  ON whatsapp_connection_logs
  FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Tenant users can view their connection logs"
  ON whatsapp_connection_logs
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY "System can insert connection logs"
  ON whatsapp_connection_logs
  FOR INSERT
  WITH CHECK (true);

-- Adicionar índice para performance
CREATE INDEX idx_whatsapp_connection_logs_tenant_id ON whatsapp_connection_logs(tenant_id);
CREATE INDEX idx_whatsapp_connection_logs_created_at ON whatsapp_connection_logs(created_at DESC);