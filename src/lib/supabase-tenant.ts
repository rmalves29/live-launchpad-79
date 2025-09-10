import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = "https://hxtbsieodbtzgcvvkeqx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4";

// Cliente Supabase com filtragem automática por tenant
class TenantSupabaseClient {
  private client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    }
  });

  private currentTenantId: string | null = null;

  // Definir tenant atual (chamado pelo TenantProvider)
  setTenantId(tenantId: string | null) {
    this.currentTenantId = tenantId;
    console.log('🏢 Tenant ID definido:', tenantId);
  }

  // Obter tenant atual (útil para inserts no preview ou simulação)
  getTenantId() {
    return this.currentTenantId;
  }

  // Getter para acessar o cliente original (para casos especiais)
  get raw() {
    return this.client;
  }

  // Auth (sem filtro de tenant)
  get auth() {
    return this.client.auth;
  }

  // Functions (sem filtro de tenant)
  get functions() {
    return this.client.functions;
  }

  // Storage (sem filtro de tenant)
  get storage() {
    return this.client.storage;
  }

  // Tabelas COM filtro automático por tenant
  from(table: keyof Database['public']['Tables']) {
    const query = this.client.from(table);

    // Tabelas que NÃO devem ser filtradas por tenant
    const globalTables = ['tenants', 'profiles', 'app_settings', 'audit_logs', 'webhook_logs'];
    
    if (globalTables.includes(table)) {
      return query;
    }

    // Se temos tenant_id, aplicar filtro automaticamente
    if (this.currentTenantId) {
      console.log(`🔍 Aplicando filtro tenant_id=${this.currentTenantId} na tabela ${table}`);
      return (query as any).eq('tenant_id', this.currentTenantId);
    }

    // Sem tenant (site principal): retornar query sem filtro
    // ATENÇÃO: No site principal, pode ser necessário filtrar de outra forma
    console.warn(`⚠️ Query na tabela ${table} sem filtro de tenant (site principal)`);
    return query;
  }

  // Método para queries que precisam ignorar o filtro de tenant
  fromGlobal(table: keyof Database['public']['Tables']) {
    return this.client.from(table);
  }
}

// Instância única do cliente
export const supabaseTenant = new TenantSupabaseClient();