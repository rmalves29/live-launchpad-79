/**
 * Tipos TypeScript para Sistema de Integrações Multi-Tenant
 * Mercado Pago e Melhor Envio
 */

// =====================================================
// PAYMENT INTEGRATIONS (Mercado Pago)
// =====================================================

export type PaymentProvider = 'mercado_pago' | 'stripe' | 'paypal';

export interface TenantPaymentIntegration {
  id: string;
  tenant_id: string;
  provider: PaymentProvider;
  
  // Credenciais
  access_token: string | null;
  public_key: string | null;
  refresh_token: string | null;
  
  // Configurações
  config: PaymentConfig;
  
  // Status
  is_active: boolean;
  is_sandbox: boolean;
  
  // Webhooks
  webhook_url: string | null;
  webhook_secret: string | null;
  
  // Metadados
  last_verified_at: string | null;
  error_message: string | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface PaymentConfig {
  notification_url?: string;
  back_urls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
  auto_return?: 'approved' | 'all';
  binary_mode?: boolean;
  statement_descriptor?: string;
  [key: string]: any;
}

// =====================================================
// SHIPPING INTEGRATIONS (Melhor Envio)
// =====================================================

export type ShippingProvider = 'melhor_envio' | 'correios' | 'jadlog' | 'custom';

export interface TenantShippingIntegration {
  id: string;
  tenant_id: string;
  provider: ShippingProvider;
  
  // Credenciais
  api_token: string | null;
  client_id: string | null;
  client_secret: string | null;
  
  // Configurações do remetente
  sender_config: SenderConfig;
  
  // Configurações adicionais
  config: ShippingConfig;
  
  // Status
  is_active: boolean;
  is_sandbox: boolean;
  
  // Saldo
  balance_cents: number;
  
  // Webhooks
  webhook_url: string | null;
  webhook_secret: string | null;
  
  // Metadados
  last_verified_at: string | null;
  error_message: string | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface SenderConfig {
  name?: string;
  phone?: string;
  email?: string;
  document?: string;
  address?: {
    postal_code?: string;
    street?: string;
    number?: string;
    complement?: string;
    district?: string;
    city?: string;
    state?: string;
  };
}

export interface ShippingConfig {
  default_services?: string[];
  insurance_enabled?: boolean;
  own_hand_enabled?: boolean;
  collect_enabled?: boolean;
  [key: string]: any;
}

// =====================================================
// REQUEST/RESPONSE TYPES
// =====================================================

export interface SavePaymentIntegrationRequest {
  provider: PaymentProvider;
  access_token?: string;
  public_key?: string;
  is_sandbox?: boolean;
  config?: PaymentConfig;
}

export interface SaveShippingIntegrationRequest {
  provider: ShippingProvider;
  api_token?: string;
  client_id?: string;
  client_secret?: string;
  is_sandbox?: boolean;
  sender_config?: SenderConfig;
  config?: ShippingConfig;
}

export interface VerifyIntegrationResponse {
  success: boolean;
  message: string;
  data?: {
    user_id?: string;
    email?: string;
    balance?: number;
    [key: string]: any;
  };
}

// =====================================================
// TRANSACTION TYPES
// =====================================================

export type TransactionStatus = 
  | 'pending' 
  | 'processing' 
  | 'approved' 
  | 'rejected' 
  | 'cancelled' 
  | 'refunded' 
  | 'chargeback';

export interface PaymentTransaction {
  id: string;
  tenant_id: string;
  integration_id: string | null;
  external_id: string | null;
  external_status: string | null;
  amount_cents: number;
  currency: string;
  description: string | null;
  order_id: string | null;
  customer_id: string | null;
  status: TransactionStatus;
  metadata: Record<string, any>;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

// =====================================================
// SHIPPING ORDER TYPES
// =====================================================

export type ShippingOrderStatus = 
  | 'pending' 
  | 'quoted' 
  | 'purchased' 
  | 'posted' 
  | 'in_transit' 
  | 'delivered' 
  | 'cancelled' 
  | 'failed';

export interface ShippingOrder {
  id: string;
  tenant_id: string;
  integration_id: string | null;
  external_id: string | null;
  tracking_code: string | null;
  service_name: string | null;
  service_code: string | null;
  price_cents: number | null;
  declared_value_cents: number | null;
  order_id: string | null;
  customer_id: string | null;
  from_address: Record<string, any> | null;
  to_address: Record<string, any>;
  package_info: PackageInfo;
  status: ShippingOrderStatus;
  metadata: Record<string, any>;
  posted_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackageInfo {
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
}

// =====================================================
// INTEGRATION LOGS
// =====================================================

export type IntegrationType = 'payment' | 'shipping' | 'whatsapp';

export interface IntegrationLog {
  id: string;
  tenant_id: string;
  integration_type: IntegrationType;
  integration_id: string | null;
  event_type: string;
  request_data: Record<string, any> | null;
  response_data: Record<string, any> | null;
  error_message: string | null;
  success: boolean;
  http_status: number | null;
  http_method: string | null;
  endpoint: string | null;
  created_at: string;
}
