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
    if (this.currentTenantId !== tenantId) {
      console.log('🏢 [supabaseTenant] Tenant ID alterado:', this.currentTenantId, '→', tenantId);
    }
    this.currentTenantId = tenantId;
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

  // Tabelas COM filtro automático por tenant (aplica filtro após select/update/delete)
  from(table: keyof Database['public']['Tables']) {
    const base = this.client.from(table);

    // Tabelas que NÃO devem ser filtradas por tenant (tabelas globais sem tenant_id)
    // NOTA: 'coupons' e 'gifts' foram REMOVIDOS desta lista - agora são filtrados por tenant_id
    const globalTables = ['tenants', 'profiles', 'app_settings', 'audit_logs', 'webhook_logs', 'mkt_mm', 'phone_fix_jobs', 'phone_fix_changes', 'whatsapp_active_sessions', 'whatsapp_session_conflicts'];

    if (globalTables.includes(table)) {
      return base;
    }

    const tenantId = this.currentTenantId;
    if (!tenantId) {
      console.error(`❌ [supabaseTenant] ERRO CRÍTICO: Query na tabela ${table} sem tenant_id definido! Isso pode causar vazamento de dados.`);
      // Retornar um wrapper que adiciona filtro impossível para evitar vazamento
      const safeWrapper: any = {
        select: (columns?: any, options?: any) => {
          console.error(`❌ [supabaseTenant] SELECT bloqueado em ${table} - tenant_id não definido`);
          return (base as any).select(columns ?? '*', options).eq('tenant_id', '00000000-0000-0000-0000-000000000000');
        },
        update: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'tenant_id não definido' } }) }),
        delete: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'tenant_id não definido' } }) }),
        insert: () => Promise.resolve({ data: null, error: { message: 'tenant_id não definido' } }),
        upsert: () => Promise.resolve({ data: null, error: { message: 'tenant_id não definido' } }),
      };
      return safeWrapper;
    }

    console.log(`🔍 [supabaseTenant] Filtrando ${table} por tenant_id=${tenantId}`);

    const wrapped: any = {
      select: (columns?: any, options?: any) => {
        return (base as any).select(columns ?? '*', options).eq('tenant_id', tenantId);
      },
      update: (values: any) => {
        const query = (base as any).update(values);
        
        // Retornar objeto que adiciona tenant_id no final de qualquer cadeia
        return {
          eq: (column: string, value: any) => {
            // Adiciona o filtro de tenant junto com a condição
            const combined = query.eq(column, value).eq('tenant_id', tenantId);
            return combined;
          },
          in: (column: string, values: any[]) => {
            return query.in(column, values).eq('tenant_id', tenantId);
          },
          neq: (column: string, value: any) => {
            return query.neq(column, value).eq('tenant_id', tenantId);
          },
          select: (cols?: string) => query.eq('tenant_id', tenantId).select(cols),
          then: (resolve?: any, reject?: any) => {
            return query.eq('tenant_id', tenantId).then(resolve, reject);
          },
          catch: (reject: any) => {
            return query.eq('tenant_id', tenantId).catch(reject);
          }
        };
      },
      delete: () => {
        const query = (base as any).delete();
        
        const createChainableDelete = (currentQuery: any): any => {
          return {
            eq: (column: string, value: any) => {
              const newQuery = currentQuery.eq(column, value);
              // Always add tenant filter if not already filtering by tenant_id
              if (column === 'tenant_id') {
                return createChainableDelete(newQuery);
              }
              return createChainableDelete(newQuery.eq('tenant_id', tenantId));
            },
            in: (column: string, values: any[]) => {
              return createChainableDelete(currentQuery.in(column, values).eq('tenant_id', tenantId));
            },
            neq: (column: string, value: any) => {
              return createChainableDelete(currentQuery.neq(column, value).eq('tenant_id', tenantId));
            },
            select: (cols?: string) => currentQuery.eq('tenant_id', tenantId).select(cols),
            then: (resolve?: any, reject?: any) => {
              return currentQuery.then(resolve, reject);
            },
            catch: (reject: any) => {
              return currentQuery.catch(reject);
            }
          };
        };
        
        return createChainableDelete(query);
      },
      upsert: (values: any) => {
        const arr = Array.isArray(values) ? values : [values];
        const withTenant = arr.map((v) => ({ tenant_id: tenantId, ...v }));
        return (base as any).upsert(withTenant);
      },
      insert: (values: any) => {
        const arr = Array.isArray(values) ? values : [values];
        const withTenant = arr.map((v) => ({ tenant_id: tenantId, ...v }));
        return (base as any).insert(withTenant);
      },
    };

    return wrapped;
  }

  // Método para queries que precisam ignorar o filtro de tenant
  fromGlobal(table: keyof Database['public']['Tables']) {
    return this.client.from(table);
  }
}

// Instância única do cliente
export const supabaseTenant = new TenantSupabaseClient();
