/**
 * Configuração da API do backend WhatsApp
 * 
 * Prioridade:
 * 1. URL do banco de dados (integration_whatsapp.api_url)
 * 2. Variável de ambiente VITE_API_BASE_URL
 * 3. Fallback vazio (erro)
 */

export const API_CONFIG = {
  /**
   * URL base da API do WhatsApp
   * Configure no Railway: VITE_API_BASE_URL=https://backend-production-2599.up.railway.app
   * Ou internamente: VITE_API_BASE_URL=http://backend-production-2599.railway.internal
   */
  BASE_URL: import.meta.env.VITE_API_BASE_URL || '',
  
  /**
   * Timeout padrão para requisições (ms)
   */
  TIMEOUT: 30000,
  
  /**
   * Endpoints da API
   */
  ENDPOINTS: {
    STATUS: (tenantId: string) => `/status/${tenantId}`,
    QR_CODE: (tenantId: string) => `/qr/${tenantId}`,
    DISCONNECT: (tenantId: string) => `/disconnect/${tenantId}`,
    LIST_GROUPS: '/list-all-groups',
    SENDFLOW_BATCH: '/sendflow-batch',
    SEND_MESSAGE: '/send-message',
  }
};

/**
 * Resolve a URL da API do WhatsApp
 * @param dbUrl - URL do banco de dados (integration_whatsapp.api_url)
 * @returns URL completa da API ou lança erro se não configurada
 */
export function resolveApiUrl(dbUrl?: string | null): string {
  const url = dbUrl || API_CONFIG.BASE_URL;
  
  if (!url) {
    throw new Error(
      'URL da API WhatsApp não configurada. ' +
      'Configure a variável VITE_API_BASE_URL no Railway ou defina api_url no banco de dados.'
    );
  }
  
  return url;
}

/**
 * Cria URL completa para um endpoint
 * @param baseUrl - URL base da API
 * @param endpoint - Caminho do endpoint
 * @returns URL completa
 */
export function buildApiUrl(baseUrl: string, endpoint: string): string {
  return `${baseUrl.replace(/\/$/, '')}${endpoint}`;
}
