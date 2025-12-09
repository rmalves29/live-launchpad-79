// Tipos para integrações de pagamento (Mercado Pago)
export interface PaymentIntegration {
  id: string;
  tenant_id: string;
  access_token: string | null;
  public_key: string | null;
  client_id: string | null;
  client_secret: string | null;
  webhook_secret: string | null;
  environment: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentIntegrationFormData {
  access_token: string;
  public_key: string;
  client_id?: string;
  client_secret?: string;
  webhook_secret?: string;
  environment: 'sandbox' | 'production';
}

// Tipos para integrações de envio (Melhor Envio)
export interface ShippingIntegration {
  id: string;
  tenant_id: string | null;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  client_id: string | null;
  client_secret: string | null;
  from_cep: string | null;
  sandbox: boolean;
  is_active: boolean;
  expires_at: string | null;
  account_id: number | null;
  company_id: number | null;
  webhook_id: number | null;
  webhook_secret: string | null;
  scope: string | null;
  token_type: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ShippingIntegrationFormData {
  access_token: string;
  from_cep: string;
  sandbox: boolean;
  client_id?: string;
  client_secret?: string;
}

// Helpers
export function getProviderLabel(provider: string): string {
  const labels: Record<string, string> = {
    mercado_pago: 'Mercado Pago',
    melhor_envio: 'Melhor Envio',
  };
  return labels[provider] || provider;
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

// Tipos legados para compatibilidade
export type TenantPaymentIntegration = PaymentIntegration;
export type TenantShippingIntegration = ShippingIntegration;

export interface SavePaymentIntegrationRequest {
  provider?: string;
  access_token?: string;
  public_key?: string;
  is_sandbox?: boolean;
}

export interface SaveShippingIntegrationRequest {
  provider?: string;
  api_token?: string;
  is_sandbox?: boolean;
  sender_config?: {
    name?: string;
    phone?: string;
    email?: string;
  };
}

export interface SenderConfig {
  name: string;
  phone: string;
  email: string;
  document?: string;
  address?: {
    postal_code: string;
    street: string;
    number: string;
    complement?: string;
    district: string;
    city: string;
    state: string;
  };
}
